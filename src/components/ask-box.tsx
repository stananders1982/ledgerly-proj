import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { MessageCircleQuestion, Send, Loader2, Copy, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askBusinessQuestion } from "@/lib/ask.functions";

const SUGGESTIONS = [
  "Summarize sales for this period",
  "What percentage of clients deposited?",
  "Which value tier converts best?",
  "Which source made us the most money last month?",
];

/** Cheap, question-aware next steps — no extra model call. */
function followUpsFor(question: string): string[] {
  const q = question.toLowerCase();
  if (/%|percent|rate/.test(q)) {
    return [
      "Break that percentage down by agent",
      "How does it compare to the previous period?",
      "Which tier has the worst deposit rate?",
    ];
  }
  if (/summar|recap|report|sales|revenue|how did we do/.test(q)) {
    return [
      "What percentage of clients deposited?",
      "Who were the top 5 clients?",
      "How does this compare to the previous period?",
    ];
  }
  if (/agent|retention|conversion|leader/.test(q)) {
    return ["How many STDs did they get?", "What is their deposit rate?", "Summarize sales for this period"];
  }
  return [
    "Summarize sales for this period",
    "What percentage of clients deposited?",
    "Who are the neglected high-value clients?",
  ];
}

type Turn = { question: string; answer: string };

/** Ask a question about the business in plain language. */
export function AskBox({
  startIso,
  endIso,
  rangeLabel,
}: { startIso?: string; endIso?: string; rangeLabel?: string } = {}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [history, setHistory] = useState<Turn[]>([]);
  const [copied, setCopied] = useState(false);
  const ask = useServerFn(askBusinessQuestion);

  const run = useMutation({
    mutationFn: async (q: string) => ask({ data: { question: q, startIso, endIso, history } }),
    onSuccess: (res, q) => {
      setAnswer(res.answer);
      setHistory((h) => [...h, { question: q, answer: res.answer }].slice(-3));
    },
    onError: (e: any) => setAnswer(e?.message ?? "Something went wrong."),
  });

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || run.isPending) return;
    setQuestion(trimmed);
    setAsked(trimmed);
    setAnswer(null);
    setCopied(false);
    run.mutate(trimmed);
  };

  const reset = () => {
    setHistory([]);
    setAnswer(null);
    setAsked(null);
    setQuestion("");
  };

  const lines = (answer ?? "").split("\n").filter((l) => l.trim());

  return (
    <div className="card-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-primary" /> Ask your data
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rangeLabel
              ? `Percentages, sales recaps and client questions about ${rangeLabel}.`
              : "Percentages, sales recaps and client questions about the last 6 months."}
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={reset}>
            <RotateCcw className="mr-1 h-3 w-3" /> New chat
          </Button>
        )}
      </div>

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
          placeholder="e.g. what % of clients deposited this month?"
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

      {run.isPending && <p className="mt-3 text-sm text-muted-foreground">Reading your numbers…</p>}

      {answer && !run.isPending && (
        <>
          <div className="mt-3 rounded-lg border border-border bg-foreground/[0.02] p-3 text-sm leading-relaxed">
            {lines.map((line, i) =>
              /^[-•*]\s/.test(line.trim()) ? (
                <div key={i} className="flex gap-2 pl-1">
                  <span className="text-primary">•</span>
                  <span>{rich(line.trim().replace(/^[-•*]\s/, ""))}</span>
                </div>
              ) : (
                <p key={i} className={i ? "mt-2" : undefined}>
                  {rich(line)}
                </p>
              ),
            )}
            <div className="mt-2 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard?.writeText(answer);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {followUpsFor(asked ?? "").map((s) => (
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
        </>
      )}
    </div>
  );
}
