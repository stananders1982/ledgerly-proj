import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Widths = Record<string, number>;

function loadWidths(key?: string): Widths {
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`table-widths:${key}`);
    return raw ? (JSON.parse(raw) as Widths) : {};
  } catch {
    return {};
  }
}

function saveWidths(key: string | undefined, w: Widths) {
  if (!key) return;
  try {
    window.localStorage.setItem(`table-widths:${key}`, JSON.stringify(w));
  } catch {
    /* ignore */
  }
}

/** Stable-ish identity for a header cell: its label, falling back to position. */
function colKey(th: HTMLTableCellElement, i: number) {
  const label = (th.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
  return label || `col-${i}`;
}

/**
 * Shared wrapper for wide data tables.
 *
 * - always scrolls horizontally (never clips columns)
 * - shows fade edges when there is more content off-screen
 * - `fit` compresses type/padding and lets cells wrap so wide tables fit the viewport
 * - drag the edge of any header cell to resize that column (persisted per `resizeKey`)
 * - keyboard: arrows/PageUp/PageDown/Home/End scroll, `h` jumps to sort headers,
 *   `f` jumps to the header filters, arrows move between them
 */
export function TableFrame({
  children,
  fit = false,
  className,
  bordered = true,
  maxHeight,
  resizeKey,
}: {
  children: ReactNode;
  fit?: boolean;
  className?: string;
  bordered?: boolean;
  maxHeight?: string;
  /** Enables drag-to-resize columns, persisted in localStorage under this key. */
  resizeKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const widthsRef = useRef<Widths>({});

  useEffect(() => {
    widthsRef.current = loadWidths(resizeKey);
  }, [resizeKey]);

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

  // Drag-to-resize: attach a grab handle to every header cell of the first header row.
  useEffect(() => {
    const root = ref.current;
    if (!root || !resizeKey) return;
    const table = root.querySelector("table");
    const headRow = table?.querySelector("thead tr");
    if (!table || !headRow) return;

    const ths = Array.from(headRow.children) as HTMLTableCellElement[];
    const cleanups: (() => void)[] = [];

    ths.forEach((th, i) => {
      const key = colKey(th, i);
      const saved = widthsRef.current[key];
      if (saved) {
        th.style.width = `${saved}px`;
        th.style.minWidth = `${saved}px`;
        th.style.maxWidth = `${saved}px`;
      }
      if (th.querySelector("[data-resize-handle]")) return;

      const handle = document.createElement("div");
      handle.setAttribute("data-resize-handle", "");
      handle.setAttribute("title", "Drag to resize column (double-click to reset)");
      th.style.position = th.style.position || "relative";
      th.appendChild(handle);

      let startX = 0;
      let startW = 0;

      const onMove = (e: PointerEvent) => {
        const w = Math.max(24, Math.round(startW + (e.clientX - startX)));
        th.style.width = `${w}px`;
        th.style.minWidth = `${w}px`;
        th.style.maxWidth = `${w}px`;
        widthsRef.current[key] = w;
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        saveWidths(resizeKey, widthsRef.current);
      };
      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startW = th.getBoundingClientRect().width;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      };
      const onDouble = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        th.style.width = "";
        th.style.minWidth = "";
        th.style.maxWidth = "";
        delete widthsRef.current[key];
        saveWidths(resizeKey, widthsRef.current);
      };

      handle.addEventListener("pointerdown", onDown);
      handle.addEventListener("dblclick", onDouble);
      cleanups.push(() => {
        handle.removeEventListener("pointerdown", onDown);
        handle.removeEventListener("dblclick", onDouble);
        handle.remove();
      });
    });

    return () => cleanups.forEach((c) => c());
  }, [children, fit, resizeKey]);

  const focusGroup = useCallback((selector: string, dir: 0 | -1 | 1) => {
    const root = ref.current;
    if (!root) return false;
    const items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => el.offsetParent !== null,
    );
    if (!items.length) return false;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? items.indexOf(active) : -1;
    const next = dir === 0 || idx === -1 ? items[0] : items[Math.min(items.length - 1, Math.max(0, idx + dir))];
    next?.focus();
    return true;
  }, []);

  const HEADERS = "thead tr:first-child button";
  const FILTERS = "thead tr:nth-child(2) :is(input, button, [role='combobox'])";

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const active = document.activeElement as HTMLElement | null;
    const inHeaders = !!active?.closest("thead tr:first-child");
    const inFilters = !!active?.closest("thead tr:nth-child(2)");
    const typing =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active?.getAttribute("contenteditable") === "true";

    const step = e.shiftKey ? 300 : 80;

    switch (e.key) {
      case "ArrowRight":
        if (inHeaders) {
          e.preventDefault();
          focusGroup(HEADERS, 1);
        } else if (inFilters && !typing) {
          e.preventDefault();
          focusGroup(FILTERS, 1);
        } else if (!typing) {
          e.preventDefault();
          el.scrollBy({ left: step, behavior: "smooth" });
        }
        return;
      case "ArrowLeft":
        if (inHeaders) {
          e.preventDefault();
          focusGroup(HEADERS, -1);
        } else if (inFilters && !typing) {
          e.preventDefault();
          focusGroup(FILTERS, -1);
        } else if (!typing) {
          e.preventDefault();
          el.scrollBy({ left: -step, behavior: "smooth" });
        }
        return;
      case "ArrowDown":
        if (typing || inHeaders || inFilters) return;
        e.preventDefault();
        el.scrollBy({ top: step, behavior: "smooth" });
        return;
      case "ArrowUp":
        if (typing || inHeaders || inFilters) return;
        e.preventDefault();
        el.scrollBy({ top: -step, behavior: "smooth" });
        return;
      case "PageDown":
        if (typing) return;
        e.preventDefault();
        el.scrollBy({ top: el.clientHeight * 0.9, behavior: "smooth" });
        return;
      case "PageUp":
        if (typing) return;
        e.preventDefault();
        el.scrollBy({ top: -el.clientHeight * 0.9, behavior: "smooth" });
        return;
      case "Home":
        if (typing) return;
        e.preventDefault();
        el.scrollTo({ left: 0, behavior: "smooth" });
        return;
      case "End":
        if (typing) return;
        e.preventDefault();
        el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
        return;
      case "h":
      case "H":
        if (typing) return;
        if (focusGroup(HEADERS, 0)) e.preventDefault();
        return;
      case "f":
      case "F":
        if (typing) return;
        if (focusGroup(FILTERS, 0)) e.preventDefault();
        return;
      case "Escape":
        e.currentTarget.focus();
        return;
      default:
    }
  };

  return (
    <div className={cn("relative", bordered && "rounded-lg border border-border", className)}>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Data table. Arrow keys scroll, H focuses sort headers, F focuses column filters."
        onKeyDown={onKeyDown}
        data-fit={fit ? "1" : undefined}
        data-resizable={resizeKey ? "1" : undefined}
        className="overflow-x-auto overflow-y-auto scroll-slim rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {children}
      </div>
      {edges.left && <div className="table-fade-left" aria-hidden />}
      {edges.right && <div className="table-fade-right" aria-hidden />}
    </div>
  );
}
