"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  tagColor,
  TAG_COLOR_KEYS,
  type Tag,
} from "@/lib/crm";

// Tags da conversa: aplica/remove rótulos do tenant e cria novos. Escrita direta
// (RLS por tenant). conversationId null (conversa sem linha em conversations)
// desabilita a seção.
export default function ContactTags({
  conversationId,
  clientId,
}: {
  conversationId: number | null;
  clientId: string;
}) {
  const supabase = createClient();
  const [all, setAll] = useState<Tag[]>([]);
  const [applied, setApplied] = useState<number[]>([]);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLOR_KEYS[0]);

  const load = useCallback(async () => {
    if (conversationId == null) return;
    const [{ data: tags }, { data: links }] = await Promise.all([
      supabase.from("tags").select("id, name, color").order("name"),
      supabase
        .from("conversation_tags")
        .select("tag_id")
        .eq("conversation_id", conversationId),
    ]);
    setAll((tags ?? []) as Tag[]);
    setApplied(((links ?? []) as { tag_id: number }[]).map((l) => l.tag_id));
  }, [supabase, conversationId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function apply(tagId: number) {
    if (conversationId == null || applied.includes(tagId)) return;
    setApplied((a) => [...a, tagId]); // otimista
    const { error } = await supabase.from("conversation_tags").insert({
      client_id: clientId,
      conversation_id: conversationId,
      tag_id: tagId,
    });
    if (error) setApplied((a) => a.filter((x) => x !== tagId));
  }

  async function unapply(tagId: number) {
    setApplied((a) => a.filter((x) => x !== tagId));
    const { error } = await supabase
      .from("conversation_tags")
      .delete()
      .eq("conversation_id", conversationId!)
      .eq("tag_id", tagId);
    if (error) setApplied((a) => [...a, tagId]);
  }

  async function createAndApply() {
    const name = newName.trim();
    if (!name || conversationId == null) return;
    const { data, error } = await supabase
      .from("tags")
      .insert({ client_id: clientId, name, color: newColor })
      .select("id, name, color")
      .maybeSingle();
    if (error || !data) return;
    const tag = data as Tag;
    setAll((t) => [...t, tag]);
    setNewName("");
    await apply(tag.id);
  }

  if (conversationId == null) return null;

  const appliedTags = all.filter((t) => applied.includes(t.id));
  const available = all.filter((t) => !applied.includes(t.id));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-dim">
          Tags
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>

      {appliedTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {appliedTags.map((t) => (
            <span
              key={t.id}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-2 pr-1 text-[12px]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: tagColor(t.color) }}
                aria-hidden
              />
              {t.name}
              <button
                type="button"
                onClick={() => unapply(t.id)}
                aria-label={`Remover tag ${t.name}`}
                className="rounded-full p-0.5 text-ink-dim transition-colors hover:bg-[var(--danger-bg)] hover:text-danger"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        !open && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-ink-dim">
            <TagIcon size={13} /> Nenhuma tag ainda.
          </p>
        )
      )}

      {open && (
        <div className="mt-2 rounded-lg border border-line bg-surface p-2.5">
          {available.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {available.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => apply(t.id)}
                  className="flex items-center gap-1.5 rounded-full border border-line py-0.5 px-2 text-[12px] transition-colors hover:bg-[var(--active-bg)]"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: tagColor(t.color) }}
                    aria-hidden
                  />
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              {TAG_COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={`Cor ${c}`}
                  className={`h-4 w-4 rounded-full transition-transform ${
                    newColor === c ? "ring-2 ring-offset-1 ring-offset-surface" : ""
                  }`}
                  style={{ background: tagColor(c), boxShadow: newColor === c ? `0 0 0 1px ${tagColor(c)}` : undefined }}
                />
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createAndApply();
                }
              }}
              placeholder="Nova tag"
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-line-strong"
            />
            <button
              type="button"
              onClick={() => void createAndApply()}
              disabled={!newName.trim()}
              className="btn-primary shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50"
            >
              Criar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
