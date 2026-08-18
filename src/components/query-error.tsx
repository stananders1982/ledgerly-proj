import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown instead of a silently empty table when a query fails, so users can see
 * what went wrong and retry without reloading the whole page.
 */
export function QueryError({
  error,
  onRetry,
  title = "Couldn't load this data",
  compact,
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
}) {
  const message =
    (error as { message?: string } | undefined)?.message ??
    "Something went wrong while talking to the server.";
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 ${
        compact ? "py-6" : "py-12"
      }`}
    >
      <div className="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md break-words">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" /> Try again
        </Button>
      )}
    </div>
  );
}
