"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, User, CheckCheck, PanelRight, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTime, prettyPhone } from "@/lib/format";
import { initials, avatarColor } from "@/lib/inbox";
import type { Bubble, ChatRow } from "@/lib/types";
import MessageComposer, { type OutgoingMedia } from "./MessageComposer";

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
}: {
  phone: string;
  name: string | null;
  iaState: string | null;
  onToggleIa: () => void;
  initialRows: ChatRow[];
  onToggleContext?: () => void;
  contextOpen?: boolean;
  clientId: string;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<ChatRow[]>(initialRows);
  const [pending, setPending] = useState<Pending[]>([]);
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

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel text-xs font-medium text-ink-muted ring-1 ring-line">
          {ini ?? <User size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{displayName}</div>
          <div className="text-xs text-ink-muted">{prettyPhone(phone)}</div>
        </div>

        {/* Toggle claro de liga/desliga da IA nesta conversa. */}
        {iaState !== null && (
          <button
            onClick={onToggleIa}
            role="switch"
            aria-checked={!iaPausada}
            title={
              iaPausada
                ? "IA pausada — clique para reativar (a IA volta a responder)"
                : "IA ativa — clique para assumir (a IA para de responder)"
            }
            className="flex shrink-0 items-center gap-2 rounded-full border border-line px-2.5 py-1 transition-colors hover:bg-[var(--active-bg)]"
          >
            <span
              className={`text-xs font-medium ${
                iaPausada ? "text-ia" : "text-accent"
              }`}
            >
              {iaPausada ? "Você atende" : "IA ativa"}
            </span>
            <span
              className={`relative h-4 w-8 rounded-full transition-colors ${
                iaPausada ? "bg-[var(--ia)]" : "bg-[var(--accent)]"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                  iaPausada ? "left-0.5" : "left-4"
                }`}
              />
            </span>
          </button>
        )}

        {onToggleContext && (
          <button
            onClick={onToggleContext}
            title={contextOpen ? "Ocultar contato" : "Ver contato"}
            aria-label={contextOpen ? "Ocultar contato" : "Ver contato"}
            className={`hidden shrink-0 rounded-lg p-1.5 transition-colors hover:bg-[var(--active-bg)] lg:block ${
              contextOpen ? "text-accent" : "text-ink-muted"
            }`}
          >
            <PanelRight size={18} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto bg-chat p-4">
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

      <MessageComposer
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        iaAtiva={iaState !== null && !iaPausada}
        clientId={clientId}
      />
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
    style = { background: avatarColor(phone) };
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
