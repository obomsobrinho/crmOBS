"use client";

import { useState } from "react";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Handoff } from "./HandoffCard";
import FundoRede from "./FundoRede";
import { cn } from "@/lib/utils";
import {
  ClassificationPanel,
  HandoffPanel,
  SummaryPanel,
} from "./playground/DiagnosticoPanels";
import { RodapeDaBancada } from "./playground/RodapeDaBancada";
import { TurnosDaBancada } from "./playground/TurnosDaBancada";
import type { ConfiguracaoEmEdicao, PlaygroundTurn } from "./playground/tipos";
import { useConversaDeTeste } from "./playground/useConversaDeTeste";

export type { ConfiguracaoEmEdicao, PlaygroundTurn };

// Bancada de teste do agente (dono-only). Fala direto com o cérebro REAL via
// /api/playground (dryRun): nada é enviado no WhatsApp, nada é gravado, o card
// NÃO é movido de verdade (só mostra o estágio que moveria). Esquerda =
// Conversa; direita = Diagnóstico do turno (handoff / classificação / resumo),
// que a montagem desliga com `diagnostico={false}`.
//
// Mora em DOIS lugares, e nenhum é tela própria: o painel lateral do `/agente`
// (`AgentTestDrawer`, que reseta remontando por `key`) e o passo "Converse com
// o seu agente" da montagem. Configurar e testar são a mesma atividade. Por isso
// este componente não desenha título nem descrição: quem faz isso é quem o
// hospeda.


export default function Playground({
  stageNames,
  initialTurns = [],
  initialPedidos = [],
  initialStage = null,
  configuracao = null,
  diagnostico = true,
}: {
  // key -> nome do estágio, para rotular o "estágio que moveria".
  stageNames: Record<string, string>;
  // Só para o /design: começa com uma conversa de exemplo.
  initialTurns?: PlaygroundTurn[];
  /** Só para o /design: começa com pedidos de ajuda abertos. */
  initialPedidos?: Handoff[];
  initialStage?: string | null;
  /**
   * Configuração em edição. Lida na hora de cada turno (e não copiada para o
   * estado), então uma alteração no formulário vale no turno seguinte sem
   * precisar fechar e reabrir o painel.
   */
  configuracao?: ConfiguracaoEmEdicao | null;
  /**
   * `false` na montagem (26/09/2026, pedido do dono): lá a bancada mora DENTRO
   * do passo, e quem monta a conta pela primeira vez quer ver o agente
   * responder, não RAG, estágio e orientação. Sem o diagnóstico sobra só a
   * conversa, que cabe na coluna de 672px do assistente. No `/agente` ele
   * continua, porque ali quem testa está ajustando.
   */
  diagnostico?: boolean;
}) {
  const [abaCel, setAbaCel] = useState<"conversa" | "diagnostico">("conversa");
  const {
    turns,
    input,
    setInput,
    fila,
    pedidoAtual,
    iaPausada,
    setIaPausada,
    sending,
    pensando,
    error,
    simStage,
    lastDiag,
    scrollRef,
    sendMessage,
    gravando,
    segundos,
    iniciarGravacao,
    pararGravacao,
    fecharPedido,
    orientarPedido,
    responderComoTime,
  } = useConversaDeTeste({
    initialTurns,
    initialPedidos,
    initialStage,
    configuracao,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* CELULAR (plano do mobile, fase 4): conversa e diagnóstico não cabem
          lado a lado nem empilhados (a conversa ficaria com dois dedos de
          altura), então viram duas ABAS. No desktop continuam lado a lado. */}
      <Tabs
        value={abaCel}
        onValueChange={(v) => setAbaCel(v as "conversa" | "diagnostico")}
        className="shrink-0"
      >
        <TabsList
          variant="segmentos"
          aria-label="Bancada"
          className={cn("mb-3 grid-cols-2 md:hidden", !diagnostico && "hidden")}
        >
          {([
            ["conversa", "Conversa"],
            ["diagnostico", "Diagnóstico"],
          ] as const).map(([k, rotulo]) => (
            <TabsTrigger key={k} value={k} variant="segmento">
              {rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* O botão Resetar ficava aqui, numa linha própria acima da conversa, e era
          ele que abria o vão grande embaixo do cabeçalho do painel. Subiu para o
          cabeçalho do `AgentTestDrawer`, que reseta remontando este componente
          por `key`: remontar já devolve turnos, entrada, orientação e estágio
          simulado ao estado inicial, o que dispensa expor a função para fora. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* ESQUERDA: Conversa. `bg-msg` é a superfície de área de mensagens, a
            mesma da tela de atendimento: aqui também é onde os balões moram. */}
        {/* ⚠️ VESTIDA COMO A TELA DE CONVERSAS (26/09/2026, pedido do dono): o
            mesmo fundo de rede, as mesmas peles de balão (`PELE` do Thread) e a
            mesma moldura da caixa de escrita. A bancada é onde a pessoa vê o
            agente pela primeira vez, e ela tem que parecer a conversa de verdade
            que vem depois, não um formulário. Sem modo de nota nem orientação:
            aqui não existe handoff para orientar. */}
        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-msg",
            diagnostico && abaCel !== "conversa" && "max-md:hidden"
          )}
        >
          <FundoRede />
          <TurnosDaBancada turns={turns} pensando={pensando} scrollRef={scrollRef} />
          <RodapeDaBancada
            pedidoAtual={pedidoAtual}
            fila={fila}
            error={error}
            iaPausada={iaPausada}
            setIaPausada={setIaPausada}
            responderComoTime={responderComoTime}
            orientarPedido={orientarPedido}
            fecharPedido={fecharPedido}
            gravando={gravando}
            segundos={segundos}
            pararGravacao={pararGravacao}
            iniciarGravacao={iniciarGravacao}
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            sending={sending}
          />
        </div>

        {/* DIREITA: Diagnóstico do turno, em coluna única. Eram duas colunas
            quando isto era tela cheia; dentro do painel lateral a largura é
            menor, e dois painéis lado a lado viravam duas colunas estreitas. */}
        {diagnostico && (
        <AreaRolavel
          className={cn(
            "flex shrink-0 flex-col gap-3 lg:w-[380px] max-md:min-h-0 max-md:flex-1",
            abaCel !== "diagnostico" && "max-md:hidden"
          )}
        >
          <ClassificationPanel
            diag={lastDiag}
            simStage={simStage}
            stageNames={stageNames}
          />
          <HandoffPanel diag={lastDiag} />
          <SummaryPanel diag={lastDiag} />
        </AreaRolavel>
        )}
      </div>
    </div>
  );
}
