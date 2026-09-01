import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  requireUserFromRequest,
  type BusinessContext,
} from "@/lib/business-chat.server";
import {
  getSummary,
  listClients,
  listEmployees,
  listSources,
  listAffiliates,
  comparePeriods,
  projectCashflow,
  createTasks,
} from "@/lib/business-tools";

export const Route = createFileRoute("/api/business-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let ctx: BusinessContext;
        try {
          ctx = await requireUserFromRequest(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Unauthorized", { status: 401 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured for this workspace.", { status: 500 });

        const body = (await request.json()) as { messages?: UIMessage[]; id?: string };
        const messages = body.messages;
        if (!Array.isArray(messages)) return new Response("Bad request", { status: 400 });

        const initialRunId = getLovableAiGatewayRunId(request);
        const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const today = new Date().toISOString().slice(0, 10);

        const system = [
          "You are the Ledgerly business assistant. You answer questions about the signed-in user's own workspace using only the data returned by your tools.",
          "",
          `Today is ${today}.`,
          "",
          "Rules:",
          "- Call one or more tools to fetch real data before answering. Do not invent numbers.",
          "- If the user asks about clients, employees, sources, affiliates, profit, or cashflow, use the matching tool.",
          "- When comparing periods, use compare_periods.",
          "- For projections, use project_cashflow.",
          "- If a tool returns an empty list or insufficient data, say so clearly.",
          "- Use the caller's permissions: if a tool returns no rows or a permission error, explain that you cannot see that data.",
          "- Keep answers concise, cite the numbers you received, and suggest one concrete next step when relevant.",
          "- For follow-up questions, use the same tool filters when appropriate.",
          "",
          "When asked to create tasks, call create_tasks only if you have specific client IDs; otherwise summarize the clients and ask the user to confirm.",
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
            get_summary: tool({
              description: "High-level business summary for a date range: revenue, expenses, profit, FTDs, STDs, withdrawals, activated clients.",
              inputSchema: z.object({
                start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
              }),
              execute: async ({ start, end }) => getSummary(ctx, start, end),
            }),
            list_clients: tool({
              description: "List clients matching filters such as minimum deposit, value tier, neglected status, or days since last contact. Returns up to 50 clients.",
              inputSchema: z.object({
                min_deposit: z.number().optional(),
                max_days_since_contact: z.number().optional(),
                value_tier: z.enum(["whale", "high", "mid", "small", "unrated"]).optional(),
                neglected: z.boolean().optional(),
                limit: z.number().max(50).optional(),
                start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
              }),
              execute: async (filters) => listClients(ctx, filters),
            }),
            list_employees: tool({
              description: "Employee performance metrics (revenue, FTDs, STDs, withdrawals) for a date range.",
              inputSchema: z.object({
                start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
              }),
              execute: async ({ start, end }) => listEmployees(ctx, start, end),
            }),
            list_sources: tool({
              description: "Lead source performance: leads, conversions, spend, revenue, ROI for a date range.",
              inputSchema: z.object({
                start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
              }),
              execute: async ({ start, end }) => listSources(ctx, start, end),
            }),
            list_affiliates: tool({
              description: "List affiliates with their opening balance and CPA rate. RLS may hide commercial terms for non-admins.",
              inputSchema: z.object({}),
              execute: async () => listAffiliates(ctx),
            }),
            compare_periods: tool({
              description: "Compare two date periods side by side.",
              inputSchema: z.object({
                a_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                a_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                b_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                b_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              }),
              execute: async (input) =>
                comparePeriods(
                  ctx,
                  { start: input.a_start, end: input.a_end },
                  { start: input.b_start, end: input.b_end },
                ),
            }),
            project_cashflow: tool({
              description: "Project expected recurring revenue, recurring expenses and payroll over a horizon in days.",
              inputSchema: z.object({ days: z.number().max(365).optional() }),
              execute: async ({ days }) => projectCashflow(ctx, days ?? 90),
            }),
            create_tasks: tool({
              description: "Create the same task for a list of clients (by daily_lead_activations id). Permission-aware: fails if the caller cannot manage tasks.",
              inputSchema: z.object({
                title: z.string().max(200),
                activation_ids: z.array(z.string().uuid()).min(1).max(50),
              }),
              execute: async ({ title, activation_ids }) => createTasks(ctx, title, activation_ids),
            }),
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: false,
        });
      },
    },
  },
});
