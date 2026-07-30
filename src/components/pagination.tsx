import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function usePagination<T>(items: T[], perPage = 30) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const end = Math.min(start + perPage, totalItems);
  const pageItems = items.slice(start, end);

  return {
    page: safePage,
    setPage,
    perPage,
    pageItems,
    totalPages,
    startItem: totalItems === 0 ? 0 : start + 1,
    endItem: end,
    totalItems,
  };
}

export function TablePagination({
  page,
  setPage,
  totalPages,
  totalItems,
  startItem,
  endItem,
}: {
  page: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  totalPages: number;
  totalItems: number;
  startItem: number;
  endItem: number;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
      <div className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{startItem}–{endItem}</span> of {totalItems}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
