"use client";

import { useCallback } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useCarga } from "@/lib/use-carga";
import type { AgentConfig } from "@/lib/agent-prompt";
import {
  ITENS_DA_REVISAO,
  revisaoAntesDeAtivar,
  type EstadoDaRevisao,
  type ItemDaRevisao,
} from "@/lib/onboarding";

// A REVISÃO ANTES DE ATIVAR (23/10/2026, dono): no passo 5, depois do destino e
// antes do botão de ativar, o que está valendo em cada item que faz diferença.
// Os documentos levam ao passo 2; regras, mensagem e horário abrem num painel
// aqui mesmo, com os MESMOS campos do /agente (decisão do dono: sem sair da
// montagem).
//
// ⚠️ UMA LINHA POR ITEM, SEM TEXTÃO (26/10/2026, dono): "aqui eu já sei o que
// configurou e posso dar um check direto, e o que não colocou ele já sabe do que
// se trata, já passou lá atrás". Feito ganha o check e o valor em poucas
// palavras; o que falta diz só "Recomendado" e oferece o botão. Os porquês e os
// exemplos moram nos passos, não aqui.
//
// ⚠️ NÃO BLOQUEIA: quem trava o Ativar é `publishBlockers` (só os avisos).

export type PainelDaRevisao = "limites" | "horario";

export default function MontagemRevisao({
  clientId,
  cfg,
  documentosDoPreview,
  preview,
  onAbrirPainel,
  onIrParaDocumentos,
}: {
  clientId: string;
  cfg: AgentConfig;
  /** /design: a contagem vem daqui, sem banco. */
  documentosDoPreview: number;
  preview: boolean;
  onAbrirPainel: (p: PainelDaRevisao) => void;
  onIrParaDocumentos: () => void;
}) {
  // A contagem de documentos é lida UMA vez, ao chegar aqui: o envio mora no
  // passo 2, e voltar para lá remonta esta revisão na volta.
  const contar = useCallback(async () => {
    if (preview) return documentosDoPreview;
    const { count, error } = await createClient()
      .from("knowledge_documents")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if (error) throw error;
    return count ?? 0;
  }, [clientId, preview, documentosDoPreview]);
  const documentos = useCarga(contar);

  const regras = cfg.dontDo.length + cfg.escalateWhen.length;
  const estado = revisaoAntesDeAtivar({
    nuncaFaz: cfg.dontDo.length,
    chamaQuando: cfg.escalateWhen.length,
    documentos: documentos.dados,
    horarioConferido: cfg.hoursConfirmed,
    mensagem: cfg.handoffNotice.trim() !== "",
  });

  // O valor em poucas palavras. O que falta é só "Recomendado".
  const valor: Record<ItemDaRevisao, string> = {
    regras: estado.regras === "vazio" ? "Recomendado" : `${regras} ${regras === 1 ? "regra" : "regras"}`,
    documentos: documentos.erro
      ? "Não deu para conferir"
      : documentos.dados === null
        ? "Conferindo…"
        : documentos.dados === 0
          ? "Recomendado"
          : `${documentos.dados} ${documentos.dados === 1 ? "documento" : "documentos"}`,
    horario: estado.horario === "nao_conferido" ? "Não conferido" : "Conferido",
    mensagem: estado.mensagem === "padrao" ? "Padrão" : "Personalizada",
  };

  // Botão só onde há o que fazer: o que está feito ganha o check e basta.
  function acao(key: ItemDaRevisao, e: EstadoDaRevisao) {
    if (e === "preenchido" || e === "conferindo") return null;
    switch (key) {
      case "documentos":
        return { rotulo: "Adicionar", fazer: onIrParaDocumentos };
      case "regras":
        return { rotulo: "Adicionar", fazer: () => onAbrirPainel("limites") };
      case "mensagem":
        return { rotulo: "Personalizar", fazer: () => onAbrirPainel("limites") };
      case "horario":
        return { rotulo: "Conferir", fazer: () => onAbrirPainel("horario") };
    }
  }

  return (
    <section
      data-slot="montagem-revisao"
      className="rounded-xl border border-line bg-bloco p-5 max-sm:p-4"
    >
      <h2 className="font-display text-cartao text-ink">Antes de ativar, confira</h2>

      <ul className="mt-3 divide-y divide-line">
        {/* Os avisos são o próprio passo 5, logo acima: uma linha deles aqui
            só repetiria o bloco (23/10/2026). */}
        {ITENS_DA_REVISAO.map((item) => {
          const e = estado[item.key];
          const feito = e === "preenchido";
          const a = acao(item.key, e);
          return (
            <li
              key={item.key}
              data-slot="revisao-item"
              data-item={item.key}
              data-estado={e}
              className="flex min-h-11 items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  feito ? "bg-human-surface text-human-ink" : "border border-line-strong"
                )}
              >
                {feito && <Check size={13} />}
              </span>
              <p className="min-w-0 flex-1 text-apoio text-ink">
                {item.titulo}
                <span data-slot="revisao-valor" className="text-ink-3">
                  {" · "}
                  {valor[item.key]}
                </span>
              </p>
              {a && (
                <Button
                  variant="brand-ghost"
                  size="control"
                  data-slot="revisao-acao"
                  className="shrink-0"
                  onClick={a.fazer}
                >
                  {a.rotulo}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
