import { useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export type ImportField = { key: string; label: string; required?: boolean; hint?: string };

export type PreviewRow = {
  index: number;
  name: string;
  action: "create" | "update" | "skip";
  crm_id: string | null;
  reason: string;
  fill: string[];
};

export type PreviewResult = {
  rows: PreviewRow[];
  summary: { create: number; update: number; skip: number; total: number };
};

export type ImportMeta = { fileName: string };

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

function autoMatch(header: string, fields: ImportField[]) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const h = norm(header);
  return fields.find((f) => norm(f.key) === h || norm(f.label) === h)?.key ?? "";
}

export function CsvImportDialog({
  title = "Import CSV",
  fields,
  onImport,
  templateName = "template.csv",
}: {
  title?: string;
  fields: ImportField[];
  onImport: (rows: Record<string, string>[]) => Promise<void> | void;
  templateName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setHeaders([]); setData([]); setMapping({}); };

  const mapped = useMemo(() => {
    return data.map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        const field = mapping[h];
        if (field) obj[field] = (r[i] ?? "").trim();
      });
      return obj;
    });
  }, [data, headers, mapping]);

  const missing = fields.filter((f) => f.required && !Object.values(mapping).includes(f.key));

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { toast.error("CSV needs a header row and at least one data row"); return; }
    const [head, ...body] = rows;
    setHeaders(head.map((h) => h.trim()));
    setData(body);
    const m: Record<string, string> = {};
    head.forEach((h) => { const k = autoMatch(h.trim(), fields); if (k) m[h.trim()] = k; });
    setMapping(m);
  };

  const downloadTemplate = () => {
    const csv = fields.map((f) => f.label).join(",") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = templateName; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4" /> Import CSV</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet className="h-4 w-4" /> Choose file
            </Button>
            <Button variant="ghost" onClick={downloadTemplate}>Download template</Button>
            {data.length > 0 && (
              <span className="text-xs text-muted-foreground">{data.length} rows detected</span>
            )}
          </div>

          {headers.length > 0 && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {headers.map((h) => (
                  <div key={h} className="flex items-center gap-2">
                    <Label className="w-1/2 truncate text-xs text-muted-foreground">{h}</Label>
                    <Select
                      value={mapping[h] ?? "_skip"}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === "_skip" ? "" : v }))}
                    >
                      <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_skip">Skip column</SelectItem>
                        {fields.map((f) => (
                          <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {missing.length > 0 && (
                <p className="flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Map required columns: {missing.map((f) => f.label).join(", ")}
                </p>
              )}

              <div className="max-h-64 overflow-auto scroll-slim rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="table-head bg-muted/40 text-left uppercase text-muted-foreground">
                    <tr>{fields.map((f) => <th key={f.key} className="px-3 py-2">{f.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {mapped.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-t border-border/50">
                        {fields.map((f) => <td key={f.key} className="px-3 py-1.5">{r[f.key] ?? ""}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={busy || mapped.length === 0 || missing.length > 0}
            onClick={async () => {
              setBusy(true);
              try {
                await onImport(mapped);
                setOpen(false);
                reset();
              } catch (e: any) {
                toast.error(e?.message ?? "Import failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Importing…" : `Import ${mapped.length} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
