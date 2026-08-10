import { useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ChangeProposalCard, type ChangeToolName } from "@/components/admin-assistant-tool-cards";
import assistantLogo from "@/assets/admin-assistant.png";

const CHANGE_TOOLS: ChangeToolName[] = ["set_page_access", "set_action_permission", "set_role", "copy_access"];

const SUGGESTIONS = [
  "Who can see the Income page?",
  "Give Alex the same access as Jack",
  "Make Jack a manager",
  "Revoke export for the agents",
];

export function AdminAssistantChat({
  threadId,
  initialMessages,
  onActivity,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  onActivity?: () => void;
}) {
  const { companyId } = useAuth();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/admin-chat",
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
    onFinish: () => onActivity?.(),
    onError: (e) => toast.error(e.message || "The assistant could not answer"),
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, status]);

  const busy = status === "submitted" || status === "streaming";

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    // Any proposal the admin left untouched counts as discarded, otherwise the
    // conversation would carry a tool call with no result.
    for (const m of messages) {
      for (const part of m.parts) {
        if (!isToolUIPart(part) || part.state !== "input-available") continue;
        const name = getToolName(part) as string;
        if (!CHANGE_TOOLS.includes(name as ChangeToolName)) continue;
        await addToolResult({
          tool: name as never,
          toolCallId: part.toolCallId,
          output: { declined: true, summary: "The admin left this change unapproved." } as never,
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
              <img src={assistantLogo} alt="Admin assistant" width={512} height={512} loading="lazy" className="h-14 w-14" />
              <div>
                <h2 className="text-lg font-semibold">Access assistant</h2>
                <p className="text-sm text-muted-foreground">
                  Ask about who can access what, or tell me the change you want. Nothing is saved until you press Apply.
                </p>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="min-h-9 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <Message from={m.role} key={m.id}>
              <MessageContent>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return m.role === "assistant" ? (
                      <MessageResponse key={i}>{part.text}</MessageResponse>
                    ) : (
                      <span key={i} className="whitespace-pre-wrap">{part.text}</span>
                    );
                  }

                  if (isToolUIPart(part)) {
                    const name = getToolName(part) as string;
                    if (CHANGE_TOOLS.includes(name as ChangeToolName)) {
                      if (part.state === "input-streaming") return null;
                      return (
                        <ChangeProposalCard
                          key={part.toolCallId}
                          tool={name as ChangeToolName}
                          input={part.input}
                          companyId={companyId!}
                          output={part.state === "output-available" ? (part.output as any) : undefined}
                          onResult={async (output) => {
                            await addToolResult({
                              tool: name as never,
                              toolCallId: part.toolCallId,
                              output: output as never,
                            });
                            onActivity?.();
                            await sendMessage();
                          }}
                        />
                      );
                    }
                    return (
                      <Tool defaultOpen={false} key={part.toolCallId}>
                        <ToolHeader type={part.type as `tool-${string}`} state={part.state} title={name.replace(/_/g, " ")} />
                        <ToolContent>
                          <ToolInput input={part.input} />
                          {"output" in part && part.output ? (
                            <ToolOutput output={<pre className="overflow-x-auto text-xs">{JSON.stringify(part.output, null, 2)}</pre>} errorText={undefined} />
                          ) : null}
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && <Shimmer className="text-sm">Thinking...</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl p-4">
        <PromptInput
          onSubmit={(message, event) => {
            event.preventDefault();
            const text = message.text ?? "";
            if (text.trim()) {
              void send(text);
              (event.currentTarget as HTMLFormElement).reset();
            }
          }}
        >
          <PromptInputTextarea ref={inputRef} placeholder="e.g. give Alex access to Income and Reports" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          The assistant only changes page access, action permissions and roles — and only after you approve.
        </p>
      </div>
    </div>
  );
}
