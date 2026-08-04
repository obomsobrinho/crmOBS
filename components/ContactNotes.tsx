"use client";

import { useCallback, useEffect, useState } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { memberName, type Member } from "@/lib/team";
import type { ConversationNote } from "@/lib/crm";

// Notas internas da conversa (visíveis só ao time, nunca vão ao WhatsApp).
export default function ContactNotes({
  conversationId,
  clientId,
  myUserId,
  members,
}: {
  conversationId: number | null;
  clientId: string;
  myUserId: string;
  members: Member[];
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const authorLabel = useCallback(
    (userId: string | null) => {
      if (!userId) return "Removido";
      if (userId === myUserId) return "Você";
      const m = members.find((x) => x.userId === userId);
      return m ? memberName(m.email) : "Colega";
    },
    [members, myUserId]
  );

  const load = useCallback(async () => {
    if (conversationId == null) return;
    const { data } = await supabase
      .from("conversation_notes")
      .select("id, body, author_user_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });
    setNotes(
      ((data ?? []) as {
        id: number;
        body: string;
        author_user_id: string | null;
        created_at: string;
      }[]).map((n) => ({
        id: n.id,
        body: n.body,
        authorUserId: n.author_user_id,
        createdAt: n.created_at,
      }))
    );
  }, [supabase, conversationId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function add() {
    const body = draft.trim();
    if (!body || conversationId == null) return;
    setSaving(true);
    const { error } = await supabase.from("conversation_notes").insert({
      client_id: clientId,
      conversation_id: conversationId,
      author_user_id: myUserId,
      body,
    });
    setSaving(false);
    if (!error) {
      setDraft("");
      await load();
    }
  }

  async function remove(id: number) {
    setNotes((n) => n.filter((x) => x.id !== id));
    const { error } = await supabase
      .from("conversation_notes")
      .delete()
      .eq("id", id);
    if (error) await load();
  }

  if (conversationId == null) return null;

  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-dim">
        Notas internas
      </div>

      <div className="flex gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void add();
            }
          }}
          rows={2}
          placeholder="Anotar algo sobre este contato…"
          className="min-w-0 flex-1 resize-none rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-line-strong"
        />
      </div>
      <button
        type="button"
        onClick={() => void add()}
        disabled={!draft.trim() || saving}
        className="btn-primary mt-1.5 w-full rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50"
      >
        {saving ? "Salvando…" : "Adicionar nota"}
      </button>

      {notes.length > 0 ? (
        <ul className="mt-2.5 space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="group rounded-lg border border-line bg-[var(--warn-bg)]/40 px-2.5 py-2"
            >
              <div className="whitespace-pre-wrap break-words text-[12.5px] text-ink">
                {n.body}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10.5px] text-ink-dim">
                <span suppressHydrationWarning>
                  {authorLabel(n.authorUserId)} ·{" "}
                  {new Date(n.createdAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label="Remover nota"
                  className="rounded p-0.5 text-ink-dim opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-dim">
          <StickyNote size={13} /> Sem notas ainda.
        </p>
      )}
    </div>
  );
}
