import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared wrapper for wide data tables.
 *
 * - always scrolls horizontally (never clips columns)
 * - shows fade edges when there is more content off-screen
 * - `fit` compresses type/padding and lets cells wrap so wide tables fit the viewport
 */
export function TableFrame({
  children,
  fit = false,
  className,
  bordered = true,
  maxHeight,
}: {
  children: ReactNode;
  fit?: boolean;
  className?: string;
  bordered?: boolean;
  maxHeight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 2, right: max > 2 && el.scrollLeft < max - 2 });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [children, fit]);

  return (
    <div className={cn("relative", bordered && "rounded-lg border border-border", className)}>
      <div
        ref={ref}
        data-fit={fit ? "1" : undefined}
        className="overflow-x-auto overflow-y-auto scroll-slim rounded-[inherit]"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {children}
      </div>
      {edges.left && <div className="table-fade-left" aria-hidden />}
      {edges.right && <div className="table-fade-right" aria-hidden />}
    </div>
  );
}
