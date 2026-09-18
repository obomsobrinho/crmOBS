"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  User,
  Bot,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatEspera, formatTime, prettyPhone } from "@/lib/format";
import {
  buildInbox,
  initials,
  avatarPair,
  type ConvRow,
  type ContatoRow,
} from "@/lib/inbox";
import { fetchMembers, memberName, memberInitials, type Member } from "@/lib/team";
import { quemAtende } from "@/lib/crm";
import { ouvirIa } from "@/lib/ia-bus";
import QuemAtendeBadge, { quemAtendeTexto } from "./QuemAtendeBadge";
import type { InboxItem } from "@/lib/types";

function isPaused(state: string | null | undefined): boolean {
  return state === "pause";
}

// "Precisa de você" = existe handoff em aberto. Ponto.
//
// A regra JÁ FOI duas outras coisas, e as duas estavam erradas por motivos
// diferentes. Primeiro foi "IA pausada", que misturava "a IA pediu ajuda" com
// "alguém já assumiu" e transformava a lista em depósito (46 dos 47 contatos da
// OBM caíam nela). Depois passou a excluir conversa pausada, com o argumento de
// que "se um humano assumiu, ela não espera por ninguém".
//
// O argumento caiu em 22/08/2026, por uma observação do dono do produto:
// **assumir não é resolver.** Dá para responder uma coisa e o pedido continuar
// pendente, então pausa e handoff coexistem. O que fecha a pendência é o botão
// Resolvido (`POST /api/conversations/resolve`), que antes não existia, e era só
// por isso que a pausa fazia esse papel.
//
// Quem atende é OUTRA pergunta, respondida por `quemAtende` (lib/crm).
function needsYou(it: InboxItem): boolean {
  return it.handoffAt != null;
}

// Os quatro cortes da lista. Viraram UM seletor com menu, e não quatro chips
// lado a lado: com quatro rótulos a fila quebrava em duas linhas numa coluna de
// 296px, e duas linhas de chip no topo é o que dava aspecto de rascunho.
type FiltroKey = "all" | "unanswered" | "mine" | "needs";

/**
 * Em que grupo a conversa entra na lista (desenho de 18/09/2026).
 *
 * A ordem é a da urgência, e é ela que faz a lista responder "por onde eu
 * começo?" sem ninguém filtrar nada: quem espera por você, depois o que o time
 * já assumiu, depois o que a IA está tocando sozinha.
 *
 * ⚠️ O grupo é DERIVADO do mesmo dado dos filtros (handoff aberto, responsável),
 * nunca de um campo novo: dois jeitos de dizer "esperando você" é como a lista e
 * o contador passam a discordar.
 */
type Grupo = "espera" | "time" | "ia";

const GRUPO_ROTULO: Record<Grupo, string> = {
  espera: "Esperando você",
  time: "Assumidas pelo time",
  ia: "A IA está atendendo",
};

const GRUPO_ORDEM: Grupo[] = ["espera", "time", "ia"];

function grupoDe(it: InboxItem): Grupo {
  if (needsYou(it)) return "espera";
  return it.assignedUserId ? "time" : "ia";
}

/**
 * Rótulo CURTO, para o chip. "Precisa de você" não cabe na faixa de 296px e
 * "Esperando" é como o grupo da lista já chama a mesma coisa: dois nomes para o
 * mesmo recorte é o começo de duas contagens diferentes.
 */
