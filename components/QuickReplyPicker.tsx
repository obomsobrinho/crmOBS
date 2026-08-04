"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Zap, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { QuickReply } from "@/lib/crm";

// Respostas rápidas (mensagens prontas por tenant). Botão no composer: abre um
// popover para escolher (insere no campo) e gerenciar (criar/remover). Escrita
// direta (RLS por tenant).
export default function QuickReplyPicker({
  clientId,
  onPick,
}: {
  clientId: string;
  onPick: (body: string) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [managing, setManaging] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("quick_replies")
      .select("id, title, body")
      .order("title");
    setReplies((data ?? []) as QuickReply[]);
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await load();
    })();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function create() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return;
    const { error } = await supabase
      .from("quick_replies")
      .insert({ client_id: clientId, title: t, body: b });
    if (!error) {
      setTitle("");
      setBody("");
      await load();
    }
  }

  async function remove(id: number) {
    setReplies((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase.from("quick_replies").delete().eq("id", id);
    if (error) await load();
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Respostas rápidas"
        aria-expanded={open}
        title="Respostas rápidas"
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg transition-colors ${
          open ? "text-accent" : "text-ink-dim hover:text-ink"
        }`}
      >
        <Zap size={18} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--panel-shadow)]">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              Respostas rápidas
            </span>
            <button
              type="button"
              onClick={() => setManaging((v) => !v)}
              className="text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {managing ? "Concluir" : "Gerenciar"}
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto p-1.5">
            {replies.length === 0 && (
              <p className="px-2 py-3 text-[12.5px] text-ink-dim">
                Nenhuma resposta rápida ainda.
              </p>
            )}
            {replies.map((r) => (
              <div key={r.id} className="flex items-start gap-1">
                <button
                  type="button"
                  disabled={managing}
                  onClick={() => {
                    onPick(r.body);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--active-bg)] disabled:hover:bg-transparent"
                >
                  <div className="truncate text-[13px] font-medium">{r.title}</div>
                  <div className="truncate text-[11.5px] text-ink-dim">{r.body}</div>
                </button>
                {managing && (
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    aria-label={`Remover ${r.title}`}
                    className="mt-1 shrink-0 rounded p-1 text-ink-dim transition-colors hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {managing && (
            <div className="border-t border-line p-2.5">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Atalho (ex.: saudação)"
                className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-line-strong"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                placeholder="Mensagem pronta"
                className="mt-1.5 w-full resize-none rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-line-strong"
              />
              <button
                type="button"
                onClick={() => void create()}
                disabled={!title.trim() || !body.trim()}
                className="btn-primary mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50"
              >
                <Plus size={13} /> Adicionar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
