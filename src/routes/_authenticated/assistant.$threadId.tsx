import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { MessageSquarePlus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { AdminAssistantChat } from "@/components/admin-assistant-chat";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant/$threadId")({
  head: () => ({
    meta: [
      { title: "Access Assistant — Ledgerly" },
      { name: "description", content: "Chat with the Ledgerly admin assistant to review and change user access, permissions and roles." },
      { property: "og:title", content: "Access Assistant — Ledgerly" },
      { property: "og:description", content: "Chat with the Ledgerly admin assistant to review and change user access, permissions and roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const { threadId } = useParams({ from: "/_authenticated/assistant/$threadId" });
  const { isAdmin, companyId, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const threadsQ = useQuery({
    queryKey: ["admin-chat-threads"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_chat_threads")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const messagesQ = useQuery({
    queryKey: ["admin-chat-messages", threadId],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_chat_messages")
        .select("id, message_id, role, parts")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.message_id || row.id,
        role: row.role as UIMessage["role"],
        parts: (row.parts ?? []) as UIMessage["parts"],
      })) as UIMessage[];
    },
  });

  const newThread = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("admin_chat_threads")
        .insert({ company_id: companyId!, user_id: user!.id, title: "New chat" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["admin-chat-threads"] });
      navigate({ to: "/assistant/$threadId", params: { threadId: id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not start a conversation"),
  });

  const deleteThread = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_chat_threads").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["admin-chat-threads"] });
      if (id === threadId) navigate({ to: "/assistant" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not delete the conversation"),
  });

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="text-sm text-muted-foreground">The access assistant is available to workspace admins.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-0 gap-4">
      <aside className="hidden w-60 shrink-0 flex-col md:flex">
        <Button className="mb-3 min-h-10 w-full" onClick={() => newThread.mutate()} disabled={newThread.isPending}>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          New chat
        </Button>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {threadsQ.isLoading
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)
            : threadsQ.data?.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
                    t.id === threadId ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                >
                  <button
                    type="button"
                    className="min-h-8 flex-1 truncate text-left"
                    onClick={() => navigate({ to: "/assistant/$threadId", params: { threadId: t.id } })}
                  >
                    {t.title || "New chat"}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete conversation"
                    className="min-h-8 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    onClick={() => deleteThread.mutate(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-card/40">
        {messagesQ.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <AdminAssistantChat
            key={threadId}
            threadId={threadId}
            initialMessages={messagesQ.data ?? []}
            onActivity={() => qc.invalidateQueries({ queryKey: ["admin-chat-threads"] })}
          />
        )}
      </div>
    </div>
  );
}
