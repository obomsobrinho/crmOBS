"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Sparkles, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import { qualReasonLabel, type Qualification, type QualAction } from "@/lib/crm";
import { cn } from "@/lib/utils";

// "Entendimento": o que a IA entendeu desta conversa. Lê a qualificação mais
// recente (conversation_qualifications, gravada por /api/agent). Só leitura.
//
// Abre o painel de propósito, mesmo sem qualificação nenhuma: a primeira coisa
// que a coluna responde é "o que essa pessoa quer". Antes isso era um cartão
// tingido chamado "Resumo da IA" que sumia quando não havia handoff, e a
// lateral começava em texto solto.
export default function AiSummary({
  phone,
  clientId,
  variante = "painel",
  direita,
  qualificacaoForcada,
}: {
  phone: string;
  clientId: string;
  /**
   * Só para o preview `/design` e para o teste: injeta a qualificação em vez de
   * ler o banco.
   *
   * ⚠️ Existe porque a faixa passou a SUMIR quando não há entendimento
   * (21/09/2026), e no preview não há banco: sem isto, a tela de design não teria
   * como mostrar o estado com conteúdo, que é justamente o que precisa ser
   * conferido. Mesmo precedente do `estadoForcado` do `WhatsAppBanner`: a tela
   * real nunca passa esta prop.
   */
  qualificacaoForcada?: Qualification;
  /**
   * `painel` é o bloco da coluna da direita. `faixa` é a linha larga que fica
   * logo abaixo do cabeçalho da conversa (desenho de 18/09/2026): "O CLIENTE
   * QUER ..." é a primeira coisa que a pessoa lê ao abrir, e no painel lateral
   * ela disputava atenção com dados cadastrais.
   */
  variante?: "painel" | "faixa";
  /** Só na faixa: o que aparece na ponta direita (quem assumiu). */
  direita?: ReactNode;
}) {
  const supabase = createClient();
  const [qual, setQual] = useState<Qualification | null>(
    qualificacaoForcada ?? null
  );
  // Handoff em aberto desta conversa. Vem junto porque é aqui que o pedido
  // pendente está descrito, e é aqui que faz sentido declarar que acabou.
  const [handoffAt, setHandoffAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: conv }] = await Promise.all([
      supabase
        .from("conversation_qualifications")
        .select("action, summary, preferencia_horario, created_at")
        .eq("client_id", clientId)
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("handoff_at")
        .eq("client_id", clientId)
        .eq("phone", phone)
        .maybeSingle(),
    ]);
    setHandoffAt((conv?.handoff_at as string | null) ?? null);
    if (!data) {
      setQual(null);
      return;
    }
    setQual({
      action: (data.action as QualAction) ?? "none",
      summary: (data.summary as string | null) ?? "",
      preferenciaHorario: (data.preferencia_horario as string | null) ?? "",
      createdAt: (data.created_at as string) ?? "",
    });
  }, [supabase, clientId, phone]);


  // Carga inicial. Com qualificacao injetada nao ha o que buscar: o preview
  // roda sem banco.
  useEffect(() => {
    if (qualificacaoForcada) return;
    void (async () => {
      await load();
    })();
  }, [load, qualificacaoForcada]);

  // TEMPO REAL (02/10/2026, R-02): canal do tenant, e SÓ esta conversa conta
  // (pelo `phone` do payload). Antes eram duas tabelas inteiras sem filtro e
  // duas consultas a cada mudança de QUALQUER conversa, em aba escondida também.
  // Agora o evento encaixa o que traz no estado, sem consulta nenhuma:
  // - `conversations`: o handoff é aberto pelo /api/agent e fechado pela rota de
  //   resolver, os dois fora desta tela, e a linha traz `handoff_at`;
  // - `conversation_qualifications` (só INSERT, é append-only): a linha nova é a
  //   mais recente, e traz as colunas que a faixa mostra.
  // `load` só roda ao reconectar ou ao voltar o foco.
  useCanalTenant({
    clientId: qualificacaoForcada ? null : clientId,
    tabelas: ["conversations", "conversation_qualifications"],
    modo: "aplicar",
    revalidar: () => void load(),
    aoEvento: (ev) => {
      if (foneDoEvento(ev) !== phone) return;
      if (ev.tabela === "conversations") {
        if (ev.tipo === "DELETE") return setHandoffAt(null);
        if (ev.novo && "handoff_at" in ev.novo) {
          setHandoffAt((ev.novo.handoff_at as string | null) ?? null);
        }
        return;
      }
      if (ev.tipo !== "INSERT" || !ev.novo) return;
      setQual({
        action: (ev.novo.action as QualAction) ?? "none",
        summary: (ev.novo.summary as string | null) ?? "",
        preferenciaHorario: (ev.novo.preferencia_horario as string | null) ?? "",
        createdAt: (ev.novo.created_at as string) ?? "",
      });
    },
  });

  const pedido = qual ? qualReasonLabel(qual.action) : "";
  const horario = qual?.preferenciaHorario ?? "";
  const resumo = qual?.summary ?? "";

  if (variante === "faixa") {
    // ⚠️ SEM NADA A DIZER, A FAIXA NÃO EXISTE (decisão do dono, 21/09/2026).
    // Ela mostrava "Ainda não disse", e o argumento anterior escrito aqui era
    // que dizer isso seria mais útil que esconder o bloco. O dono olhou a tela
    // pronta e discordou: "se ele ainda não disse, talvez nem faça sentido
    // aparecer". Ele tem razão, e o custo era alto: são 49px de faixa, mais uma
    // borda, gastos para informar que não há informação, no topo de toda
    // conversa nova, que é justamente quando a conversa é curta e cada pixel de
    // altura conta.
    //
    // ⚠️ `handoffAt` NÃO pode sair desta condição: com handoff aberto, é esta
    // faixa que carrega o chip "esperando há 6h" e o botão Resolvido. Esconder
    // por falta de resumo tiraria da tela o único jeito de fechar a pendência.
    if (!resumo && !pedido && !handoffAt) return null;
    return (
      // ⚠️ A FAIXA INTEIRA NÃO MUDA MAIS DE COR com o handoff aberto. Ela ficava
      // âmbar de ponta a ponta, e o desenho aprovado mantém a superfície do
      // cartão SEMPRE: quem muda de cor é o selo, o rótulo e o chip de espera.
      // O motivo é hierarquia de alarme: pintar 1400px de largura de âmbar logo
      // abaixo do nome do contato faz a faixa gritar mais alto que a própria
      // conversa, e ela é uma LINHA DE CONTEXTO, não um alerta. O que precisa
      // gritar é o chip "esperando há 6h", e ele grita melhor sobre superfície
      // neutra do que sobre âmbar.
      <div
        data-slot="conversa-entendimento"
        className="flex shrink-0 items-center gap-3 border-b border-line bg-raised px-[22px] py-[11px]"
      >
        {/* O SELO: quadrado de 26px na superfície tingida, com um bloco de 8px
            dentro na tinta do tom. É o desenho, e ele serve de âncora de cor à
            esquerda da faixa: roxo quando é a IA entendendo, âmbar quando a
            conversa está esperando alguém. O ícone de faísca vinha antes do
            rótulo, com 13px, e desaparecia contra o texto em caixa alta. */}
        <span
          className={cn(
            "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md",
            handoffAt ? "bg-warn-surface" : "bg-brand-surface"
          )}
          aria-hidden
        >
          <Sparkles
            size={14}
            className={cn(
              "shrink-0",
              handoffAt ? "text-warn-ink" : "text-brand-ink"
            )}
          />
        </span>
        <span
          className={cn(
            "shrink-0 text-rotulo uppercase",
            handoffAt ? "text-warn-ink" : "text-brand-ink"
          )}
        >
          O cliente quer
        </span>
        {/* Uma linha só e sem quebrar o layout: o resumo pode ser longo, e a
            faixa não pode empurrar a conversa para baixo a cada turno da IA.
            ⚠️ 13px em peso 600, e não os 15px do desenho (pedido do dono em
            21/09/2026: "pode ter uma fonte menor um pouco"). O argumento antigo
            para os 15 era que em 13 NORMAL a frase pesava menos que o telefone
            do cabeçalho; o peso 600 resolve isso sem gastar altura, e esta faixa
            é linha de CONTEXTO, não o conteúdo da tela. */}
        <span className="min-w-0 flex-1 truncate text-apoio font-semibold text-ink">
          {resumo || pedido}
        </span>
        {horario && (
          <span className="hidden shrink-0 items-center gap-1 text-legenda text-ink-2 lg:flex">
            <Clock size={13} className="shrink-0 text-ink-3" />
            {horario}
          </span>
        )}
        {/* ⚠️ SEM BOTÃO DE PEDIDO AQUI (27/09/2026, pedido do dono): o pedido de
            ajuda aberto é a própria caixa de escrita (`MessageComposer` com a prop `pedido`), que já
            está à vista. Resolver ou apontar para ele daqui repetiria o lugar. */}
        {direita}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="flex items-center gap-1.5 text-rotulo uppercase text-brand-ink">
        <Sparkles size={13} className="shrink-0" />
        Entendimento
      </span>

      <b className="text-titulo text-ink" style={{ textWrap: "pretty" }}>
        {pedido || "Ainda não disse"}
      </b>

      {horario && (
        <span className="flex items-center gap-1.5 text-apoio font-semibold text-ink-2">
          <Clock size={14} className="shrink-0 text-ink-3" />
          {horario}
        </span>
      )}

      {resumo && (
        <p className="text-apoio text-ink-3" style={{ textWrap: "pretty" }}>
          {resumo}
        </p>
      )}

    </div>
  );
}
