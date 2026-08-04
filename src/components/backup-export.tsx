import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Database, Download } from "lucide-react";
import { useCan } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";

/** Tables included in a full workspace backup — one worksheet each. */
const BACKUP_TABLES = [
  "lead_sources",
  "daily_lead_entries",
  "daily_lead_activations",
  "revenue",
  "withdrawals",
  "expenses",
  "expense_categories",
  "recurring_expenses",
  "employees",
  "attendance",
  "affiliates",
  "tasks",
  "activity_log",
] as const;

export function BackupExport() {
  const can = useCan();
  const [busy, setBusy] = useState(false);

  const run = async (format: "xlsx" | "json") => {
    setBusy(true);
    try {
      const dump: Record<string, any[]> = {};
      for (const table of BACKUP_TABLES) {
        try {
          const rows = await fetchAll(() => (supabase as any).from(table).select("*"));
          dump[table] = rows ?? [];
        } catch {
          dump[table] = [];
        }
      }
      const stamp = new Date().toISOString().slice(0, 10);

      if (format === "json") {
        const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ledgerly-backup-${stamp}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        for (const [table, rows] of Object.entries(dump)) {
          const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
          XLSX.utils.book_append_sheet(wb, ws, table.slice(0, 31));
        }
        XLSX.writeFile(wb, `ledgerly-backup-${stamp}.xlsx`);
      }

      const total = Object.values(dump).reduce((s, r) => s + r.length, 0);
      toast.success(`Backup ready — ${total.toLocaleString()} rows`);
    } catch (e: any) {
      toast.error(e.message ?? "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-surface p-5">
      <h2 className="font-display text-base font-semibold flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" /> Backup &amp; export
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Download every record your account can read — leads, clients, income, withdrawals, expenses,
        employees, attendance, affiliates, tasks and the audit log.
      </p>
      {!can("export_data") ? (
        <p className="mt-4 text-sm text-muted-foreground">
          You don&apos;t have permission to export data. Ask an admin to enable it.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run("xlsx")}>
            <Download className="h-4 w-4" /> {busy ? "Preparing…" : "Excel workbook"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => run("json")}>
            <Download className="h-4 w-4" /> JSON snapshot
          </Button>
        </div>
      )}
    </div>
  );
}
