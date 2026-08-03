/**
 * Threaded comments for any record.
 *
 * Typing "@" opens an inline picker of teammates; mentioning someone drops a
 * notification in their bell. Authors can edit or delete their own comments;
 * admins can delete any.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/components/activity-feed";
import { cn } from "@/lib/utils";

export type CommentEntity =
  | "client"
  | "revenue"
  | "expense"
  | "employee"
  | "lead_entry"
  | "affiliate";

type Comment = {
  id: string;
  body: string;
  user_id: string;
  user_email: string | null;
  mentions: string[];
  created_at: string;
  updated_at: string;
};

type Person = { id: string; name: string; active: boolean };

export function CommentThread({
  entityType,
  entityId,
  title = "Comments",
  className,
}: {
  entityType: CommentEntity;
  entityId: string;
  title?: string;
  className?: string;
}) {
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionTerm, setMentionTerm] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const key = ["record-comments", entityType, entityId];

  const q = useQuery({
    enabled: !!entityId,
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("record_comments")
        .select("id,body,user_id,user_email,mentions,created_at,updated_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
  });

  const peopleQ = useQuery({
    queryKey: ["employees-directory"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_employees_directory");
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const people = useMemo(
    () => (peopleQ.data ?? []).filter((p) => p.active !== false),
    [peopleQ.data],
  );

  const suggestions = useMemo(() => {
    const t = mentionTerm.toLowerCase();
    return people.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 6);
  }, [people, mentionTerm]);

  const mentionedIds = (text: string) =>
    people.filter((p) => text.toLowerCase().includes(`@${p.name.toLowerCase()}`)).map((p) => p.id);

  const add = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) return;
      const mentions = mentionedIds(text);
      const { data: cid } = await supabase.rpc("current_company_id");
      const { error } = await supabase.from("record_comments").insert({
        entity_type: entityType,
        entity_id: entityId,
        body: text,
        mentions,
        user_id: user?.id,
        user_email: user?.email ?? null,
        company_id: cid as any,
      } as any);
      if (error) throw error;

      // Ping every mentioned teammate.
      for (const p of people.filter((x) => mentions.includes(x.id))) {
        await supabase.from("notifications").insert({
          type: "mention",
          title: `${user?.email ?? "Someone"} mentioned ${p.name}`,
          body: text.slice(0, 180),
          company_id: cid as any,
        } as any);
      }
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not post comment"),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await supabase
        .from("record_comments")
        .update({ body: editBody.trim(), mentions: mentionedIds(editBody) })
        .eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("record_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast.error(e.message),
  });

  const onBodyChange = (v: string) => {
    setBody(v);
    const upto = v.slice(0, taRef.current?.selectionStart ?? v.length);
    const m = /@([\p{L}\p{N} ]{0,20})$/u.exec(upto);
    if (m) {
      setMentionTerm(m[1] ?? "");
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (name: string) => {
    setBody((prev) => prev.replace(/@([\p{L}\p{N} ]{0,20})$/u, `@${name} `));
    setMentionOpen(false);
    taRef.current?.focus();
  };

  const renderBody = (text: string) => {
    const names = people.map((p) => p.name).filter(Boolean);
    if (!names.length) return text;
    const re = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    const parts = text.split(re);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <span key={i} className="rounded bg-primary/15 px-1 font-medium text-primary">
          @{part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  const list = q.data ?? [];

  return (
    <div className={cn("rounded-lg border border-border bg-card/40 p-4", className)}>
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        {title}
        {list.length > 0 && <span className="text-xs text-muted-foreground">({list.length})</span>}
      </h4>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {list.map((c) => {
            const mine = c.user_id === user?.id;
            return (
              <li key={c.id} className="rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.user_email ?? "Someone"}</span>
                  <span>{relativeTime(c.created_at)}</span>
                  {c.updated_at !== c.created_at && <span>· edited</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {mine && (
                      <button
                        className="hover:text-foreground"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditBody(c.body);
                        }}
                        aria-label="Edit comment"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(mine || isAdmin) && (
                      <button
                        className="hover:text-destructive"
                        onClick={() => remove.mutate(c.id)}
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
                {editingId === c.id ? (
                  <div className="mt-2 space-y-2">
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{renderBody(c.body)}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative">
        <Textarea
          ref={taRef}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Write a comment… use @ to mention a teammate"
          rows={2}
        />
        {mentionOpen && suggestions.length > 0 && (
          <div className="absolute bottom-full z-20 mb-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            {suggestions.map((p) => (
              <button
                key={p.id}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => insertMention(p.name)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => add.mutate()} disabled={!body.trim() || add.isPending}>
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
