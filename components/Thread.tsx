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
  const [pending, setPending] = useState<Pending[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  // Rolagem: `rolou` = há conversa passando por baixo do cabeçalho; `temMais` =
  // ainda há conversa por baixo da caixa de escrita. Cada um acende uma sombra
  // do lado certo, que é o jeito de a borda de 1px dizer "tem mais aqui".
  const [rolou, setRolou] = useState(false);
  const [temMais, setTemMais] = useState(false);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setRolou(el.scrollTop > 4);
    setTemMais(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef(phone);

  // Ressincroniza ao navegar entre conversas (o componente é reaproveitado).
  useEffect(() => {
    setRows(initialRows);
    setPending([]);
  }, [initialRows]);

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
  useEffect(() => {
    const behavior: ScrollBehavior =
      phoneRef.current === phone ? "smooth" : "auto";
    phoneRef.current = phone;
    bottomRef.current?.scrollIntoView({ behavior });
  }, [bubbles, phone]);

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
        className={`relative z-10 shrink-0 border-b border-line bg-conteudo transition-shadow ${
          rolou ? "sombra-rolagem" : ""
        }`}
      >
      <div className="flex items-center gap-3 px-4 pb-2 pt-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-legenda font-semibold"
          style={avatarPair(phone)}
        >
          {ini ?? <User size={16} />}
        </span>
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
          {iaState !== null && (
            <button
              onClick={onToggleIa}
              disabled={readOnly}
              role="switch"
              aria-checked={!iaPausada}
              title={
                readOnly
                  ? "Conta bloqueada: a IA não atende enquanto a assinatura não estiver em dia"
                  : iaPausada
                    ? "IA pausada, clique para reativar (a IA volta a responder)"
                    : "IA ativa, clique para assumir (a IA para de responder)"
              }
              className={`flex h-[var(--h-control)] shrink-0 items-center gap-2 rounded-lg border pl-2.5 pr-2 text-legenda font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                iaPausada
                  ? "border-line-strong bg-[var(--active-bg)] text-ink-2"
                  : "border-brand-line bg-brand-surface text-brand-ink"
              }`}
            >
              {iaPausada ? "IA pausada" : "IA ligada"}
              <span
                className={`relative flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors ${
                  iaPausada
                    ? "border-line-strong bg-campo"
                    : "border-transparent bg-brand"
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-full transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] ${
                    iaPausada
                      ? "translate-x-[1px] bg-[var(--ink-3)]"
                      : "translate-x-[13px] bg-white"
                  }`}
                />
              </span>
            </button>
          )}

          {onToggleContext && (
            <>
              <span aria-hidden className="h-5 w-px shrink-0 bg-line" />
              <button
                onClick={onToggleContext}
                title={contextOpen ? "Ocultar contato" : "Ver contato"}
                aria-label={contextOpen ? "Ocultar contato" : "Ver contato"}
                className={`hidden h-[var(--h-chrome)] w-[var(--h-chrome)] shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--active-bg)] lg:flex ${
                  contextOpen ? "text-brand-ink" : "text-ink-2"
                }`}
              >
                <PanelRight size={16} />
              </button>
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
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setAssignOpen(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAssignOpen(false);
            }}
          >
            <button
              type="button"
              onClick={() => setAssignOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={assignOpen}
              title="Quem atende esta conversa"
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full text-legenda transition-colors ${
                attendant
                  ? "border border-line bg-bloco pl-1 pr-2.5 text-ink-2 hover:bg-[var(--active-bg)]"
                  : "border border-dashed border-line-strong px-2.5 text-ink-3 hover:text-ink-2"
              }`}
            >
              {attendant ? (
                <>
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={avatarPair(attendant.email)}
                  >
                    {memberInitials(attendant.email).slice(0, 1)}
                  </span>
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

            {assignOpen && (
              <span
                role="menu"
                className="absolute left-0 top-8 z-20 flex w-56 flex-col rounded-xl border border-line bg-conteudo p-1 shadow-[0_10px_30px_-12px_rgba(23,17,40,0.45)]"
              >
                {(members ?? []).map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAssign(m.userId);
                      setAssignOpen(false);
                    }}
                    className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-legenda text-ink-2 transition-colors hover:bg-[var(--active-bg)]"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                      style={avatarPair(m.email)}
                    >
                      {memberInitials(m.email).slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {m.userId === myUserId
                        ? "Você"
                        : memberName(m.email)}
                    </span>
                    {m.userId === assignedUserId && (
                      <Check size={13} className="shrink-0 text-brand-ink" />
                    )}
                  </button>
                ))}
                {attendant && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onAssign(null);
                      setAssignOpen(false);
                    }}
                    className="mt-1 flex h-8 items-center gap-2 rounded-lg border-t border-line px-2 pt-1 text-left text-legenda text-ink-3 transition-colors hover:bg-[var(--active-bg)] hover:text-ink-2"
                  >
                    Soltar a conversa
                  </button>
                )}
              </span>
            )}
          </span>
        )}

        {iaState !== null && (
          <span
            title="Estado do agente de IA"
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line bg-bloco px-2.5 text-legenda font-normal text-ink-2"
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                iaPausada ? "bg-warn" : "bg-brand"
              }`}
            />
            {iaPausada ? "IA pausada" : "IA respondendo"}
          </span>
        )}

        {conversationId != null && (
          <>
            <span aria-hidden className="h-4 w-px shrink-0 bg-line" />
            <ContactTags conversationId={conversationId} clientId={clientId} />
          </>
        )}
      </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-msg p-4" onScroll={onScroll}>
        {items.map((item) =>
          item.kind === "day" ? (
            <div key={item.key} className="flex justify-center py-3">
              <span className="rounded-full bg-panel px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                {item.label}
              </span>
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
      </div>

      <div
        className={`relative z-10 shrink-0 transition-shadow ${
          temMais ? "sombra-rolagem-topo" : ""
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
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center self-end rounded-full text-[10px] font-semibold text-white ${cls}`}
      style={style}
    >
      {content}
    </div>
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
      <div className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-2 text-[13px] text-ink-muted">
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
      className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-2 text-[13px] font-medium underline"
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
    bubbleClass = "bg-[var(--danger-bg)] text-danger";
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
      className={`msg-in flex items-end gap-2 ${newGroup ? "mt-4" : "mt-1"} ${
        out ? "justify-end" : "justify-start"
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
        className={`max-w-[min(74%,560px)] whitespace-pre-wrap break-words rounded-[11px] px-3.5 py-2.5 text-[14.5px] leading-[21px] shadow-[var(--bubble-shadow)] ${tail} ${bubbleClass} ${
          b.status === "pending" ? "opacity-60" : ""
        }`}
      >
        {b.author !== "cliente" && showLabel && (
          <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold opacity-70">
            {b.author === "ia" ? <Bot size={12} /> : <User size={12} />}
            {b.author === "ia" ? "IA" : "Você"}
          </span>
        )}
        {b.mediaUrl && <MediaView url={b.mediaUrl} type={b.mediaType ?? null} />}
        {b.content}
        {/* Hora inline (float) — evita que "Olá" ocupe duas linhas. */}
        <span
          className="float-right ml-2.5 translate-y-[6px] text-[11px] tabular-nums opacity-55"
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
