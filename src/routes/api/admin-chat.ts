import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  requireAdminFromRequest,
  type AdminContext,
} from "@/lib/admin-chat.server";
import { ASSISTANT_ACTIONS, ASSISTANT_NAV_PAGES } from "@/lib/admin-chat";
import { defaultActionAllowed, defaultNavAllowed } from "@/lib/permission-defaults";

type Member = { id: string; name: string; roleKey: string; isAdmin: boolean };

async function loadMembers(ctx: AdminContext): Promise<Member[]> {
  const [{ data: members }, { data: profiles }, { data: roles }] = await Promise.all([
    ctx.supabase.from("company_users").select("user_id, role_key").eq("company_id", ctx.companyId),
    ctx.supabase.from("profiles").select("id, full_name"),
    ctx.supabase.from("user_roles").select("user_id, role"),
  ]);
  return (members ?? []).map((m) => ({
    id: m.user_id,
    name: profiles?.find((p) => p.id === m.user_id)?.full_name ?? m.user_id.slice(0, 8),
    roleKey: (m as { role_key?: string }).role_key ?? "agent",
    isAdmin: !!roles?.some((r) => r.user_id === m.user_id && r.role === "admin"),
  }));
}

async function accessSnapshot(ctx: AdminContext, member: Member) {
  const [{ data: rolePerms }, { data: overrides }] = await Promise.all([
    ctx.supabase
      .from("role_permissions")
      .select("role_key, nav_key, action_key, allowed")
      .eq("company_id", ctx.companyId)
      .eq("role_key", member.roleKey),
    ctx.supabase
      .from("user_permission_overrides")
      .select("nav_key, action_key, allowed")
      .eq("company_id", ctx.companyId)
      .eq("user_id", member.id),
  ]);

  const resolve = (navKey: string | null, actionKey: string | null) => {
    const ov = (overrides ?? []).find((o) => (o.nav_key ?? null) === navKey && (o.action_key ?? null) === actionKey);
    const rolePerm = (rolePerms ?? []).find(
      (r) => (r.nav_key ?? null) === navKey && (r.action_key ?? null) === actionKey,
    );
    const base = rolePerm
      ? rolePerm.allowed
      : navKey
        ? defaultNavAllowed(member.roleKey, navKey)
        : defaultActionAllowed(member.roleKey, actionKey!);
    return {
      allowed: member.isAdmin ? true : (ov?.allowed ?? base),
      source: member.isAdmin ? "admin" : ov ? "override" : rolePerm ? "role" : "role default",
    };
  };

  return {
    user_id: member.id,
    name: member.name,
    role: member.roleKey,
    is_admin: member.isAdmin,
    pages: ASSISTANT_NAV_PAGES.map((p) => ({ key: p.key, label: p.label, ...resolve(p.key, null) })),
    actions: ASSISTANT_ACTIONS.map((a) => ({ key: a.key, label: a.label, ...resolve(null, a.key) })),
  };
}

