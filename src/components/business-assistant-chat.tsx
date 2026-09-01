import { useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { toast } from "sonner";
import { Bot, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";

const SUGGESTIONS = [
  "Which affiliate generated the most profitable clients this month?",
  "Show me clients who deposited more than €10k and haven't been contacted in 7 days.",
  "Why did profit fall last month?",
  "Which employees are below their FTD target?",
  "Create a task for all neglected Whale clients.",
  "What are our projected expenses for October?",
  "Compare September vs August.",
];

const CHANGE_TOOLS = new Set(["create_tasks"]);

export function BusinessAssistantChat({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: UIMessage[];
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/business-chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [],
  );

  const { messages, sendMessage, status, addToolResult, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message || "The assistant could not answer"),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, status]);

  const busy = status === "submitted" || status === "streaming";

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    // Decline any pending tool calls that were not confirmed.
    for (const m of messages) {
      for (const part of m.parts) {
        if (!isToolUIPart(part) || part.state !== "input-available") continue;
        const name = getToolName(part) as string;
        if (!CHANGE_TOOLS.has(name)) continue;
        await addToolResult({
          tool: name as never,
          toolCallId: part.toolCallId,
          output: { declined: true, summary: "The user left this action unapproved." } as never,
        });
      }
    }
    await sendMessage({ text: trimmed });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Business assistant</h2>
                <p className="text-sm text-muted-foreground">
                  Ask anything about your clients, employees, sources, affiliates, or cashflow. Answers come straight from your data.
                </p>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="min-h-9 max-w-xs rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, mi) => (
            <Message from={m.role} key={m.id || `msg-${mi}`}>
              <MessageContent>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return m.role === "assistant" ? (
                      <MessageResponse key={i}>{part.text}</MessageResponse>
                    ) : (
                      <span key={i} className="whitespace-pre-wrap">{part.text}</span>
                    );
                  }
                  if (part.type === "tool-invocation") {
                    const name = part.toolInvocation.toolName;
                    return (
                      <Tool key={i}>
                        <ToolHeader>{name.replace(/_/g, " ")}</ToolHeader>
                        <ToolContent>
                          <ToolInput>{JSON.stringify(part.toolInvocation.args)}</ToolInput>
                          {part.toolInvocation.state === "result" && (
                            <ToolOutput>{JSON.stringify(part.toolInvocation.result, null, 2)}</ToolOutput>
                          )}
                        </ToolContent>
                      </Tool>
                    );
                  }
                  if (part.type === "reasoning") {
                    return null;
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {busy && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer />
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-background p-3">
        <PromptInput
          onSubmit={async (text) => {
            await send(text);
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm">
            <PromptInputTextarea ref={inputRef} className="max-h-40 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-3 py-2.5 text-sm outline-none" placeholder="Ask about clients, profit, employees, projections..." />
            <PromptInputSubmit
              className="h-9 w-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              loading={busy}
            >
              <Bot className="h-4 w-4" />
            </PromptInputSubmit>
          </div>
        </PromptInput>
        {busy && (
          <button
            type="button"
            onClick={() => stop()}
            className="mx-auto mt-2 block text-xs text-muted-foreground underline hover:text-foreground"
          >
            Stop generating
          </button>
        )}
      </div>
    </div>
  );
}
