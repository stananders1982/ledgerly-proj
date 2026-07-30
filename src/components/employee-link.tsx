import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** Renders an employee name that links to their employee page when an id is known. */
export function EmployeeLink({
  id,
  name,
  className,
}: {
  id?: string | null;
  name?: string | null;
  className?: string;
}) {
  const label = (name ?? "").trim();
  if (!id || !label || label === "—") {
    return <span className={cn("text-muted-foreground", className)}>{label || "—"}</span>;
  }
  return (
    <Link
      to="/employees/$id"
      params={{ id }}
      onClick={(e) => e.stopPropagation()}
      className={cn("text-primary hover:underline", className)}
    >
      {label}
    </Link>
  );
}
