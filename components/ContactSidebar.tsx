"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  User,
  Bot,
  SlidersHorizontal,
  ChevronDown,
  Check,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTime, prettyPhone } from "@/lib/format";
import {
  buildInbox,
  initials,
  avatarPair,
  type ConvRow,
  type ContatoRow,
} from "@/lib/inbox";
import { fetchMembers, memberName, memberInitials, type Member } from "@/lib/team";
import type { InboxItem } from "@/lib/types";

function isPaused(state: string | null | undefined): boolean {
  return state === "pause";
}

// Os quatro cortes da lista. Viraram UM seletor com menu, e não quatro chips
// lado a lado: com quatro rótulos a fila quebrava em duas linhas numa coluna de
// 296px, e duas linhas de chip no topo é o que dava aspecto de rascunho.
type FiltroKey = "all" | "unanswered" | "mine" | "needs";

const ROTULO: Record<FiltroKey, string> = {
  all: "Todas",
  unanswered: "Sem resposta",
  mine: "Suas",
  needs: "Precisa de você",
};

// Trecho curto ao redor do termo encontrado, para mostrar onde bateu.
function makeSnippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.length > 64 ? `${text.slice(0, 64)}…` : text;
  const start = Math.max(0, i - 24);
  const end = Math.min(text.length, i + q.length + 40);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${
    end < text.length ? "…" : ""
  }`;
}

export default function ContactSidebar({
  initial,
  initialIa,
  activePhone,
  myUserId,
}: {
  initial: InboxItem[];
  initialIa: Record<string, string | null>;
  /** Só para o preview de design (/design): força a conversa "aberta". */
  activePhone?: string;
  /** Sem ele o filtro "Suas" não aparece (não dá para saber o que é seu). */
  myUserId?: string;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<InboxItem[]>(initial);
  const [iaByPhone, setIaByPhone] =
    useState<Record<string, string | null>>(initialIa);
  const [membersById, setMembersById] = useState<Record<string, Member>>({});
  // phone -> resumo da IA (motivo do handoff), da última qualificação.
  const [qualByPhone, setQualByPhone] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  // "unanswered" = a última mensagem foi do contato, ou seja, a bola está com a
  // gente. É o corte que o operador realmente faz ao abrir a tela.
  const [filter, setFilter] = useState<FiltroKey>("all");
  const [filtroAberto, setFiltroAberto] = useState(false);
  // phone -> texto da mensagem que casou com a busca (conteúdo, não só nome).
  const [msgMatches, setMsgMatches] = useState<Record<string, string>>({});
  const pathname = usePathname();

  const refetch = useCallback(async () => {
    const [{ data: convs }, { data: contatos }, { data: quals }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select(
            "phone, last_message_at, last_message_preview, last_message_from, unread_count, assigned_user_id"
          )
          .order("last_message_at", { ascending: false })
          .limit(500),
        supabase
          .from("dados_cliente")
          .select("telefone, nomewpp, atendimento_ia, display_name"),
        supabase
          .from("conversation_qualifications")
          .select("phone, summary")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
    const { items: next, ia } = buildInbox(
      (convs ?? []) as ConvRow[],
      (contatos ?? []) as ContatoRow[]
    );
    // Última qualificação por telefone (a lista já vem do mais recente).
    const qmap: Record<string, string> = {};
    for (const q of (quals ?? []) as { phone: string; summary: string | null }[]) {
      if (!qmap[q.phone] && q.summary) qmap[q.phone] = q.summary;
    }
    setItems(next);
    setIaByPhone(ia);
    setQualByPhone(qmap);
  }, [supabase]);

  // Realtime: uma mudança nas conversas (o trigger atualiza a cada mensagem) ou
  // no estado da IA re-busca a lista.
  useEffect(() => {
    const channel = supabase
      .channel("inbox-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void refetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dados_cliente" },
        () => void refetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_qualifications" },
        () => void refetch()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch, supabase]);

  // Membros do time (para nomear o atendente de cada conversa). Mudam raramente;
  // uma busca no mount basta (a navegação entre páginas revalida).
  useEffect(() => {
    void (async () => {
      const list = await fetchMembers(supabase);
      setMembersById(Object.fromEntries(list.map((m) => [m.userId, m])));
    })();
  }, [supabase]);

  // Busca no CONTEÚDO das mensagens (debounce). A RLS restringe chat_messages ao
  // tenant. Guarda o texto que casou para mostrar o trecho na lista.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) setMsgMatches({});
        return;
      }
      const like = `%${q}%`;
      const [{ data: a }, { data: b }] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("phone, user_message, bot_message")
          .ilike("user_message", like)
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("chat_messages")
          .select("phone, user_message, bot_message")
          .ilike("bot_message", like)
          .order("created_at", { ascending: false })
          .limit(60),
      ]);
      if (cancelled) return;
      const ql = q.toLowerCase();
      const map: Record<string, string> = {};
      const rows = [...(a ?? []), ...(b ?? [])] as {
        phone: string;
        user_message: string | null;
        bot_message: string | null;
      }[];
      for (const r of rows) {
        if (map[r.phone]) continue;
        const text =
          r.user_message && r.user_message.toLowerCase().includes(ql)
            ? r.user_message
            : r.bot_message && r.bot_message.toLowerCase().includes(ql)
              ? r.bot_message
              : null;
        if (text) map[r.phone] = text;
      }
      setMsgMatches(map);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, supabase]);

  const needsCount = useMemo(
    () => items.filter((it) => isPaused(iaByPhone[it.phone])).length,
    [items, iaByPhone]
  );
  const unansweredCount = useMemo(
    () => items.filter((it) => it.lastFrom === "in").length,
    [items]
  );
  const mineCount = useMemo(
    () => (myUserId ? items.filter((it) => it.assignedUserId === myUserId).length : 0),
    [items, myUserId]
  );

  const contagem: Record<FiltroKey, number> = {
    all: items.length,
    unanswered: unansweredCount,
    mine: mineCount,
    needs: needsCount,
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => {
        if (filter === "needs" && !isPaused(iaByPhone[it.phone])) return false;
        if (filter === "unanswered" && it.lastFrom !== "in") return false;
        if (filter === "mine" && it.assignedUserId !== myUserId) return false;
        if (!q) return true;
        const name = (it.name ?? "").toLowerCase();
        if (name.includes(q) || it.phone.includes(q)) return true;
        return msgMatches[it.phone] != null; // casou no conteúdo da mensagem
      })
      .map((it) => {
        const name = (it.name ?? "").toLowerCase();
        const byNameOrPhone =
          !!q && (name.includes(q) || it.phone.includes(q));
        // Só mostra o trecho quando casou no conteúdo (e não já pelo nome).
        const snippet =
          q && !byNameOrPhone && msgMatches[it.phone]
            ? makeSnippet(msgMatches[it.phone], query.trim())
            : null;
        return { it, snippet };
      });
  }, [items, iaByPhone, query, filter, msgMatches, myUserId]);

  return (
    <aside className="cartao flex w-[296px] shrink-0 flex-col overflow-hidden rounded-2xl">
      <div className="relative border-b border-line p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="text-titulo">Conversas</h2>
          {/* Só o número: "abertas" não informa nada que o título já não diga. */}
          <span className="rounded-md bg-[var(--chip-bg)] px-1.5 py-0.5 text-legenda tabular-nums text-[var(--chip-fg)]">
            {items.length}
          </span>
        </div>

        {/* Seletor de filtro mais o atalho de urgente. "Precisa de você" ganha
            botão próprio porque é o corte que faz alguém largar o que está
            fazendo; os outros três moram no menu. */}
        <div
          className="flex items-center gap-1.5"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setFiltroAberto(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFiltroAberto(false);
          }}
        >
          <button
            type="button"
            onClick={() => setFiltroAberto((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={filtroAberto}
            className="flex h-[var(--h-control)] min-w-0 flex-1 items-center gap-2 rounded-lg border border-line px-2.5 text-legenda font-semibold text-ink transition-colors hover:bg-[var(--active-bg)]"
          >
            <SlidersHorizontal size={14} className="shrink-0 text-ink-3" />
            <span className="min-w-0 truncate">{ROTULO[filter]}</span>
            <span className="shrink-0 tabular-nums text-ink-3">
              {contagem[filter]}
            </span>
            <ChevronDown size={14} className="ml-auto shrink-0 text-ink-3" />
          </button>

          {needsCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilter((f) => (f === "needs" ? "all" : "needs"))
              }
              aria-pressed={filter === "needs"}
              title="Precisa de você"
              className={`flex h-[var(--h-control)] shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-legenda font-semibold text-warn-ink transition-colors ${
                filter === "needs"
                  ? "border-[var(--warn-line)] bg-[var(--warn-surface)]"
                  : "border-line hover:bg-[var(--warn-surface)]"
              }`}
            >
              <TriangleAlert size={14} className="shrink-0" />
              <span className="tabular-nums">{needsCount}</span>
            </button>
          )}

          {filtroAberto && (
            <div
              role="menu"
              className="absolute left-3 right-3 top-[88px] z-20 flex flex-col rounded-xl border border-line bg-conteudo p-1 shadow-[0_12px_28px_-12px_rgba(20,12,45,0.45)]"
            >
              {(["all", "unanswered", "mine", "needs"] as FiltroKey[])
                .filter((k) => k !== "mine" || myUserId)
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setFilter(k);
                      setFiltroAberto(false);
                    }}
                    className={`flex h-[34px] items-center gap-2 rounded-lg px-2 text-left text-legenda transition-colors hover:bg-[var(--active-bg)] ${
                      filter === k ? "font-semibold text-ink" : "text-ink-2"
                    }`}
                  >
                    <span className="flex w-3.5 shrink-0 text-brand-ink">
                      {filter === k && <Check size={14} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{ROTULO[k]}</span>
                    <span className="shrink-0 tabular-nums text-ink-3">
                      {contagem[k]}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Busca depois dos filtros: recortar por estado é o gesto de todo dia,
            buscar é a exceção. */}
        <div className="mt-1.5 flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-3 transition-colors focus-within:border-brand-line">
          <Search size={15} className="shrink-0 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nome ou mensagem"
            aria-label="Buscar conversas e mensagens"
            className="w-full bg-transparent text-apoio placeholder:text-ink-3"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && (
          <div className="p-4 text-sm text-ink-dim">
            {query.trim()
              ? "Nada encontrado."
              : filter === "needs"
                ? "Nenhuma conversa precisa de você."
                : filter === "unanswered"
                  ? "Nenhuma conversa esperando resposta."
                  : filter === "mine"
                    ? "Nenhuma conversa atribuída a você."
                    : "Nenhuma conversa ainda."}
          </div>
        )}
        <ul>
          {results.map(({ it, snippet }) => {
            const { phone, name, lastPreview, lastFrom, lastMessageAt } = it;
            const href = `/inbox/${encodeURIComponent(phone)}`;
            const active = activePhone ? activePhone === phone : pathname === href;
            const paused = isPaused(iaByPhone[phone]);
            // Motivo da IA (resumo) quando a conversa está com a IA pausada.
            const reason = paused && qualByPhone[phone] ? qualByPhone[phone] : null;
            const att = it.assignedUserId ? membersById[it.assignedUserId] : null;
            // Ao abrir a conversa você a está lendo, então não mostra badge.
            const unread = active ? 0 : it.unread;
            const label = name || prettyPhone(phone);
            const ini = initials(name);
            const cleanPreview = lastPreview.replace(/ \| /g, "  ");
            const preview =
              lastFrom === "out" ? `Você: ${cleanPreview}` : cleanPreview;
            return (
              <li key={phone}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex gap-2.5 border-b border-line border-l-[3px] px-3 py-2.5 transition-colors duration-100 ${
                    active
                      ? "border-l-[var(--sel-bar)] bg-[var(--active-bg)]"
                      : "border-l-transparent hover:bg-[var(--active-bg)]"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                      style={avatarPair(phone)}
                    >
                      {ini ?? <User size={16} />}
                    </div>
                    {paused && (
                      <span
                        title="Você está atendendo (IA pausada)"
                        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-warn ring-2 ring-surface"
                      />
                    )}
                    {att && (
                      <span
                        title={`Atendente: ${memberName(att.email)}`}
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ring-2 ring-surface"
                        style={avatarPair(att.email)}
                      >
                        {memberInitials(att.email).slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`truncate text-[14.5px] ${
                          active || unread > 0 ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {label}
                      </span>
                      <span
                        className={`shrink-0 text-[11.5px] tabular-nums ${
                          paused ? "font-medium text-warn" : "text-ink-dim"
                        }`}
                        suppressHydrationWarning
                      >
                        {formatTime(lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      {snippet ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-[12.5px] text-ink-muted">
                          <Search size={11} className="shrink-0 opacity-70" />
                          <span className="truncate italic">{snippet}</span>
                        </span>
                      ) : reason ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-[12.5px] text-warn">
                          <Bot size={11} className="shrink-0 opacity-80" />
                          <span className="truncate">{reason}</span>
                        </span>
                      ) : (
                        <span
                          className={`block truncate text-[13px] ${
                            unread > 0 ? "text-ink" : "text-ink-muted"
                          }`}
                        >
                          {preview}
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="brand-grad flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
