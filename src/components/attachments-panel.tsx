/**
 * File attachments for any record.
 *
 * Files land in a private workspace-scoped storage folder; downloads go
 * through short-lived signed links so nothing is publicly reachable.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AttachmentEntity = "client" | "revenue" | "expense" | "employee" | "affiliate";

type Attachment = {
  id: string;
  path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  user_id: string;
  user_email: string | null;
  created_at: string;
};

const BUCKET = "attachments";
const MAX_BYTES = 20 * 1024 * 1024;

function prettySize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  entityType,
  entityId,
  title = "Attachments",
  className,
}: {
  entityType: AttachmentEntity;
  entityId: string;
  title?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const key = ["attachments", entityType, entityId];

  const q = useQuery({
    enabled: !!entityId,
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attachments")
        .select("id,path,filename,mime_type,size_bytes,user_id,user_email,created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES) throw new Error("Files must be 20 MB or smaller");
      const { data: cid, error: cErr } = await supabase.rpc("current_company_id");
      if (cErr) throw cErr;
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${cid}/${entityType}/${entityId}/${Date.now()}-${safe}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("attachments").insert({
        entity_type: entityType,
        entity_id: entityId,
        path,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        user_id: user?.id,
        user_email: user?.email ?? null,
        company_id: cid as any,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File uploaded");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message ?? "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: async (a: Attachment) => {
      await supabase.storage.from(BUCKET).remove([a.path]);
      const { error } = await supabase.from("attachments").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("File removed");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const open = async (a: Attachment) => {
    setBusy(true);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 60);
    setBusy(false);
    if (error || !data?.signedUrl) {
      toast.error("Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const list = q.data ?? [];

  return (
    <div className={cn("rounded-lg border border-border bg-card/40 p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          {title}
          {list.length > 0 && <span className="text-xs text-muted-foreground">({list.length})</span>}
        </h4>
        <Button
          size="sm"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet. Invoices, receipts and contracts go here.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background/60 px-3 py-2"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{a.filename}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {prettySize(a.size_bytes)} · {a.user_email ?? "someone"}
                </div>
              </div>
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={() => open(a)}
                disabled={busy}
                aria-label="Download file"
              >
                <Download className="h-4 w-4" />
              </button>
              {(a.user_id === user?.id || isAdmin) && (
                <button
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove.mutate(a)}
                  aria-label="Delete file"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
