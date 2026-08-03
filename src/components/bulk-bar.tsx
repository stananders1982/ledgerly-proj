/**
 * Floating summary bar shown while rows are selected in a table.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function BulkBar({
  count,
  noun,
  summary,
  onClear,
  children,
}: {
  count: number;
  noun: string;
  summary?: ReactNode;
  onClear: () => void;
  children?: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
      <span className="font-medium">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      {summary != null && <span className="text-muted-foreground">{summary}</span>}
      <div className="flex-1" />
      {children}
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
