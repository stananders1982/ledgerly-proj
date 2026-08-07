import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { MessageCircleQuestion, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askBusinessQuestion } from "@/lib/ask.functions";

const SUGGESTIONS = [
  "Which source made us the most money last month?",
  "How are deposits trending compared to last month?",
  "Which agent brought in the most this month?",
  "What is eating most of our expenses?",
];

/** Ask a question about the business in plain language. */
export function AskBox({
  startIso,
  endIso,
  rangeLabel,
}: { startIso?: string; endIso?: string; rangeLabel?: string } = {}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const ask = useServerFn(askBusinessQuestion);

  const run = useMutation({
    mutationFn: async (q: string) => ask({ data: { question: q, startIso, endIso } }),
    onSuccess: (res) => setAnswer(res.answer),
    onError: (e: any) => setAnswer(e?.message ?? "Something went wrong."),
  });

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || run.isPending) return;
    setQuestion(trimmed);
    setAnswer(null);
    run.mutate(trimmed);
  };

  return (
    <div className="card-surface p-5">
      <h3 className="font-display text-base font-semibold flex items-center gap-2">
        <MessageCircleQuestion className="h-4 w-4 text-primary" /> Ask your data
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {rangeLabel ? `Plain-language questions about ${rangeLabel}.` : "Plain-language questions about the last 6 months."}
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. how much did KK-Leads bring in last month?"
          className="h-9"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0" disabled={run.isPending}>
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {!answer && !run.isPending && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {run.isPending && (
        <p className="mt-3 text-sm text-muted-foreground">Reading your numbers…</p>
      )}

      {answer && !run.isPending && (
        <div className="mt-3 rounded-lg border border-border bg-foreground/[0.02] p-3 text-sm leading-relaxed">
          {answer}
        </div>
      )}
    </div>
  );
}