const CHIP_ROTULO: Record<FiltroKey, string> = {
  all: "Todas",
  unanswered: "Sem resposta",
  mine: "Suas",
  needs: "Esperando",
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
  // phone -> texto da mensagem que casou com a busca (conteúdo, não só nome).
  const [msgMatches, setMsgMatches] = useState<Record<string, string>>({});
  const pathname = usePathname();

  const refetch = useCallback(async () => {
    const [{ data: convs }, { data: contatos }, { data: quals }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select(
            "phone, last_message_at, last_message_preview, last_message_from, unread_count, assigned_user_id, handoff_at"
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
  //
  // ⚠️ O REALTIME CAI, E A LISTA PRECISA SABER DISSO. Antes o `.subscribe()` era
  // chamado sem callback, então `CHANNEL_ERROR` e `TIMED_OUT` passavam em
  // silêncio: se o WebSocket morria (máquina dormiu, queda de rede, aba parada há
  // horas), a lista congelava com os números que tinha e só F5 consertava. Foi
  // assim que uma bolinha de 4 não lidas ficou acesa com o banco já em zero.
  // `SUBSCRIBED` chega de novo a cada reassinatura automática do supabase-js, e é
  // exatamente aí que a lista pode estar velha: entre a queda e a volta ninguém
  // recebeu evento. A PRIMEIRA assinatura é pulada de propósito, porque nessa
  // hora `initial` acabou de vir do servidor e re-buscar seriam três consultas
  // jogadas fora em toda abertura do inbox.
  useEffect(() => {
    let primeira = true;
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
      .subscribe((status: string) => {
        if (status !== "SUBSCRIBED") return;
        if (primeira) {
          primeira = false;
          return;
        }
        void refetch();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch, supabase]);

  // Rede de segurança do de cima: voltar para a aba re-busca a lista.
  //
  // A reassinatura cobre a queda que o cliente PERCEBE. Esta cobre a que ele não
  // percebe: um socket derrubado pelo sistema operacional enquanto a máquina
  // dormia pode demorar a ser detectado, e nesse meio-tempo a pessoa está olhando
  // número velho. Voltar o foco é o instante exato em que ela vai acreditar no
  // que está na tela.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [refetch]);

  // A chave da IA virou AGORA, no cabeçalho da conversa. O realtime acima também
  // vai chegar, mas depois de ir ao Postgres, voltar pelo WebSocket e re-buscar
  // três tabelas, e nesse intervalo a marca do avatar mostrava o estado antigo
  // enquanto a chave já mostrava o novo. Aqui a correção é local e imediata.
  useEffect(() => ouvirIa(({ phone, estado }) => {
    setIaByPhone((m) => (m[phone] === estado ? m : { ...m, [phone]: estado }));
  }), []);

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

  // Sem `iaByPhone` nas dependências: a fila deixou de depender do estado da IA
  // quando "precisa de você" passou a ser só handoff em aberto.
  const needsCount = useMemo(
    () => items.filter((it) => needsYou(it)).length,
    [items]
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
        if (filter === "needs" && !needsYou(it)) return false;
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
      })
      // Ordena por GRUPO só quando a lista está inteira e sem busca. Com filtro
      // ou busca ativos o recorte já É o agrupamento, e reordenar ali só faria o
      // resultado da busca sair de uma ordem que a pessoa não pediu.
      .sort((a, b) =>
        filter === "all" && !q
          ? GRUPO_ORDEM.indexOf(grupoDe(a.it)) - GRUPO_ORDEM.indexOf(grupoDe(b.it))
          : 0
      );
  }, [items, query, filter, msgMatches, myUserId]);

  // Quantas conversas em cada grupo, para o cabeçalho de seção.
  const porGrupo = useMemo(() => {
    const c: Record<Grupo, number> = { espera: 0, time: 0, ia: 0 };
    for (const { it } of results) c[grupoDe(it)] += 1;
    return c;
  }, [results]);

  // O agrupamento vale para a lista INTEIRA. Filtrada, a lista já é de um grupo
  // só, e um cabeçalho repetindo o nome do filtro seria ruído.
  const agrupar = filter === "all" && !query.trim();

  return (
    <Card asChild className="flex w-[296px] shrink-0 flex-col overflow-hidden">
      <aside>
      <div className="relative border-b border-line p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <h2 className="text-titulo">Conversas</h2>
          {/* Só o número: "abertas" não informa nada que o título já não diga. */}
          <Badge variant="contagem">{items.length}</Badge>
        </div>

        {/* CHIPS de filtro (desenho de 18/09/2026), no lugar do menu suspenso.
            O menu escondia o recorte atrás de um clique e, pior, escondia a
            CONTAGEM: dava para ter três conversas esperando por você sem nada na
            tela dizendo isso. Chip mostra rótulo e número ao mesmo tempo, que é o
            que faz a pessoa decidir sem abrir nada.

            ⚠️ São QUATRO e não os três do desenho: "Sem resposta" existe no
            produto e some se eu copiar o desenho ao pé da letra. Apagar um
            recorte porque ele não coube numa prancha é decisão de produto, e não
            de aplicação de desenho; eles envolvem com `flex-wrap`. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "needs", "unanswered", "mine"] as FiltroKey[])
            .filter((k) => k !== "mine" || myUserId)
            // Chip com zero não entra, EXCETO "Todas": um filtro que não recorta
            // nada só ocupa a faixa e ainda sugere que há algo ali.
            .filter((k) => k === "all" || contagem[k] > 0)
            .map((k) => {
              const ativo = filter === k;
              const urgente = k === "needs";
              return (
                <Button
                  key={k}
                  variant="outline"
                  size="chrome"
                  data-slot="inbox-chip"
                  aria-pressed={ativo}
                  onClick={() => setFilter(k)}
                  className={cn(
                    "gap-1.5",
                    urgente && "text-warn-ink",
                    ativo
                      ? urgente
                        ? "border-warn-line bg-warn-surface font-semibold"
                        : "border-line-strong bg-[var(--active-bg)] font-semibold text-ink"
                      : urgente
                        ? "hover:bg-warn-surface"
                        : "text-ink-2"
                  )}
                >
                  {CHIP_ROTULO[k]}
                  <span className="tabular-nums opacity-80">{contagem[k]}</span>
                </Button>
              );
            })}
        </div>

        {/* Busca depois dos filtros: recortar por estado é o gesto de todo dia,
            buscar é a exceção. */}
        <div className="mt-1.5 flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-3 transition-colors focus-within:border-brand-line">
          <Search size={15} className="shrink-0 text-ink-faint" />
          <Input
            variant="limpo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar nome ou mensagem"
            aria-label="Buscar conversas e mensagens"
            className="text-apoio"
          />
        </div>
      </div>

      <ScrollArea fade className="min-h-0 flex-1">
        {results.length === 0 && (
          <div className="p-4 text-apoio text-ink-3">
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
          {results.map(({ it, snippet }, indice) => {
            const { phone, name, lastPreview, lastFrom, lastMessageAt } = it;
            // Cabeçalho de seção: só no PRIMEIRO item de cada grupo.
            const grupo = grupoDe(it);
            const abreGrupo =
              agrupar && (indice === 0 || grupoDe(results[indice - 1].it) !== grupo);
            const href = `/inbox/${encodeURIComponent(phone)}`;
            const active = activePhone ? activePhone === phone : pathname === href;
            const paused = isPaused(iaByPhone[phone]);
            // Handoff em aberto: o que a IA pediu (resumo da ÚLTIMA
            // qualificação, então reflete o último pedido da pessoa) e há quanto
            // tempo isso está esperando. O tempo sai do PRIMEIRO handoff em
            // aberto, que é a espera de verdade.
            const needs = needsYou(it);
            const reason = needs && qualByPhone[phone] ? qualByPhone[phone] : null;
            const espera = needs && it.handoffAt ? formatEspera(it.handoffAt) : null;
            const att = it.assignedUserId ? membersById[it.assignedUserId] : null;
            // Quem atende: outra pergunta, outra resposta. Regra em lib/crm para
            // a lista e o board do pipeline não discordarem sobre o mesmo contato.
            const quem = quemAtende({ pausada: paused, temAtendente: !!att });
            // Ao abrir a conversa você a está lendo, então não mostra badge.
            const unread = active ? 0 : it.unread;
            const label = name || prettyPhone(phone);
            const ini = initials(name);
            const cleanPreview = lastPreview.replace(/ \| /g, "  ");
            const preview =
              lastFrom === "out" ? `Você: ${cleanPreview}` : cleanPreview;
            return (
              <Fragment key={phone}>
                {abreGrupo && (
                  <li
                    data-slot="inbox-grupo"
                    className="flex items-center gap-2 px-3 pb-1 pt-3 text-rotulo text-ink-3"
                  >
                    {/* O ponto herda a cor do grupo: âmbar só em "esperando
                        você", porque âmbar aqui significa pendência e não
                        categoria. Os outros dois são neutros de propósito. */}
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        grupo === "espera" ? "bg-warn-ink" : "bg-ink-faint"
                      )}
                    />
                    <span className="min-w-0 truncate">{GRUPO_ROTULO[grupo]}</span>
                    <span className="shrink-0 tabular-nums">{porGrupo[grupo]}</span>
                  </li>
                )}
              <li>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex gap-2.5 border-b border-line border-l-[3px] px-3 py-2.5 transition-colors duration-100 ${
                    active
                      ? "border-l-[var(--sel-bar)] bg-[var(--active-bg)]"
                      : "border-l-transparent hover:bg-[var(--active-bg)]"
                  }`}
                >
                  {/* `self-start` não é enfeite: como item de flex, este container
                      esticava com a altura da linha (42px medidos contra os 36 do
                      avatar), e aí o `bottom-0` da marca caía 6px abaixo do
                      avatar, que era o "pendurado" que se via na tela. */}
                  <div className="relative shrink-0 self-start">
                    <Avatar size="md" style={avatarPair(phone)}>
                      {ini ?? <User size={16} />}
                    </Avatar>
                    {/* QUEM ATENDE, no canto de baixo. Era um ponto âmbar aceso
                        em toda conversa pausada, e âmbar é cor de alerta: por
                        isso lia como "precisa de você" quando queria dizer só
                        "tem gente cuidando".
                        Duas marcas, não três, porque "pessoa" já é dito pelo
                        avatar do responsável no canto de cima, e com nome.
                        `surface`/`line`/`ink`, nunca `fill` como tinta. */}
                    <QuemAtendeBadge
                      quem={quem}
                      envolver={(marca) => (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>{marca}</span>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            {quemAtendeTexto(quem)}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    />
                    {att && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Avatar
                            size="3xs"
                            tabIndex={0}
                            className="absolute -right-1 -top-1 ring-2 ring-surface"
                            style={avatarPair(att.email)}
                          >
                            {memberInitials(att.email).slice(0, 1)}
                          </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Atendente: {memberName(att.email)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`truncate text-corpo ${
                          active || unread > 0 ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {label}
                      </span>
                      <span
                        // Âmbar agora segue o handoff, não a pausa: pausa passou
                        // a significar "alguém assumiu", que não é urgência.
                        // `text-warn-ink` e não `text-warn`: o fill do matiz não
                        // serve como tinta (regra do design system).
                        className={`shrink-0 text-legenda tabular-nums ${
                          needs ? "font-medium text-warn-ink" : "text-ink-3"
                        }`}
                        suppressHydrationWarning
                      >
                        {formatTime(lastMessageAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      {snippet ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-apoio text-ink-2">
                          <Search size={11} className="shrink-0 opacity-70" />
                          <span className="truncate italic">{snippet}</span>
                        </span>
                      ) : espera ? (
                        // Espera primeiro, motivo depois: a decisão de abrir a
                        // conversa é pela espera, o motivo só diz o que é.
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-apoio text-warn-ink">
                          <Bot size={11} className="shrink-0 opacity-80" />
                          <span className="shrink-0 font-medium tabular-nums">
                            {espera}
                          </span>
                          <span className="min-w-0 truncate">
                            {reason ? `· ${reason}` : "· esperando você"}
                          </span>
                        </span>
                      ) : (
                        <span
                          className={`block truncate text-apoio ${
                            unread > 0 ? "text-ink" : "text-ink-2"
                          }`}
                        >
                          {preview}
                        </span>
                      )}
                      {unread > 0 && (
                        <Badge variant="nao-lidas">
                          {unread > 99 ? "99+" : unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
              </Fragment>
            );
          })}
          </ul>
        </ScrollArea>
      </aside>
    </Card>
  );
}
