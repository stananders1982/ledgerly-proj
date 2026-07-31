import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const CLIENT_TAGS = ["VIP", "Follow up", "At risk", "No answer", "Do not call"] as const;
export type ClientTag = (typeof CLIENT_TAGS)[number];

const TONE: Record<string, string> = {
  VIP: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  "Follow up": "border-sky-500/40 text-sky-600 dark:text-sky-400",
  "At risk": "border-rose-500/40 text-rose-600 dark:text-rose-400",
  "No answer": "border-muted-foreground/40 text-muted-foreground",
  "Do not call": "border-destructive/50 text-destructive",
};

export function TagBadges({ tags, className }: { tags?: string[] | null; className?: string }) {
  const list = tags ?? [];
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {list.map((t) => (
        <Badge key={t} variant="outline" className={cn("text-[11px]", TONE[t] ?? "")}>
          {t}
        </Badge>
      ))}
    </span>
  );
}

export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (t: string) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {CLIENT_TAGS.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/40",
            )}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
