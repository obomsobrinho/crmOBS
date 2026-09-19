"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  User,
  UserPlus,
  Check,
  CheckCheck,
  ChevronDown,
  PanelRight,
  FileText,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import AiSummary from "./AiSummary";
import { respostaHumana } from "@/lib/mensagem";
import { formatTime, prettyPhone } from "@/lib/format";
import { initials, avatarPair } from "@/lib/inbox";
import type { Bubble, ChatRow } from "@/lib/types";
import MessageComposer, { type OutgoingMedia } from "./MessageComposer";
import ContactTags from "./ContactTags";
import { memberName, memberInitials, type Member } from "@/lib/team";

type Pending = {
  tempId: string;
  content: string;
  created_at: string;
  status: "pending" | "failed";
  // Preenchido quando o pendente é um envio de mídia (reconcilia pelo caminho).
  mediaPath?: string;
};

function rowsToBubbles(rows: ChatRow[]): Bubble[] {
  const bubbles: Bubble[] = [];
  for (const r of rows) {
    const media = r.media_url ?? null;
    const mediaType = r.media_type ?? null;
    // O que decide o lado é o message_type: 'manual' = enviado pelo CRM (balão
    // "out"), qualquer outro = recebido do contato (balão "in"). Não dá para
    // usar bot_message, porque mídia enviada sem legenda tem bot_message ''.
    const isManual = r.message_type === "manual";
    // Balão recebido: tem texto do contato, ou é mídia recebida (não manual e
    // sem resposta do bot na mesma linha).
    if (r.user_message || (media && !isManual && !r.bot_message)) {
      bubbles.push({
        key: `u${r.id}`,
        side: "in",
        author: "cliente",
        content: r.user_message ?? "",
        created_at: r.created_at,
        mediaUrl: isManual ? null : media,
        mediaType: isManual ? null : mediaType,
      });
    }
    // Envio manual só com mídia (sem legenda): balão enviado com a mídia.
    if (isManual && media && !r.bot_message) {
      bubbles.push({
        key: `m${r.id}`,
        side: "out",
        author: "voce",
        content: "",
        created_at: r.created_at,
        mediaUrl: media,
        mediaType,
      });
    }
    if (r.bot_message) {
      // ⚠️ Quem respondeu sai de `lib/mensagem.ts`, e não de
      // `message_type === "manual"` escrito aqui. A regra escrita à mão dizia
      // "não é manual, logo é IA", e `imported` não é manual: o histórico que o
      // DONO digitou à mão no WhatsApp antes de existir agente aparecia com o
      // ícone de robô e o rótulo "IA". Na OBM são 84 das 94 linhas. É o mesmo
      // defeito que o módulo puro nasceu para matar no painel, e a conversa era
      // o último lugar que ainda o repetia. Também importa para o marco de "o
      // time assumiu" logo abaixo: sem isto, toda conversa importada abriria
      // com uma passagem de bastão que nunca aconteceu.
      const author = respostaHumana(r) ? "voce" : "ia";
      // A IA responde em 1-2 mensagens; o n8n grava as duas numa linha só unidas
      // por " | ". A pessoa recebeu duas mensagens separadas no WhatsApp, então
      // renderizamos como balões separados. Só a IA é dividida (o envio manual do
      // CRM é uma mensagem única e pode conter " | " de propósito).
      const parts =
        author === "ia" ? r.bot_message.split(" | ") : [r.bot_message];
      parts.forEach((content, i) =>
        bubbles.push({
          key: `b${r.id}-${i}`,
          side: "out",
          author,
          content,
          created_at: r.created_at,
          // mídia enviada só entra quando a linha não tem mensagem recebida.
          mediaUrl: i === 0 && !r.user_message ? media : null,
          mediaType: i === 0 && !r.user_message ? mediaType : null,
        })
      );
    }
  }
  return bubbles;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Hoje";
  if (same(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function Thread({
  phone,
  name,
  iaState,
  onToggleIa,
  initialRows,
  onToggleContext,
  contextOpen,
  clientId,
  readOnly,
  onAddNote,
  onInstruct,
  assignedUserId,
  members,
  myUserId,
  onAssign,
  conversationId,
  pendingInstruction,
  onCancelInstruction,
}: {
  phone: string;
  name: string | null;
  iaState: string | null;
  onToggleIa: () => void;
  initialRows: ChatRow[];
  onToggleContext?: () => void;
  contextOpen?: boolean;
  clientId: string;
  /** Conta bloqueada por assinatura: só leitura (sem envio, sem ligar a IA). */
  readOnly?: boolean;
  /** Repassados à caixa de mensagem (abas "Nota interna" e "Orientar"). */
  onAddNote?: (body: string) => void | Promise<void>;
  onInstruct?: (text: string) => void | Promise<void>;
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
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<ChatRow[]>(initialRows);
  const [rowsProp, setRowsProp] = useState<ChatRow[]>(initialRows);
  const [pending, setPending] = useState<Pending[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  // Rolagem: `rolou` = há conversa passando por baixo do cabeçalho; `temMais` =
  // ainda há conversa por baixo da caixa de escrita. Cada um acende uma sombra
  // do lado certo, que é o jeito de a borda de 1px dizer "tem mais aqui".
  const [rolou, setRolou] = useState(false);
  const [temMais, setTemMais] = useState(false);

  const medirRolagem = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    setRolou(el.scrollTop > 4);
    setTemMais(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);
  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => medirRolagem(e.currentTarget),
    [medirRolagem],
  );
  // O esmaecimento das pontas mora no ScrollArea (prop `fade`), porque as três
  // listas da tela precisam dele. Aqui ficam só `rolou` e `temMais`, que servem
  // a outra coisa: acender a sombra no cabeçalho e na caixa de escrita.
  const bottomRef = useRef<HTMLDivElement>(null);
  /** O elemento que rola de verdade, dentro do ScrollArea. */
  const viewportRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef(phone);

  // Ressincroniza ao navegar entre conversas (o componente é reaproveitado).
  //
  // Ajuste em tempo de render, e não `useEffect` com `setState` dentro: com o
  // efeito, o React pintava a conversa NOVA com as mensagens da ANTIGA e só
  // então corrigia, o que é uma renderização em cascata e um piscar visível em
  // lista longa. Ver react.dev "adjusting state when a prop changes".
  if (rowsProp !== initialRows) {
    setRowsProp(initialRows);
    setRows(initialRows);
    setPending([]);
  }

  const refetch = useCallback(async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: true });
    if (!data) return;
    const fresh = data as ChatRow[];
    setRows(fresh);
    // Reconcilia: remove pendentes que já viraram linha no banco. Mídia casa pelo
    // media_url (o caminho no Storage); texto casa pela mensagem 'manual'.
    setPending((prev) =>
      prev.filter((p) =>
        p.mediaPath
          ? !fresh.some((r) => r.media_url === p.mediaPath)
          : !fresh.some(
            (r) => r.message_type === "manual" && r.bot_message === p.content
          )
      )
    );
  }, [phone, supabase]);

  // Realtime: mudanças nesta conversa.
  useEffect(() => {
    const channel = supabase
      .channel(`thread-${phone}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `phone=eq.${phone}`,
        },
        () => {
          void refetch();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [phone, refetch, supabase]);

  const bubbles = useMemo(() => {
    const base = rowsToBubbles(rows);
    const pend: Bubble[] = pending.map((p) => ({
      key: p.tempId,
      side: "out",
      author: "voce",
      content: p.content,
      created_at: p.created_at,
      status: p.status,
    }));
    return [...base, ...pend];
  }, [rows, pending]);

  // Ao trocar de conversa, pula pro fim sem animar; mensagens novas na mesma
  // conversa rolam suave.
  //
  // Rola o VIEWPORT direto, em vez de `bottomRef.scrollIntoView()`. Motivo
  // medido: o scrollIntoView precisa encontrar um ancestral rolável no instante
  // em que o efeito roda, e o Radix ainda não aplicou o layout do viewport
  // (o wrapper interno é `display: table`, injetado por ele na montagem). O
  // resultado era a conversa abrindo no TOPO em vez de na última mensagem.
  // O rAF garante que a medida acontece depois da pintura.
  useEffect(() => {
    const behavior: ScrollBehavior =
      phoneRef.current === phone ? "smooth" : "auto";
    phoneRef.current = phone;
    const id = requestAnimationFrame(() => {
      const el = viewportRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
      // Mede aqui também: `rolou` e `temMais` só nasceriam no primeiro evento
      // de rolagem, e até lá a máscara de esmaecimento ficaria errada (sem
      // desbotar em cima, apesar de já haver conversa escondida atrás do
      // cabeçalho).
      medirRolagem(el);
    });
    return () => cancelAnimationFrame(id);
  }, [bubbles, phone, medirRolagem]);

  const handleSend = useCallback(
    async (text: string) => {
      const tempId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        { tempId, content: text, created_at: new Date().toISOString(), status: "pending" },
      ]);
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, text }),
        });
        if (!res.ok) throw new Error("send failed");
      } catch {
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p))
        );
      }
    },
    [phone]
  );

  // Envio de mídia: o arquivo já subiu pro Storage (composer); aqui só dispara o
  // envio e mostra um pendente. A linha real chega pelo realtime (o n8n grava).
  const handleSendMedia = useCallback(
    async (media: OutgoingMedia) => {
      const tempId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        {
          tempId,
          content: media.filename,
          created_at: new Date().toISOString(),
          status: "pending",
          mediaPath: media.path,
        },
      ]);
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, media }),
        });
        if (!res.ok) throw new Error("send failed");
      } catch {
        setPending((prev) =>
          prev.map((p) => (p.tempId === tempId ? { ...p, status: "failed" } : p))
        );
      }
    },
    [phone]
  );

  const iaPausada = iaState === "pause";

  // Separadores de dia + flag de rótulo (mostra "IA"/"Você" só quando o autor
  // muda em relação ao balão anterior — agrupa sequências, estilo WhatsApp).
  const items = useMemo(() => {
    type Item =
      | { kind: "day"; label: string; key: string }
      | { kind: "marco"; label: string; key: string }
      | { kind: "bubble"; bubble: Bubble; showLabel: boolean };
    const result: Item[] = [];
    let lastDay = "";
    let lastAuthor = "";
    // Quem respondeu por último ANTES deste balão, atravessando a virada de dia:
    // a passagem de bastão da IA para o time não deixa de existir porque a
    // conversa dormiu uma noite.
    let ultimaResposta = "";
    for (const b of bubbles) {
      const day = new Date(b.created_at).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        lastAuthor = "";
        result.push({ kind: "day", label: dayLabel(b.created_at), key: `d-${day}` });
      }
      // MARCO: alguém do time assumiu. O sinal é a primeira resposta humana
      // depois de uma resposta da IA, e ele é DERIVADO, não guardado: responder
      // pelo CRM pausa a IA e atribui a conversa, então uma linha `manual`
      // logo depois de uma da IA É a passagem de bastão.
      //
      // ⚠️ SEM NOME, e isso não é descuido. O desenho escreve "Bruna assumiu a
      // conversa · 12:03", mas `chat_messages` não tem coluna de autor: quem
      // enviou pelo CRM não fica gravado em lugar nenhum. Pôr aqui o
      // responsável ATUAL da conversa seria inventar, porque ele pode ter
      // assumido meses depois, ou ser outra pessoa. Enquanto não houver autor
      // por mensagem, o marco diz o que é verdade: o time assumiu, e quando.
      if (b.author === "voce" && ultimaResposta === "ia") {
        lastAuthor = "";
        result.push({
          kind: "marco",
          label: `O time assumiu a conversa · ${formatTime(b.created_at)}`,
          key: `m-${b.key}`,
        });
      }
      if (b.author === "voce" || b.author === "ia") ultimaResposta = b.author;
      result.push({
        kind: "bubble",
        bubble: b,
        showLabel: b.author !== lastAuthor,
      });
      lastAuthor = b.author;
    }
    // ⚠️ `lastOfGroup` SAIU. Ele existia para pôr o canto serrado só no último
    // balão de uma sequência, à moda do WhatsApp. No desenho aprovado o canto
    // recortado é do AUTOR, não da posição: todo balão recebido tem o recorte
    // em cima à esquerda e todo enviado em cima à direita, sempre. Com a regra
    // antiga, um balão sozinho e um balão no meio de uma sequência tinham
    // geometrias diferentes sem que isso significasse nada para quem lê.
    return result;
  }, [bubbles]);

  const displayName = name || prettyPhone(phone);
  const ini = initials(name);
  // Hora da última mensagem publicada, para o subcabeçalho. Vem dos balões (e
  // não de `rows`) porque uma linha pode render dois balões e o que interessa
  // é o que a pessoa realmente viu por último.
  const lastAt = bubbles.length ? bubbles[bubbles.length - 1].created_at : null;
  const attendant =
    assignedUserId && members
      ? (members.find((m) => m.userId === assignedUserId) ?? null)
      : null;

  return (
    <>
      {/* Cabeçalho em DUAS faixas. Antes o nome, o telefone, o estado da IA e a
          hora da última mensagem dividiam o mesmo bloco, e o resultado lia como
          um amontoado. Em cima fica quem é a pessoa e o que dá para fazer; a
          faixa de baixo é referência, num tom próprio e com tipo menor. */}
      <header
        className={`relative z-10 shrink-0 border-b border-line bg-raised transition-shadow ${rolou ? "sombra-rolagem" : ""
          }`}
      >
        <div className="flex h-[62px] items-center gap-3.5 pl-[22px] pr-5">
          <Avatar size="lg" style={avatarPair(phone)}>
            {ini ?? <User size={16} />}
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            {/* O NOME, na tipografia de título da casa e na TINTA PRINCIPAL.
              Ele vinha pintado com a cor do avatar do contato, e era o primeiro
              item da lista do dono ("título do nome está diferente"): a cor do
              avatar existe para diferenciar UMA linha da outra numa lista de
              conversas: aqui só existe um nome, então a cor não distingue nada e
              ainda tira do nome a autoridade de ser o texto mais forte da faixa.
              18/600 em Space Grotesk, medido no desenho aprovado. */}
            <b
              data-slot="conversa-nome"
              className="truncate font-display text-titulo text-ink"
            >
              {displayName}
            </b>
            {/* O TELEFONE deixou de ser nota de rodapé. Ele e a hora da última
              mensagem eram a mesma linha cinza de 12px, coladas por um ponto
              médio, e as duas liam como sobra. No desenho o telefone é o
              endereço de WhatsApp daquela pessoa: ponto verde e tinta verde
              (`ink`, nunca `fill`), porque verde neste produto é o humano no
              WhatsApp. A hora fica ao lado, em tinta de apoio, que é o peso que
              ela merece.
              ⚠️ Não é link: não existe ação por trás dele neste produto, e um
              texto sublinhável que não leva a lugar nenhum é promessa falsa. */}
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                data-slot="conversa-telefone"
                className="flex min-w-0 items-center gap-1 text-legenda font-semibold text-human-ink"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-human"
                  aria-hidden
                />
                {/* `min-w-0` + `truncate` em vez de `shrink-0`: com `shrink-0` o
                  telefone não cabia em 1280 e ESCAPAVA da faixa, cortado pela
                  borda do cartão em vez de terminar em reticências. */}
                <span className="truncate">{prettyPhone(phone)}</span>
              </span>
              {/* ⚠️ `2xl` (1536px) e não sempre: MEDIDO em 1280, que é a janela
                dos testes e de um notebook comum. Com a lista de conversas, a
                coluna do cliente e os três controles da direita, sobram 426px
                para esta faixa, e o bloco do nome ficava com ZERO: o nome do
                contato desaparecia da tela. O desenho é desenhado em 1920, onde
                tudo cabe. A ordem de quem cede é a ordem de importância: a hora
                da última mensagem é referência passiva, então é a primeira a
                sair; depois os rótulos do chip de quem atende e do botão do
                painel, que continuam com `aria-label`; o nome nunca sai. */}
              {lastAt && (
                <span
                  data-slot="conversa-ultima"
                  className="hidden truncate text-legenda text-ink-3 2xl:block"
                  suppressHydrationWarning
                >
                  · última mensagem {formatTime(lastAt)}
                </span>
              )}
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-2">
            {/* QUEM ATENDE subiu para a mesma linha do nome (desenho aprovado).
              Morava numa segunda faixa do cabeçalho, sozinho num chip de 28px
              com meia tela vazia ao lado. Aqui ele fica encostado na chave da
              IA, que é a informação irmã: um diz quem é a pessoa responsável, o
              outro diz se a IA ainda responde. */}
            {onAssign && myUserId && (
              // Menu, e não interruptor: assumir, soltar e TRANSFERIR são a
              // mesma decisão (de quem é esta conversa), então moram no mesmo
              // controle. Transferir era um <select> perdido no painel da
              // direita.
              //
              // Os dois Roots (DropdownMenu e Tooltip) NÃO renderizam elemento.
              // Por isso os dois gatilhos se encadeiam por asChild até chegarem
              // ao mesmo <button>: se o DropdownMenuTrigger envolvesse o
              // <Tooltip>, ele estaria clonando props num nada e o menu não
              // abriria.
              <DropdownMenu open={assignOpen} onOpenChange={setAssignOpen}>
                <Tooltip>
                  <DropdownMenuTrigger asChild>
                    <TooltipTrigger asChild>
                      <Badge
                        asChild
                        variant={attendant ? "contorno" : "tracejado"}
                        className={cn(
                          // 32px e raio de controle, e não a pílula de 28px:
                          // no desenho ele é do mesmo degrau da chave da IA e
                          // do botão do painel, os três na mesma linha.
                          "h-8 cursor-pointer rounded-lg text-apoio transition-colors",
                          attendant
                            ? "bg-campo pl-1.5 pr-2.5 font-semibold hover:bg-[var(--active-bg)]"
                            : "font-medium hover:text-ink-2",
                        )}
                      >
                        <button
                          type="button"
                          // O rótulo some abaixo de 1536px (ver a nota de
                          // largura na linha do telefone), então o nome
                          // acessível vem daqui e não do texto visível: sem
                          // isto, em 1280 este botão não teria nome nenhum.
                          aria-label={
                            attendant
                              ? attendant.userId === myUserId
                                ? "Você"
                                : memberName(attendant.email)
                              : "Ninguém assumiu ainda"
                          }
                        >
                          {attendant ? (
                            <>
                              <Avatar
                                size="2xs"
                                style={avatarPair(attendant.email)}
                              >
                                {memberInitials(attendant.email).slice(0, 1)}
                              </Avatar>
                              <span className="hidden 2xl:inline">
                                {attendant.userId === myUserId
                                  ? "Você"
                                  : memberName(attendant.email)}
                              </span>
                            </>
                          ) : (
                            <>
                              <UserPlus size={13} className="shrink-0" />
                              <span className="hidden 2xl:inline">
                                Ninguém assumiu ainda
                              </span>
                            </>
                          )}
                          <ChevronDown
                            size={12}
                            className="shrink-0 text-ink-faint"
                          />
                        </button>
                      </Badge>
                    </TooltipTrigger>
                  </DropdownMenuTrigger>
                  <TooltipContent side="bottom">
                    Quem atende esta conversa
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" sideOffset={4} className="w-56">
                  {(members ?? []).map((m) => (
                    <DropdownMenuItem
                      key={m.userId}
                      onSelect={() => onAssign(m.userId)}
                    >
                      <Avatar size="2xs" style={avatarPair(m.email)}>
                        {memberInitials(m.email).slice(0, 1)}
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate">
                        {m.userId === myUserId ? "Você" : memberName(m.email)}
                      </span>
                      {m.userId === assignedUserId && (
                        <Check size={13} className="shrink-0 text-brand-ink" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  {attendant && (
                    <DropdownMenuItem
                      onSelect={() => onAssign(null)}
                      className="mt-1 border-t border-line pt-1 text-ink-3 hover:text-ink-2 focus:text-ink-2"
                    >
                      Soltar a conversa
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Interruptor da IA. Estava em 40px e dominava a faixa; agora é um
              controle do degrau `control`, do mesmo tamanho dos outros. */}
            {/* A pílula INTEIRA é a chave: o Root do Radix é ela, não o trilho.
              Assim o rótulo continua dentro do alvo de clique e o anel de foco
              cerca a pílula, como sempre cercou. Ver components/ui/switch.tsx. */}
            {iaState !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Switch
                    checked={!iaPausada}
                    onCheckedChange={onToggleIa}
                    disabled={readOnly}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-2 rounded-lg border pl-2.5 pr-2 text-apoio font-semibold transition-colors",
                      // ⚠️ PAUSADA É ÂMBAR, e não o cinza de antes. Âmbar neste
                      // produto quer dizer "precisa de você", que é exatamente o
                      // que uma IA pausada significa: a partir daqui ninguém
                      // responde sozinho. O cinza dizia "controle desligado",
                      // como se fosse uma preferência.
                      iaPausada
                        ? "border-warn-line bg-warn-surface text-warn-ink"
                        : "border-brand-line bg-brand-surface text-brand-ink",
                    )}
                  >
                    {/* O rótulo voltou a dizer só o estado da IA. Ele nomeava o
                        responsável ("Você atendendo", "Bruna atendendo") porque
                        o chip de quem atende morava numa faixa abaixo; agora os
                        dois estão lado a lado, e repetir o nome aqui seria a
                        mesma informação duas vezes em dois centímetros. */}
                    {iaPausada ? "IA pausada" : "IA ligada"}
                    <SwitchTrack checked={!iaPausada}>
                      <SwitchThumb checked={!iaPausada} />
                    </SwitchTrack>
                  </Switch>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {readOnly
                    ? "Conta bloqueada: a IA não atende enquanto a assinatura não estiver em dia"
                    : iaPausada
                      ? "IA pausada, clique para reativar (a IA volta a responder)"
                      : "IA ativa, clique para assumir (a IA para de responder)"}
                </TooltipContent>
              </Tooltip>
            )}

            {/* O botão do painel GANHOU RÓTULO. Era um ícone nu com tooltip, e
              tooltip é a legenda de quem já sabe: quem abre a conversa pela
              primeira vez não descobre que existe uma coluna de dados do
              cliente passando o mouse por um retângulo de 28px. Aceso, ele usa
              o par surface/ink da marca, nunca `fill` como tinta. */}
            {onToggleContext && (
              <Button
                variant="outline"
                size="control"
                onClick={onToggleContext}
                aria-label={contextOpen ? "Ocultar cliente" : "Ver cliente"}
                className={cn(
                  "hidden text-apoio lg:flex",
                  contextOpen &&
                  "border-brand-line bg-brand-surface text-brand-ink",
                )}
              >
                <PanelRight size={16} />
                <span className="hidden 2xl:inline">
                  {contextOpen ? "Ocultar cliente" : "Ver cliente"}
                </span>
              </Button>
            )}
          </span>
        </div>

        {/* SEGUNDA FAIXA, e ela sobreviveu por um motivo só: as TAGS.
          O desenho aprovado tem um cabeçalho de 62px, uma linha só, e leva as
          tags para a coluna de dados do cliente. Essa coluna
          (`components/ContextPanel.tsx`) é de outra rodada e está fora do que
          esta pode tocar, então apagar as tags daqui agora tiraria do produto a
          única forma de rotular uma conversa, sem destino para onde mandá-la.
          Elas ficam nesta faixa rasa até a coluna do cliente ser refeita, e aí
          esta linha inteira sai.
          ⚠️ Quem estava aqui e JÁ SUBIU é o chip de quem atende: ele agora mora
          na linha do nome, junto da chave da IA, como no desenho. */}
        <div className="flex flex-wrap items-center gap-2 px-[22px] pb-2.5">
          {conversationId != null && (
            <ContactTags conversationId={conversationId} clientId={clientId} />
          )}
        </div>
      </header>

      {/* "O CLIENTE QUER": o entendimento da IA virou FAIXA no topo da conversa
          (desenho de 18/09/2026). Antes morava só na coluna da direita, onde
          disputava atenção com dados cadastrais e sumia junto com a coluna quando
          alguém clicava em "Ocultar cliente". É a primeira pergunta que quem abre
          a conversa faz, então é a primeira linha que ele lê. */}
      {conversationId != null && (
        <AiSummary phone={phone} clientId={clientId} variante="faixa" />
      )}

      {/* ⚠️ Aqui a conversa GANHA largura, por decisão registrada: a barra
          nativa reservava 10px de layout e a do Radix é sobreposta. É a única
          mudança de pixel assumida nesta rodada. */}
      <ScrollArea
        className="min-h-0 flex-1 bg-msg"
        viewportClassName="py-3"
        viewportRef={viewportRef}
        fade
        onViewportScroll={onScroll}
      >
        {/* COLUNA DE LEITURA de 960px, centrada (medida do desenho). A conversa
            ocupava a largura inteira do cartão, e em 1920 isso dá uma linha de
            texto que atravessa meia tela: o olho perde o começo da linha
            seguinte. Os 20px de respiro lateral ficam aqui dentro para que a
            coluna encoste na moldura só quando a tela é estreita. */}
        <div className="mx-auto w-full max-w-[960px] px-5">
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

      <div
        className={`relative z-10 shrink-0 transition-shadow ${temMais ? "sombra-rolagem-topo" : ""
          }`}
      >
        <MessageComposer
          onSend={handleSend}
          onSendMedia={handleSendMedia}
          onAddNote={onAddNote}
          onInstruct={onInstruct}
          pendingInstruction={pendingInstruction}
          onCancelInstruction={onCancelInstruction}
          iaAtiva={iaState !== null && !iaPausada}
          contactName={displayName}
          clientId={clientId}
          readOnly={readOnly}
        />
      </div>
    </>
  );
}

// ⚠️ `RowAvatar` NÃO EXISTE MAIS (desenho aprovado de 18/09/2026). Cada balão
// tinha uma "carinha" de 28px do lado de fora, mais um espaçador invisível da
// mesma largura nos balões seguintes da sequência, para tudo ficar alinhado.
// Eram 56px de gutter fixo comidos dos dois lados da conversa para repetir uma
// informação que o LADO e a COR do balão já dão (recebido à esquerda em branco,
// IA à direita em roxo, você à direita em verde). No desenho a autoria é um
// rótulo dentro do próprio balão, e só no primeiro de cada sequência.
//
// Renderiza a mídia da mensagem (imagem/áudio/vídeo/documento). O bucket
// whatsapp-media é privado: quando media_url é um caminho do Storage, resolve
// para uma URL assinada temporária (RLS por tenant). Se já for uma URL http
// (compatibilidade), usa direto.
function MediaView({ url, type }: { url: string; type: string | null }) {
  const isHttp = /^https?:\/\//.test(url);
  const [resolved, setResolved] = useState<string | null>(isHttp ? url : null);

  useEffect(() => {
    // http já vem resolvido pelo estado inicial; só resolve caminho do Storage.
    if (isHttp) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(url, 3600);
      if (!cancelled) setResolved(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [url, isHttp]);

  if (!resolved) {
    return (
      <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-2 text-apoio text-ink-2">
        <FileText size={15} /> carregando mídia…
      </div>
    );
  }

  if (type === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt="Imagem"
        className="mb-1 max-h-64 w-auto rounded-lg object-cover"
      />
    );
  }
  if (type === "audio") {
    return <audio controls src={resolved} className="mb-1 w-56 max-w-full" />;
  }
  if (type === "video") {
    return <video controls src={resolved} className="mb-1 max-h-64 rounded-lg" />;
  }
  return (
    <a
      href={resolved}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-2 text-apoio font-medium underline"
    >
      <FileText size={15} /> Abrir arquivo
    </a>
  );
}

/** A pele de cada autor, medida no desenho aprovado.
 *
 * Um objeto e não uma escada de `if`: são quatro peles (as três autorias mais a
 * falha) e cada uma tem CINCO propriedades que andam juntas (fundo, tinta,
 * linha, tinta da hora e relevo). Com `if` encadeado, acrescentar a próxima
 * autoria é lembrar de cinco lugares.
 *
 * ⚠️ A LINHA de 1px é o que mudou de verdade aqui: o balão não tinha nenhuma, e
 * no tema claro o balão recebido é branco sobre cinza claríssimo, ou seja, só a
 * sombra o separava do fundo. A linha é do MATIZ do balão (verde no seu, roxo
 * no da IA), então ela é contorno e assinatura ao mesmo tempo.
 * O relevo (`--bubble-shadow`) ficou só no balão recebido, que é o único sem
 * cor de fundo própria para se destacar.
 */
const PELE: Record<
  "cliente" | "ia" | "voce" | "falha",
  { caixa: string; hora: string }
> = {
  cliente: {
    caixa:
      "border-line-soft bg-[var(--bubble-in-bg)] text-[var(--bubble-in-fg)] shadow-[var(--bubble-shadow)]",
    hora: "text-[var(--bubble-in-hora)]",
  },
  ia: {
    caixa:
      "border-brand-line bg-[var(--bubble-ia-bg)] text-[var(--bubble-ia-fg)]",
    hora: "text-[var(--bubble-ia-hora)]",
  },
  voce: {
    caixa:
      "border-human-line bg-[var(--bubble-you-bg)] text-[var(--bubble-you-fg)]",
    hora: "text-[var(--bubble-you-hora)]",
  },
  falha: {
    caixa: "border-danger-line bg-danger-surface text-danger-ink",
    hora: "text-danger-ink",
  },
};

function BubbleView({ b, showLabel }: { b: Bubble; showLabel: boolean }) {
  const out = b.side === "out";
  const failed = b.status === "failed";
  const pele = PELE[failed ? "falha" : b.author];

  return (
    <div
      className={cn(
        // 12px entre balões, sempre. Eram 16px na troca de autor e 4px dentro
        // da sequência, e a sequência apertada existia para os balões "colarem"
        // sob a mesma carinha. Sem carinha, o ritmo único é o do desenho.
        "msg-in mb-3 flex",
        out ? "justify-end" : "justify-start",
      )}
    >
      <div
        data-slot="conversa-balao"
        data-autor={failed ? "falha" : b.author}
        className={cn(
          // 620px é a largura medida no desenho, e ela é ABSOLUTA e não
          // percentual: o que limita linha de texto é o número de caracteres
          // que o olho percorre sem se perder, e isso não cresce porque a
          // janela cresceu. O `min(74%, 560px)` de antes encolhia o balão em
          // tela estreita, que é justamente onde ele precisa de mais espaço.
          "max-w-[620px] whitespace-pre-wrap break-words border px-3 pb-1.5 pt-[9px] text-corpo",
          // O canto recortado (4px) aponta para QUEM FALOU: em cima à esquerda
          // no recebido, em cima à direita no enviado. Antes era embaixo, e só
          // no último balão da sequência.
          out
            ? "rounded-[16px_4px_16px_16px]"
            : "rounded-[4px_16px_16px_16px]",
          pele.caixa,
          b.status === "pending" && "opacity-60",
        )}
      >
        {b.author !== "cliente" && showLabel && (
          // A autoria dentro do balão, no papel `rotulo` (12px, caixa alta), na
          // mesma tinta da hora. Era 12px em peso 600 com `opacity-70`, e
          // opacidade sobre fundo colorido é tinta que ninguém escolheu.
          <span
            className={cn(
              "mb-1.5 flex items-center gap-1.5 text-rotulo uppercase",
              pele.hora,
            )}
          >
            {b.author === "ia" ? <Bot size={12} /> : <User size={12} />}
            {b.author === "ia" ? "IA" : "Você"}
          </span>
        )}
        {b.mediaUrl && <MediaView url={b.mediaUrl} type={b.mediaType ?? null} />}
        {b.content}
        {/* A HORA VIROU LINHA PRÓPRIA, encostada à direita. Era um `float-right`
            com `translate-y`, truque para "Olá" não ocupar duas linhas; o preço
            era a hora se enfiando no meio do texto quando a última linha do
            balão era curta. O desenho reserva 14px de altura para ela, e o
            respiro de baixo do balão (6px) já é menor por causa disso. */}
        <span
          className={cn(
            "mt-0.5 flex h-3.5 items-center justify-end gap-1.5 text-legenda tabular-nums",
            pele.hora,
          )}
          suppressHydrationWarning
        >
          {b.status === "pending" ? (
            "enviando…"
          ) : b.status === "failed" ? (
            "falhou"
          ) : (
            <>
              {formatTime(b.created_at)}
              {/* ⚠️ ISTO É "SAIU", NÃO "FOI LIDA". O desenho chama o marcador de
                  `enviado` e é o que o dado permite: a Evolution devolve o
                  recibo de leitura por evento, e nada disso é gravado em
                  `chat_messages` (a tabela tem id, telefone, as duas mensagens,
                  o tipo, a data e a mídia). Pintar um dos traços de azul, que é
                  o que o WhatsApp faz para "lida", seria afirmar uma coisa que
                  este produto não sabe. */}
              {out && <CheckCheck size={12} aria-label="enviada" />}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
