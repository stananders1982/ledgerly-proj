import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavorites, type FavoriteEntity } from "@/lib/favorites";

/** Star toggle that pins a record for the current user. */
export function FavoriteStar({
  type,
  id,
  label,
  className,
}: {
  type: FavoriteEntity;
  id: string;
  label?: string | null;
  className?: string;
}) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(type, id);
  return (
    <button
      type="button"
      aria-label={active ? "Unpin" : "Pin"}
      title={active ? "Unpin" : "Pin to favorites"}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:text-amber-500",
        active && "text-amber-500",
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ entity_type: type, entity_id: id, label: label ?? null });
      }}
    >
      <Star className={cn("h-4 w-4", active && "fill-current")} />
    </button>
  );
}
