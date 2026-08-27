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
import { Separator } from "@/components/ui/separator";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
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
      const author = r.message_type === "manual" ? "voce" : "ia";
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
      | {
        kind: "bubble";
        bubble: Bubble;
        showLabel: boolean;
        lastOfGroup: boolean;
      };
    const result: Item[] = [];
    let lastDay = "";
    let lastAuthor = "";
    for (const b of bubbles) {
      const day = new Date(b.created_at).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        lastAuthor = "";
        result.push({ kind: "day", label: dayLabel(b.created_at), key: `d-${day}` });
      }
      result.push({
        kind: "bubble",
        bubble: b,
        showLabel: b.author !== lastAuthor,
        lastOfGroup: true, // ajustado abaixo
      });
      lastAuthor = b.author;
    }
    // O rabinho (canto serrado) fica só no ÚLTIMO balão de cada sequência.
    for (let i = 0; i < result.length; i++) {
      const cur = result[i];
      const next = result[i + 1];
      if (cur.kind !== "bubble") continue;
      cur.lastOfGroup =
        !next || next.kind !== "bubble" || next.bubble.author !== cur.bubble.author;
    }
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
        className={`relative z-10 shrink-0 border-b border-line bg-conteudo transition-shadow ${rolou ? "sombra-rolagem" : ""
          }`}
      >
        <div className="flex items-center gap-3 px-4 pb-2 pt-2.5">
          <Avatar size="lg" style={avatarPair(phone)}>
            {ini ?? <User size={16} />}
          </Avatar>
          <span className="min-w-0 flex-1">
            <b
              className="block truncate text-titulo"
              style={{ color: avatarPair(phone).color }}
            >
              {displayName}
            </b>
            {/* Metadados numa linha só, com ponto médio. Isto ocupava uma faixa
              inteira de 34px logo abaixo, e o que ela carregava era referência
              passiva que ninguém aciona. */}
            <span
              className="block truncate text-legenda font-normal text-ink-3"
              suppressHydrationWarning
            >
              {prettyPhone(phone)}
              {lastAt ? ` · última mensagem ${formatTime(lastAt)}` : ""}
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-2">
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
                      "flex h-[var(--h-control)] shrink-0 items-center gap-2 rounded-lg border pl-2.5 pr-2 text-legenda font-semibold transition-colors",
                      iaPausada
                        ? "border-line-strong bg-[var(--active-bg)] text-ink-2"
                        : "border-brand-line bg-brand-surface text-brand-ink",
                    )}
                  >
                    {/* Pausada diz QUEM assumiu, não só que a IA parou: responder
                        pelo CRM passou a pausar a IA e a atribuir a conversa,
                        então o cabeçalho pode nomear o responsável em vez de
                        deixar a pessoa adivinhar de quem é aquele atendimento. */}
                    {iaPausada
                      ? attendant
                        ? attendant.userId === myUserId
                          ? "Você atendendo"
                          : `${memberName(attendant.email)} atendendo`
                        : "IA pausada"
                      : "IA ligada"}
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

            {onToggleContext && (
              <>
                <Separator
                  orientation="vertical"
                  className="h-5 bg-line"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-chrome"
                      onClick={onToggleContext}
                      aria-label={contextOpen ? "Ocultar contato" : "Ver contato"}
                      className={cn(
                        "hidden lg:flex",
                        contextOpen ? "text-brand-ink" : "text-ink-2",
                      )}
                    >
                      <PanelRight size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {contextOpen ? "Ocultar contato" : "Ver contato"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </span>
        </div>

        {/* Segunda linha: quem é o dono da conversa e como ela está classificada.
          Tudo em chip de 28px com ponto colorido sobre fundo neutro, nunca
          bloco de cor cheia. */}
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5">
          {onAssign && myUserId && (
            // Menu, e não interruptor: assumir, soltar e TRANSFERIR são a mesma
            // decisão (de quem é esta conversa), então moram no mesmo controle.
            // Transferir era um <select> perdido no painel da direita.
            <span
              className="relative shrink-0"
            >
              {/* Os dois Roots (DropdownMenu e Tooltip) NÃO renderizam elemento.
                Por isso os dois gatilhos se encadeiam por asChild até chegarem
                ao mesmo <button>: se o DropdownMenuTrigger envolvesse o
                <Tooltip>, ele estaria clonando props num nada e o menu não
                abriria. */}
              <DropdownMenu open={assignOpen} onOpenChange={setAssignOpen}>
                <Tooltip>
                  <DropdownMenuTrigger asChild>
                    <TooltipTrigger asChild>
                      <Badge
                        asChild
                        variant={attendant ? "contorno" : "tracejado"}
                        className={cn(
                          "cursor-pointer transition-colors",
                          attendant
                            ? "pl-1 pr-2.5 hover:bg-[var(--active-bg)]"
                            : "hover:text-ink-2",
                        )}
                      >
                        <button type="button">
                          {attendant ? (
                            <>
                              <Avatar
                                size="2xs"
                                style={avatarPair(attendant.email)}
                              >
                                {memberInitials(attendant.email).slice(0, 1)}
                              </Avatar>
                              {attendant.userId === myUserId
                                ? "Você"
                                : memberName(attendant.email)}
                            </>
                          ) : (
                            <>
                              <UserPlus size={13} className="shrink-0" />
                              Ninguém assumiu ainda
                            </>
                          )}
                          <ChevronDown size={12} className="shrink-0 opacity-60" />
                        </button>
                      </Badge>
                    </TooltipTrigger>
                  </DropdownMenuTrigger>
                  <TooltipContent side="bottom">
                    Quem atende esta conversa
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                  align="start"
                  sideOffset={4}
                  className="w-56"
                >
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

            </span>
          )}

          {/* O chip "IA respondendo" morava aqui e dizia a MESMA coisa que a
            chave logo acima, a dois centímetros de distância: o estado da IA
            aparecia duas vezes na mesma faixa. Quem manda é a chave, que além
            de informar deixa agir. */}
          {conversationId != null && (
            <ContactTags conversationId={conversationId} clientId={clientId} />
          )}
        </div>
      </header>

      {/* ⚠️ Aqui a conversa GANHA largura, por decisão registrada: a barra
          nativa reservava 10px de layout e a do Radix é sobreposta. É a única
          mudança de pixel assumida nesta rodada. */}
      <ScrollArea
        className="min-h-0 flex-1 bg-msg"
        viewportClassName="p-4"
        viewportRef={viewportRef}
        fade
        onViewportScroll={onScroll}
      >
        {items.map((item) =>
          item.kind === "day" ? (
            <div key={item.key} className="flex justify-center py-3">
              <Badge variant="dia">{item.label}</Badge>
            </div>
          ) : (
            <BubbleView
              key={item.bubble.key}
              b={item.bubble}
              showLabel={item.showLabel}
              newGroup={item.showLabel}
              lastOfGroup={item.lastOfGroup}
              contactName={name}
              phone={phone}
            />
          )
        )}
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

function RowAvatar({
  author,
  contactName,
  phone,
  show,
}: {
  author: Bubble["author"];
  contactName: string | null;
  phone: string;
  show: boolean;
}) {
  // Gutter fixo: mostra a "carinha" só no 1º balão da sequência; senão espaça
  // para os balões do mesmo autor ficarem alinhados.
  if (!show) return <div className="w-7 shrink-0" aria-hidden />;

  let cls = "text-white";
  let style: React.CSSProperties | undefined;
  let content: React.ReactNode;
  if (author === "ia") {
    cls = "brand-grad";
    content = <Bot size={14} />;
  } else if (author === "voce") {
    style = { background: "var(--send)" };
    content = <User size={14} />;
  } else {
    style = avatarPair(phone);
    content = initials(contactName) ?? <User size={14} />;
  }

  return (
    <Avatar size="xs" className={cn("self-end text-white", cls)} style={style}>
      {content}
    </Avatar>
  );
}

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

function BubbleView({
  b,
  showLabel,
  newGroup,
  lastOfGroup,
  contactName,
  phone,
}: {
  b: Bubble;
  showLabel: boolean;
  newGroup: boolean;
  lastOfGroup: boolean;
  contactName: string | null;
  phone: string;
}) {
  const out = b.side === "out";
  const failed = b.status === "failed";

  // Padrão WhatsApp: recebido (cliente) branco/cinza; você = verde; IA = roxo.
  // Sem borda; relevo leve via --bubble-shadow (só no light).
  let bubbleClass: string;
  if (failed) {
    bubbleClass = "bg-danger-surface text-danger-ink";
  } else if (b.author === "voce") {
    bubbleClass = "bg-[var(--bubble-you-bg)] text-[var(--bubble-you-fg)]";
  } else if (b.author === "ia") {
    bubbleClass = "bg-[var(--bubble-ia-bg)] text-[var(--bubble-ia-fg)]";
  } else {
    bubbleClass = "bg-[var(--bubble-in-bg)] text-[var(--bubble-in-fg)]";
  }

  // Rabinho (canto serrado) só no último da sequência.
  const tail = lastOfGroup ? (out ? "rounded-br-md" : "rounded-bl-md") : "";

  const done = !failed && b.status !== "pending";
  const author = failed ? "voce" : b.author;

  return (
    <div
      className={`msg-in flex items-end gap-2 ${newGroup ? "mt-4" : "mt-1"} ${out ? "justify-end" : "justify-start"
        }`}
    >
      {!out && (
        <RowAvatar
          author={author}
          contactName={contactName}
          phone={phone}
          show={lastOfGroup}
        />
      )}
      <div
        className={`max-w-[min(74%,560px)] whitespace-pre-wrap break-words rounded-[11px] px-3.5 py-2.5 text-corpo leading-[21px] shadow-[var(--bubble-shadow)] ${tail} ${bubbleClass} ${b.status === "pending" ? "opacity-60" : ""
          }`}
      >
        {b.author !== "cliente" && showLabel && (
          <span className="mb-0.5 flex items-center gap-1 text-legenda font-semibold opacity-70">
            {b.author === "ia" ? <Bot size={12} /> : <User size={12} />}
            {b.author === "ia" ? "IA" : "Você"}
          </span>
        )}
        {b.mediaUrl && <MediaView url={b.mediaUrl} type={b.mediaType ?? null} />}
        {b.content}
        {/* Hora inline (float) — evita que "Olá" ocupe duas linhas. */}
        <span
          className="float-right ml-2.5 translate-y-[6px] text-legenda tabular-nums opacity-55"
          suppressHydrationWarning
        >
          {b.status === "pending" ? (
            "enviando…"
          ) : b.status === "failed" ? (
            "falhou"
          ) : (
            <span className="inline-flex items-center gap-1">
              {formatTime(b.created_at)}
              {out && done && <CheckCheck size={12} />}
            </span>
          )}
        </span>
      </div>
      {out && (
        <RowAvatar
          author={author}
          contactName={contactName}
          phone={phone}
          show={lastOfGroup}
        />
      )}
    </div>
  );
}
