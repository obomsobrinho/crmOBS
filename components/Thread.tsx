"use client";

import { useMemo, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DISSOLVER_BALAO } from "@/components/ui/dissolver-rolagem";
import AiSummary from "./AiSummary";
import FundoRede from "./FundoRede";
import { quemAtende, type Qualification } from "@/lib/crm";
import { prettyPhone } from "@/lib/format";
import type { ChatRow } from "@/lib/types";
import HandoffCard, { type Handoff } from "./HandoffCard";
import MessageComposer from "./MessageComposer";
import { memberName, type Member } from "@/lib/team";
import { montarItens } from "./thread/bolhas";
import { BubbleView } from "./thread/BubbleView";
import { ThreadHeader } from "./thread/ThreadHeader";
import { useHandoffsDaConversa } from "./thread/useHandoffsDaConversa";
import { useMensagensDaConversa } from "./thread/useMensagensDaConversa";
import { useRolagemDaConversa } from "./thread/useRolagemDaConversa";

export default function Thread({
  phone,
  name,
  fotoPath = null,
  iaState,
  onToggleIa,
  initialRows,
  temAntigasInicial = false,
  onToggleContext,
  contextOpen,
  clientId,
  readOnly,
  onAddNote,
  onInstruct,
  onOrientarPedido,
  assignedUserId,
  members,
  myUserId,
  onAssign,
  conversationId,
  pendingInstruction,
  onCancelInstruction,
  qualificacaoPreview,
  handoffAtInicial,
  handoffsPreview,
  onOpenContato,
}: {
  phone: string;
  name: string | null;
  /** Foto de perfil guardada (lib/fotos.ts). */
  fotoPath?: string | null;
  iaState: string | null;
  onToggleIa: () => void;
  initialRows: ChatRow[];
  /** A conversa tem mensagens mais antigas que as que vieram do servidor. */
  temAntigasInicial?: boolean;
  onToggleContext?: () => void;
  /** Celular: "Dados do contato" nos três pontos abre a folha do contato. */
  onOpenContato?: () => void;
  contextOpen?: boolean;
  clientId: string;
  /** Conta bloqueada por assinatura: só leitura (sem envio, sem ligar a IA). */
  readOnly?: boolean;
  /** Repassados à caixa de mensagem (abas "Nota interna" e "Orientar"). */
  onAddNote?: (body: string) => void | Promise<void>;
  onInstruct?: (text: string) => void | Promise<void>;
  /** Orientar o pedido de ajuda aberto (a caixa em modo pedido): resolve e a IA responde na hora. */
  onOrientarPedido?: (text: string, pedidoId: number) => void | Promise<void>;
  /* A segunda linha do cabeçalho carrega quem é o dono da conversa e como ela
     está classificada. São decisões sobre a conversa, então moram junto dela e
     não a duas colunas de distância, no painel. */
  assignedUserId?: string | null;
  members?: Member[];
  myUserId?: string;
  onAssign?: (userId: string | null) => void;
  conversationId?: number | null;
  /** Orientação pendente da IA, mostrada colada na caixa de escrita. */
  pendingInstruction?: string | null;
  onCancelInstruction?: () => void | Promise<void>;
  /** Só o preview /design: injeta o entendimento, que sem banco não existe. */
  qualificacaoPreview?: Qualification;
  /** `handoff_at` já lido pelo servidor (R-14), repassado à faixa do entendimento. */
  handoffAtInicial?: string | null;
  /** Só o preview /design: os pedidos de ajuda, que sem banco não existem. */
  handoffsPreview?: Handoff[];
}) {
  // PEDIDOS DE AJUDA DA IA (tabela `handoffs`, 27/09/2026): viram cartões na
  // linha do tempo. Carregados e escutados em tempo real, porque quem abre e
  // fecha é o servidor (o agente e o Resolvido), fora desta tela.
  const { handoffs, carregarHandoffs, fila, pedidoAtual, resolverHandoff } =
    useHandoffsDaConversa({ clientId, phone, handoffsPreview });

  // ⚠️ NÃO EXISTE MAIS ESTADO DE ROLAGEM AQUI (19/09/2026, quarta rodada). Eram
  // `rolou` e `temMais`, e os dois só serviam para acender as sombras das bordas.
  // As duas sombras saíram: quem diz "tem mais conversa deste lado" é a
  // DISSOLUÇÃO do `ScrollArea`, que já faz a própria medida para a máscara. O
  // Thread não precisa medir de novo, e por isso o `onViewportScroll` também
  // saiu daqui.
  //
  // O esmaecimento das pontas mora no ScrollArea (prop `fade`), porque as três
  // listas da tela precisam dele; o que é desta tela é só o TAMANHO dele
  // (`DISSOLVER_BALAO`).
  const bottomRef = useRef<HTMLDivElement>(null);
  /** O elemento que rola de verdade, dentro do ScrollArea. */
  const viewportRef = useRef<HTMLDivElement>(null);

  const { bubbles, pending, temAntigas, carregandoAntigas, topoRef, handleSend, handleSendMedia } =
    useMensagensDaConversa({
      phone,
      initialRows,
      temAntigasInicial,
      viewportRef,
      pedidoAtualId: pedidoAtual?.id,
      carregarHandoffs,
    });

  useRolagemDaConversa({ viewportRef, phone, bubbles, pendentes: pending.length });

  const iaPausada = iaState === "pause";

  const items = useMemo(() => montarItens(bubbles, handoffs), [bubbles, handoffs]);

  const displayName = name || prettyPhone(phone);
  // Hora da última mensagem publicada, para o subcabeçalho. Vem dos balões (e
  // não de `rows`) porque uma linha pode render dois balões e o que interessa
  // é o que a pessoa realmente viu por último.
  const lastAt = bubbles.length ? bubbles[bubbles.length - 1].created_at : null;
  const attendant =
    assignedUserId && members
      ? (members.find((m) => m.userId === assignedUserId) ?? null)
      : null;
  // A LINHA DE ESTADO do celular (plano do mobile, fase 1): no lugar do
  // telefone, embaixo do nome, diz quem responde esta conversa agora. Sai de
  // `quemAtende`, a MESMA regra da lista, para as duas telas nunca discordarem.
  const quem = quemAtende({
    pausada: iaState === "pause",
    temAtendente: !!assignedUserId,
  });
  const estadoLinha =
    quem === "ia"
      ? "IA atendendo"
      : quem === "ninguem"
        ? "IA pausada · ninguém atende"
        : attendant && attendant.userId !== myUserId
          ? `${memberName(attendant.email)} está atendendo`
          : "Você está atendendo";


  return (
    <>
      <ThreadHeader
        phone={phone}
        name={name}
        fotoPath={fotoPath}
        displayName={displayName}
        lastAt={lastAt}
        quem={quem}
        estadoLinha={estadoLinha}
        iaState={iaState}
        iaPausada={iaPausada}
        onToggleIa={onToggleIa}
        readOnly={readOnly}
        attendant={attendant}
        assignedUserId={assignedUserId}
        members={members}
        myUserId={myUserId}
        onAssign={onAssign}
        onOpenContato={onOpenContato}
        onToggleContext={onToggleContext}
        contextOpen={contextOpen}
      />

      {/* "O CLIENTE QUER": o entendimento da IA virou FAIXA no topo da conversa
          (desenho de 18/09/2026). Antes morava só na coluna da direita, onde
          disputava atenção com dados cadastrais e sumia junto com a coluna quando
          alguém clicava em "Ocultar cliente". É a primeira pergunta que quem abre
          a conversa faz, então é a primeira linha que ele lê. */}
      {conversationId != null && (
        <AiSummary
          phone={phone}
          clientId={clientId}
          variante="faixa"
          qualificacaoForcada={qualificacaoPreview}
          handoffAtInicial={handoffAtInicial}
        />
      )}

      {/* A moldura existe só para as duas sombras terem a que se ancorar: elas
          são absolutas DENTRO da área que rola, e é isso que as impede de
          invadir o cabeçalho, a faixa do entendimento ou a caixa de escrita.
          Quem desenha a borda continua sendo o vizinho (`border-b` no
          cabeçalho); a sombra só diz que há conversa escondida atrás dela. */}
      <div className="relative flex min-h-0 flex-1 flex-col bg-msg">
        {/* O fundo de rede neural, SÓ ATRÁS DAS MENSAGENS (pedido do dono). Ele
            mora aqui, e não dentro do ScrollArea, porque assim não rola junto
            com a conversa. ⚠️ A superfície `bg-msg` SUBIU do ScrollArea para
            este contêiner: opaca lá dentro, ela cobriria o fundo. */}
        <FundoRede />
        {/* ⚠️ Aqui a conversa GANHA largura, por decisão registrada: a barra
            nativa reservava 10px de layout e a do Radix é sobreposta. É a única
            mudança de pixel assumida nesta rodada. */}
        <ScrollArea
          className="min-h-0 flex-1"
          viewportClassName="py-3"
          viewportRef={viewportRef}
          fade={DISSOLVER_BALAO}
          seta
          setaRotulo="Ver as mensagens mais recentes"
        >
          {/* COLUNA DE LEITURA de 960px, centrada (medida do desenho). A conversa
              ocupava a largura inteira do cartão, e em 1920 isso dá uma linha de
              texto que atravessa meia tela: o olho perde o começo da linha
              seguinte. Os 20px de respiro lateral ficam aqui dentro para que a
              coluna encoste na moldura só quando a tela é estreita. */}
          <div className="mx-auto w-full max-w-[960px] px-5 max-md:px-3">
            {temAntigas && (
              <div ref={topoRef} data-slot="conversa-antigas" className="flex justify-center pb-2">
                {carregandoAntigas && (
                  <span className="text-legenda text-ink-3">Carregando mensagens anteriores…</span>
                )}
              </div>
            )}
            {items.map((item) =>
              item.kind === "day" ? (
                <div
                  key={item.key}
                  className="flex justify-center pb-3 pt-1"
                  data-slot="conversa-dia"
                >
                  {/* `bg-[var(--marcador-surface)]`, e não `bg-bloco`: no tema
                      claro bloco e conversa são a MESMA cor, e esta pílula era
                      desenhada invisível. Ver o token no globals.css. */}
                  <Badge
                    variant="dia"
                    className="inline-flex h-6 items-center rounded-md border border-line-soft bg-[var(--marcador-surface)] px-3 py-0"
                  >
                    {item.label}
                  </Badge>
                </div>
              ) : item.kind === "marco" ? (
                // MARCO: linha fina atravessando a conversa com um selo no meio.
                // É o desenho da "passagem de bastão", e ela precisa cortar a
                // coluna inteira: um chip solto no meio dos balões seria lido
                // como mais uma mensagem.
                <div
                  key={item.key}
                  className="flex items-center gap-3 pb-3.5 pt-1.5"
                  data-slot="conversa-marco"
                >
                  <span className="h-px flex-1 bg-human-line" aria-hidden />
                  <span className="inline-flex h-[26px] shrink-0 items-center gap-2 rounded-md border border-human-line bg-human-surface px-2.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-human"
                      aria-hidden
                    />
                    <span
                      className="whitespace-nowrap text-rotulo uppercase text-human-ink"
                      suppressHydrationWarning
                    >
                      {item.label}
                    </span>
                  </span>
                  <span className="h-px flex-1 bg-human-line" aria-hidden />
                </div>
              ) : item.kind === "handoff" ? (
                <HandoffCard key={item.key} h={item.handoff} />
              ) : (
                <BubbleView
                  key={item.bubble.key}
                  b={item.bubble}
                  showLabel={item.showLabel}
                />
              )
            )}
          </div>
          <div ref={bottomRef} />
        </ScrollArea>
        {/* ⚠️ NÃO EXISTE SOMBRA DE ROLAGEM EM BORDA NENHUMA, e as duas saíram em
            19/09/2026, a de baixo primeiro e a de cima logo depois, a pedido do
            dono ("aplique o mesmo no header"). Quem diz "tem mais conversa deste
            lado" é a DISSOLUÇÃO (`DISSOLVER_BALAO`), que já só aparece
            quando há conteúdo escondido daquele lado. Empilhar uma sombra de 8px
            em cima de 80px de degradê é um segundo sinal para o mesmo fato, no
            mesmo lugar, e é isso que lia como sujeira na borda.
            O que separa o cabeçalho da conversa é a `border-b` dele, que já
            estava lá; a conversa passa por baixo dissolvendo. */}
      </div>

      <div className="relative z-10 shrink-0">
        <MessageComposer
          // Trocar de pedido remonta a caixa, e ela volta a abrir em orientar.
          key={pedidoAtual ? `pedido-${pedidoAtual.id}` : "normal"}
          pedido={
            pedidoAtual && !readOnly
              ? {
                  handoff: pedidoAtual,
                  posicao: 1,
                  total: fila.length,
                  onOrientar: async (t: string) => {
                    if (handoffsPreview || !onOrientarPedido) return;
                    await onOrientarPedido(t, pedidoAtual.id);
                    await carregarHandoffs();
                  },
                  onResolvido: async () => {
                    if (handoffsPreview) return;
                    await resolverHandoff(pedidoAtual.id);
                  },
                }
              : undefined
          }
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          onAddNote={onAddNote}
          onInstruct={onInstruct}
          pendingInstruction={pendingInstruction}
          onCancelInstruction={onCancelInstruction}
          iaAtiva={iaState !== null && !iaPausada}
          clientId={clientId}
          readOnly={readOnly}
          atende={
            quem === "pessoa"
              ? attendant && attendant.userId !== myUserId
                ? { quem: "outro", nome: memberName(attendant.email) }
                : { quem: "voce" }
              : { quem }
          }
        />
      </div>
    </>
  );
}
