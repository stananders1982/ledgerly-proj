import { useCallback, useEffect, useState } from "react";
import { Bookmark, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export type SavedView<T> = { id: string; name: string; state: T };

function keyFor(id: string) {
  return `ledgerly-views:${id}`;
}

function read<T>(id: string): SavedView<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(id));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useSavedViews<T>(id: string) {
  const [views, setViews] = useState<SavedView<T>[]>(() => read<T>(id));

  useEffect(() => {
    setViews(read<T>(id));
  }, [id]);

  const persist = useCallback(
    (next: SavedView<T>[]) => {
      setViews(next);
      try {
        window.localStorage.setItem(keyFor(id), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [id],
  );

  return {
    views,
    save: (name: string, state: T) =>
      persist([
        ...read<T>(id).filter((v) => v.name.toLowerCase() !== name.toLowerCase()),
        { id: crypto.randomUUID(), name, state },
      ]),
    remove: (viewId: string) => persist(read<T>(id).filter((v) => v.id !== viewId)),
  };
}

export function SavedViews<T>({
  id,
  state,
  onApply,
  activeName,
}: {
  /** Unique key for this page's views */
  id: string;
  /** Current filter state to snapshot */
  state: T;
  onApply: (state: T) => void;
  activeName?: string;
}) {
  const { views, save, remove } = useSavedViews<T>(id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 font-normal">
          <Bookmark className="h-4 w-4" />
          <span className="truncate max-w-[120px]">{activeName || "Views"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {views.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">No saved views yet.</div>
        )}
        {views.map((v) => (
          <DropdownMenuItem
            key={v.id}
            onSelect={(e) => {
              e.preventDefault();
              onApply(v.state);
              setOpen(false);
            }}
            className="group"
          >
            <span className="truncate">{v.name}</span>
            {activeName === v.name && <Check className="ml-auto h-4 w-4" />}
            <button
              type="button"
              aria-label={`Delete ${v.name}`}
              className="ml-auto opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                remove(v.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="flex items-center gap-1 p-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Save current filters as…"
            className="h-8 text-xs"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 shrink-0"
            aria-label="Save view"
            onClick={() => {
              const trimmed = name.trim();
              if (!trimmed) return;
              save(trimmed, state);
              setName("");
              toast.success(`View "${trimmed}" saved`);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