export const Route = createFileRoute("/api/admin-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx: AdminContext;
        try {
          ctx = await requireAdminFromRequest(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Unauthorized", { status: 401 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured for this workspace.", { status: 500 });

        const body = (await request.json()) as { messages?: UIMessage[]; id?: string };
        const messages = body.messages;
        const threadId = body.id;
        if (!Array.isArray(messages) || !threadId) return new Response("Bad request", { status: 400 });

        // Only the caller's own thread may be written to.
        const { data: thread } = await ctx.supabase
          .from("admin_chat_threads")
          .select("id, title")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return new Response("Conversation not found", { status: 404 });

        const members = await loadMembers(ctx);
        const roster = members
          .map((m) => `- ${m.name} (id: ${m.id}, role: ${m.roleKey}${m.isAdmin ? ", workspace admin" : ""})`)
          .join("\n");

        const { data: customRoles } = await ctx.supabase.from("custom_roles").select("id, name");
        const roleList = [
          "admin (Admin)",
          "manager (Manager)",
          "agent (Conversion)",
          "retention (Retention)",
          ...(customRoles ?? []).map((r) => `custom:${r.id} (${r.name})`),
        ].join(", ");

        const initialRunId = getLovableAiGatewayRunId(request);
        const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const system = [
          "You are the Ledgerly admin assistant. You help a workspace admin inspect and change access control.",
          "",
          "Scope: page access, action permissions and member roles only. Politely refuse anything else",
          "(creating employees, editing income/expenses, business data changes) and point the admin to the right page.",
          "",
          "Workspace members:",
          roster || "- (no members)",
          "",
          `Available roles: ${roleList}`,
          `Pages: ${ASSISTANT_NAV_PAGES.map((p) => `${p.key} (${p.label})`).join(", ")}`,
          `Actions: ${ASSISTANT_ACTIONS.map((a) => `${a.key} (${a.label})`).join(", ")}`,
          "",
          `The signed-in admin's own user id is ${ctx.userId}. Never propose changing their own role or access.`,
          "Workspace admins always have full access — say so instead of proposing overrides for them.",
          "",
          "Rules:",
          "- Always resolve a name to a user id from the roster before calling a tool. If the name is ambiguous, ask.",
          "- Read current access with the read tools before answering questions about who can do what.",
          "- To change something, call the matching change tool. The admin must confirm it in the UI; never claim a change is done until you receive the tool result.",
          "- Batch related pages or actions into a single tool call.",
          "- Be brief and concrete. Use short markdown lists.",
        ].join("\n");

        const result = streamText({
          model: lovable.responses("openai/gpt-5.6-sol"),
          system,
          messages: await convertToModelMessages(messages),
          stopWhen: stepCountIs(50),
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
          tools: {
            list_members: tool({
              description: "List every member of the workspace with their role.",
              inputSchema: z.object({}),
              execute: async () => ({ members }),
            }),
            get_access: tool({
              description: "Full page and action access for one member, including where each value comes from.",
              inputSchema: z.object({ user_id: z.string() }),
              execute: async ({ user_id }) => {
                const member = members.find((m) => m.id === user_id);
                if (!member) return { error: "Unknown member." };
                return accessSnapshot(ctx, member);
              },
            }),
            compare_access: tool({
              description: "Compare the access of two members side by side.",
              inputSchema: z.object({ user_id_a: z.string(), user_id_b: z.string() }),
              execute: async ({ user_id_a, user_id_b }) => {
                const a = members.find((m) => m.id === user_id_a);
                const b = members.find((m) => m.id === user_id_b);
                if (!a || !b) return { error: "Unknown member." };
                const [sa, sb] = await Promise.all([accessSnapshot(ctx, a), accessSnapshot(ctx, b)]);
                return { a: sa, b: sb };
              },
            }),

            // Change tools have no execute — the admin approves them in the UI.
            set_page_access: tool({
              description: "Grant or revoke page access for one member. Requires admin confirmation.",
              inputSchema: z.object({
                user_id: z.string(),
                user_label: z.string(),
                pages: z.array(z.string()),
                allowed: z.boolean(),
              }),
            }),
            set_action_permission: tool({
              description: "Grant or revoke action permissions for one member. Requires admin confirmation.",
              inputSchema: z.object({
                user_id: z.string(),
                user_label: z.string(),
                actions: z.array(z.string()),
                allowed: z.boolean(),
              }),
            }),
            set_role: tool({
              description: "Change a member's role. Requires admin confirmation.",
              inputSchema: z.object({
                user_id: z.string(),
                user_label: z.string(),
                role_key: z.string(),
                role_label: z.string(),
              }),
            }),
            copy_access: tool({
              description: "Copy one member's role and overrides onto another member. Requires admin confirmation.",
              inputSchema: z.object({
                from_user_id: z.string(),
                from_label: z.string(),
                to_user_id: z.string(),
                to_label: z.string(),
              }),
            }),
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: false,
          onFinish: async ({ responseMessage }) => {
            const last = messages[messages.length - 1];
            // Rewrite the whole transcript: tool approvals resend earlier turns
            // with updated tool outputs, so a per-message upsert would duplicate.
            const all = [...messages, ...(responseMessage ? [responseMessage] : [])];
            const seen = new Set<string>();
            const rows = all
              .map((m, i) => ({ ...m, id: m.id || `${threadId}-${i}` }))
              .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
              .map((m) => ({
                thread_id: threadId,
                company_id: ctx.companyId,
                user_id: ctx.userId,
                role: m.role,
                message_id: m.id,
                parts: m.parts,
              }));
            if (!rows.length) return;

            await ctx.supabase.from("admin_chat_messages").delete().eq("thread_id", threadId);
            const { error } = await ctx.supabase.from("admin_chat_messages").insert(rows as never);
            if (error) console.error("[admin-chat] could not save messages", error);


            const title = thread.title;
            const firstText =
              last?.role === "user"
                ? last.parts.find((p) => p.type === "text")?.text?.slice(0, 60)
                : undefined;
            await ctx.supabase
              .from("admin_chat_threads")
              .update({
                updated_at: new Date().toISOString(),
                ...(title === "New chat" && firstText ? { title: firstText } : {}),
              })
              .eq("id", threadId);
          },
        });
      },
    },
  },
});
