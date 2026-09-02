import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtDate } from "@/lib/format";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  lead_activation_id: string | null;
  lead_name: string | null;
  amount: number;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const openNotification = (n: Notification) => {
    // Deposit requests go to the approval queue, not the client page.
    if (n.type === "deposit_request") {
      navigate({ to: "/deposit-requests" });
      return;
    }
    if (n.lead_activation_id) {
      navigate({ to: "/activations", search: { client: n.lead_activation_id, name: undefined } });
      return;
    }
    if (n.lead_name) {
      navigate({ to: "/activations", search: { client: undefined, name: n.lead_name } });
      return;
    }
    // Fallback so every notification leads somewhere useful.
    if (n.type === "revenue") navigate({ to: "/revenue" });
    else navigate({ to: "/activations", search: { client: undefined, name: undefined } });
  };

  useEffect(() => {
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const n = payload.new as Notification;
          const opts = {
            description: n.body ?? undefined,
            action: {
              label: n.lead_activation_id || n.lead_name ? "View client" : "View",
              onClick: () => openNotification(n),
            },
            onClick: () => openNotification(n),
            className: "cursor-pointer",
          };
          if (n.type === "revenue" || n.type === "ftd_qualified") toast.success(n.title, opts);
          else toast.warning(n.title, opts);
          qc.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, navigate]);


  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  // Admin-only table: non-admins get no rows and no bell.
  if (q.isError) return null;

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markRead(items.filter((n) => !n.read_at).map((n) => n.id))}
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto scroll-slim">
            {items.map((n) => (
              <button
                key={n.id}
                className={`w-full cursor-pointer border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-muted/50 ${
                  n.read_at ? "opacity-70" : ""
                }`}
                onClick={async () => {
                  await markRead([n.id]);
                  openNotification(n);
                }}
              >
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {fmtDate(n.created_at)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
