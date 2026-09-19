"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  tagColor,
  TAG_COLOR_KEYS,
  type Tag,
} from "@/lib/crm";

/**
 * Geometria do chip de tag, medida no desenho aprovado: 23px de altura, 8px de
 * respiro lateral, raio pequeno (o desenho traz 7px, a escala da casa tem 8), e
 * o papel `legenda` em 600.
 *
 * ⚠️ Está em UMA constante porque são DOIS chips com a mesma caixa: a tag
 * aplicada e o "+ tag". Eram a mesma sopa de classe duas vezes, que é
 * exatamente o caso em que a regra da camada base manda extrair.
 * 23px não sai da escala de controle (28/32/36/40) de propósito: aquela escala
 * é de CONTROLE (botão, aba, campo), e isto é um rótulo, que no desenho é
 * deliberadamente menor que qualquer botão da tela.
 */
// `max-w-full` junto com `shrink-0`: o chip não encolhe para caber ao lado de
// outro (ele quebra para a linha de baixo), mas também nunca passa da largura da
// coluna. Sem isso, uma tag de nome longo estoura os 292px e a lateral inteira
// ganha barra de rolagem horizontal.
const CHIP =
  "flex h-[23px] max-w-full shrink-0 items-center rounded-md px-2 text-legenda font-semibold";

// Tags da conversa: aplica/remove rótulos do tenant e cria novos. Escrita direta
// (RLS por tenant). conversationId null (conversa sem linha em conversations)
// desabilita a seção.
//
// ⚠️ MUDOU DE LUGAR EM 18/09/2026: as tags moravam numa SEGUNDA FAIXA do
// cabeçalho da conversa, com um rótulo "TAGS" e um botão "Adicionar" ao lado. No
// desenho aprovado o cabeçalho tem uma linha só e as tags são chips na coluna do
// cliente, logo abaixo dos dois números de contexto, sem rótulo nenhum: chip
// colorido com o nome dentro já diz o que é, e o rótulo só gastava largura numa
// coluna de 292px. A faixa do cabeçalho foi apagada junto, então este componente
// tem UM lugar só e não precisa mais de variante: enquanto ela existiu, o padrão
// dela era "não desenhar nada", que é o tipo de armadilha que faz alguém montar o
// componente e jurar que ele está quebrado.
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

  const ativo = conversationId != null;

  const load = useCallback(async () => {
    if (!ativo || conversationId == null) return;
    const [{ data: tags }, { data: links }] = await Promise.all([
      supabase.from("tags").select("id, name, color").order("name"),
      supabase
        .from("conversation_tags")
        .select("tag_id")
        .eq("conversation_id", conversationId),
    ]);
    setAll((tags ?? []) as Tag[]);
    setApplied(((links ?? []) as { tag_id: number }[]).map((l) => l.tag_id));
  }, [supabase, conversationId, ativo]);

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

  if (!ativo) return null;

  const appliedTags = all.filter((t) => applied.includes(t.id));
  const available = all.filter((t) => !applied.includes(t.id));

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {appliedTags.map((t) => (
          /* Chip na superfície da marca com a tinta da marca (`surface`/`ink`,
             nunca `fill` como tinta), que é o par do desenho.
             ⚠️ O PONTO COLORIDO ficou, e o desenho não tem. O desenho pinta
             todos os chips de roxo porque não modelou cor de tag; aqui a cor é
             DADO: a pessoa escolheu uma para cada rótulo quando criou. Jogar
             isso fora para ganhar fidelidade seria apagar uma escolha do
             usuário. */
          <span
            key={t.id}
            data-slot="painel-tag"
            className={cn(CHIP, "group gap-1.5 bg-brand-surface text-brand-ink")}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tagColor(t.color) }}
              aria-hidden
            />
            <span className="truncate">{t.name}</span>
            {/* O X nasce invisível e aparece no hover, MAS o espaço dele é
                reservado sempre (`w-3`, dentro do fluxo): revelar um botão que
                ocupa largura faria o chip crescer sob o ponteiro e empurrar os
                vizinhos de linha. */}
            <Button
              variant="ghost"
              size="none"
              onClick={() => unapply(t.id)}
              aria-label={`Remover tag ${t.name}`}
              className="w-3 justify-center rounded-sm text-brand-ink opacity-0 transition-opacity hover:bg-transparent hover:text-danger-ink focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X size={11} />
            </Button>
          </span>
        ))}

        {/* "+ tag": chip tracejado, o mesmo tamanho dos outros. É o convite a
            preencher que a casa já usa em `Badge variant="tracejado"`, mas com a
            geometria retangular deste bloco. Era um botão "Adicionar" com ícone,
            ao lado de um rótulo "TAGS". */}
        <Button
          variant="ghost"
          size="none"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            CHIP,
            "border border-dashed border-line-strong text-ink-3 hover:bg-[var(--active-bg)] hover:text-ink-2",
          )}
        >
          + tag
        </Button>
      </div>

      {open && (
        /* O seletor é um bloco DENTRO do cartão, então `bg-bloco` e raio
           interno. Era `bg-raised`, a mesma cor da coluna: sobre a lateral ele
           ficava sem caixa nenhuma, e só a borda dizia onde começava. */
        <div className="rounded-lg border border-line bg-bloco p-2.5">
          {available.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {available.map((t) => (
                <Button
                  key={t.id}
                  variant="ghost"
                  size="none"
                  onClick={() => apply(t.id)}
                  className={cn(
                    CHIP,
                    "gap-1.5 border border-line bg-raised text-ink hover:bg-[var(--active-bg)]",
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: tagColor(t.color) }}
                    aria-hidden
                  />
                  {t.name}
                </Button>
              ))}
            </div>
          )}
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
                  newColor === c && "ring-2 ring-offset-1 ring-offset-bloco",
                )}
                style={{
                  background: tagColor(c),
                  boxShadow:
                    newColor === c ? `0 0 0 1px ${tagColor(c)}` : undefined,
                }}
              />
            ))}
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
              aria-label="Nome da nova tag"
              className="w-auto flex-1 rounded-lg border border-line bg-[var(--input-bg)] px-2.5 py-1.5 text-legenda transition-colors"
            />
            <Button
              variant="brand"
              size="none"
              onClick={() => void createAndApply()}
              disabled={!newName.trim()}
              className="rounded-lg px-3 py-1.5 text-apoio font-semibold disabled:opacity-50"
            >
              Criar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
