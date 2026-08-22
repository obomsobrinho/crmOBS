"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

  // Uma linha só, e não rótulo empilhado sobre conteúdo: isto vive na segunda
  // faixa do cabeçalho da conversa, onde sobra largura. Empilhado, ele criava
  // uma quebra de linha com metade da faixa vazia ao lado.
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-rotulo uppercase text-ink-3">Tags</span>
        <Button
          variant="ghost"
          size="none"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0 gap-1 text-legenda font-medium text-ink-2 hover:bg-transparent"
        >
          <Plus size={13} /> Adicionar
        </Button>

        {appliedTags.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {appliedTags.map((t) => (
            <Badge
              key={t.id}
              variant="tag"
              className="bg-surface pl-2 pr-1"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: tagColor(t.color) }}
                aria-hidden
              />
              {t.name}
              <Button
                variant="ghost"
                size="none"
                onClick={() => unapply(t.id)}
                aria-label={`Remover tag ${t.name}`}
                className="rounded-full p-0.5 text-ink-3 hover:bg-danger-surface hover:text-danger-ink"
              >
                  <X size={12} />
                </Button>
              </Badge>
            ))}
          </div>
        ) : (
          !open && (
            <p className="flex min-w-0 items-center gap-1.5 text-apoio text-ink-3">
              <TagIcon size={13} className="shrink-0" /> Nenhuma tag ainda.
            </p>
          )
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-line bg-surface p-2.5">
          {available.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {available.map((t) => (
                <Button
                  key={t.id}
                  variant="ghost"
                  size="none"
                  onClick={() => apply(t.id)}
                  className="gap-1.5 rounded-full border border-line px-2 py-0.5 text-legenda text-ink"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: tagColor(t.color) }}
                    aria-hidden
                  />
                  {t.name}
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              {TAG_COLOR_KEYS.map((c) => (
                <Button
                  key={c}
                  variant="ghost"
                  size="none"
                  onClick={() => setNewColor(c)}
                  aria-label={`Cor ${c}`}
                  className={cn(
                    "h-4 w-4 rounded-full transition-transform hover:bg-transparent",
                    newColor === c && "ring-2 ring-offset-1 ring-offset-surface",
                  )}
                  style={{
                    background: tagColor(c),
                    boxShadow:
                      newColor === c ? `0 0 0 1px ${tagColor(c)}` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <Input
              variant="limpo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createAndApply();
                }
              }}
              placeholder="Nova tag"
              className="w-auto flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-legenda transition-colors"
            />
            <Button
              variant="brand"
              size="none"
              onClick={() => void createAndApply()}
              disabled={!newName.trim()}
              className="rounded-lg px-3 py-1.5 text-apoio font-medium disabled:opacity-50"
            >
              Criar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
