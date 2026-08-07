import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { NAV_ITEMS } from "@/lib/nav-items";
import { cn } from "@/lib/utils";

/**
 * Presentation-only bottom tab bar shown on small screens.
 * Shows the first four permitted nav items plus a "More" button that opens
 * the existing sidebar sheet.
 */
export function MobileBottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin, isSuperAdmin, navKeys, permsLoaded } = useAuth();
  const { setOpenMobile } = useSidebar();

  const items = NAV_ITEMS.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (isAdmin) return true;
    if (item.adminOnly) return false;
    if (!permsLoaded) return false;
    return navKeys.has(item.key);
  }).slice(0, 4);

  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => (
          <Link
            key={item.url}
            to={item.url}
            className={cn(
              "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium",
              isActive(item.url) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="truncate">{item.title}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
