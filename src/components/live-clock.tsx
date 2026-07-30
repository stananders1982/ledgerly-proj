import { useEffect, useState } from "react";

/** Live clock, updates every second. Renders nothing until hydrated to avoid SSR mismatch. */
export function LiveClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return null;

  return (
    <div className={className}>
      <span className="hidden sm:inline text-muted-foreground">
        {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        {" · "}
      </span>
      <span className="num tabular-nums font-medium">
        {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}
