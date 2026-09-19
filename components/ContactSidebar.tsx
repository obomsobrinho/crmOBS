"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, User } from "lucide-react";
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
  ia: "IA atendendo",
};

/**
 * A TINTA de cada cabeçalho de grupo (desenho de 18/09/2026).
 *
 * Os três cabeçalhos eram cinza, com um ponto âmbar só no primeiro, e o efeito
 * era que a lista parecia ter uma seção urgente e duas "outras". Aqui cada
 * grupo usa a cor que o produto já deu ao estado: âmbar é pendência, verde é
 * humano atendendo, roxo é a IA. Nada de matiz novo, e nenhum deles é
 * decorativo.
 *
 * ⚠️ `ink` e nunca `fill`: são cor de TEXTO sobre a superfície do cartão. O
 * `fill` do âmbar como tinta é exatamente o caso que reprovou WCAG AA no
 * escuro (3,2:1 contra 9,0:1).
 */
const GRUPO_TINTA: Record<Grupo, { texto: string; ponto: string }> = {
  espera: { texto: "text-warn-ink", ponto: "bg-warn-ink" },
  time: { texto: "text-human-ink", ponto: "bg-human-ink" },
  ia: { texto: "text-brand-ink", ponto: "bg-brand-ink" },
};

const GRUPO_ORDEM: Grupo[] = ["espera", "time", "ia"];

/**
 * O chip de estado que fica DEBAIXO da prévia, na terceira linha do item
 * (desenho de 18/09/2026). Ele responde "o que está acontecendo com esta
 * conversa" em uma linha: "6h esperando · IA pausada", "Você assumiu",
 * "Marina assumiu".
 *
 * ⚠️ Ele não ROUBA a prévia, e essa é a diferença que mais importa. Antes o
 * tempo de espera era escrito NO LUGAR da última mensagem, então a conversa que
 * mais precisava de atenção era justamente a única em que não dava para ver o
 * que a pessoa tinha escrito.
 */
type EstadoChip = {
  /** Par `surface`/`line`/`ink` do matiz. */
  tom: string;
  ponto: string;
  texto: React.ReactNode;
  /** Vai para o `title`: o que a IA entendeu do último pedido. */
  titulo?: string;
};

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
      {/* Respiro de 16px nas laterais e no topo, como a prancha: era 12px, e a
          lista ficava colada na borda do cartão. */}
      <div className="relative border-b border-line px-4 pb-2.5 pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-titulo">Conversas</h2>
          {/* A contagem perdeu a pílula e foi para a DIREITA (prancha de
              18/09/2026). Pílula é chip, e chip aqui embaixo significa "clique
              em mim para filtrar": ter uma logo acima da faixa de filtros, que
              não filtra nada, era o começo da confusão que o dono chamou de
              "filtros errados". Número solo alinhado à direita é rótulo, e lê
              como rótulo. */}
          <span className="shrink-0 text-legenda font-semibold tabular-nums text-ink-3">
            {items.length}
          </span>
        </div>

        {/* ⚠️ A BUSCA VEM ANTES DOS CHIPS, e a ordem inverteu em 18/09/2026.
            O argumento antigo ("recortar é o gesto de todo dia, buscar é a
            exceção") justificava a ordem pela FREQUÊNCIA, e a prancha decide por
            outro critério: o campo de busca tem largura fixa e altura fixa, os
            chips não (são quatro, com contagem, e reenvolvem). Com os chips em
            cima, a busca mudava de altura conforme a fila enchia, e o cabeçalho
            inteiro pulava. Embaixo, quem reflui é a última coisa da faixa. */}
        <div className="mt-[11px] flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-2.5 transition-colors focus-within:border-brand-line">
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

        {/* CHIPS de filtro (desenho de 18/09/2026), no lugar do menu suspenso.
            O menu escondia o recorte atrás de um clique e, pior, escondia a
            CONTAGEM: dava para ter três conversas esperando por você sem nada na
            tela dizendo isso. Chip mostra rótulo e número ao mesmo tempo, que é o
            que faz a pessoa decidir sem abrir nada.

            ⚠️ São QUATRO e não os três do desenho: "Sem resposta" existe no
            produto e some se eu copiar o desenho ao pé da letra. Apagar um
            recorte porque ele não coube numa prancha é decisão de produto, e não
            de aplicação de desenho; eles envolvem com `flex-wrap`. */}
        <div className="mt-[11px] flex flex-wrap items-center gap-1.5">
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
                  data-ativo={ativo ? "sim" : undefined}
                  aria-pressed={ativo}
                  onClick={() => setFilter(k)}
                  className={cn(
                    // 8px de raio e 10px de respiro lateral, medidos na prancha.
                    "gap-1.5 rounded-md px-2.5",
                    ativo
                      ? // ⚠️ O ATIVO SE DISTINGUE POR COR, NÃO POR PESO. Antes
                        // era `font-semibold` mais uma borda um degrau mais
                        // forte, e a diferença sumia a um metro da tela. Cada
                        // um inverte dentro do PRÓPRIO matiz: o urgente vira
                        // âmbar cheio (par `fill`/`on`), o resto vira tinta
                        // cheia (par `--chip-ativo-bg`/`--chip-ativo-fg`).
                        // Manter o âmbar aqui é o que impede o recorte
                        // "Esperando" de perder a cor justo quando está ligado.
                        urgente
                        ? "border-[var(--warn-fill)] bg-[var(--warn-fill)] text-[var(--warn-on)] hover:bg-[var(--warn-fill)]"
                        : "border-[var(--chip-ativo-bg)] bg-[var(--chip-ativo-bg)] text-[var(--chip-ativo-fg)] hover:bg-[var(--chip-ativo-bg)]"
                      : urgente
                        ? "border-warn-line bg-warn-surface text-warn-ink hover:bg-warn-surface"
                        : // `hover:bg-` repetido de propósito: a variante
                          // `outline` traz `hover:bg-[var(--active-bg)]`, que
                          // CLAREIA o chip neutro em vez de escurecer. Quem
                          // muda no hover é só a tinta.
                          "border-line bg-[var(--chip-bg)] text-ink-2 hover:bg-[var(--chip-bg)] hover:text-ink"
                  )}
                >
                  {CHIP_ROTULO[k]}
                  <span className="font-bold tabular-nums opacity-75">
                    {contagem[k]}
                  </span>
                </Button>
              );
            })}
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

            // O chip de estado da linha. A ordem é a da urgência, e só UM
            // aparece: a linha tem espaço para uma frase, não para um mural.
            //
            // ⚠️ O desenho tem um quarto chip, vermelho, com "1 mensagem não
            // enviou". Ele NÃO está aqui porque o dado não existe: nada em
            // `conversations` nem em `chat_messages` registra falha de entrega
            // (o envio manual sai por webhook do n8n e a lista nunca fica
            // sabendo). Escrever a frase com um número plausível seria inventar
            // um erro que o cliente vai conferir no WhatsApp dele.
            const pausadaSufixo = paused ? " · IA pausada" : "";
            let estado: EstadoChip | null = null;
            if (needs && espera) {
              estado = {
                tom: "border-warn-line bg-warn-surface text-warn-ink",
                ponto: "bg-warn-ink",
                texto: (
                  <>
                    {/* Span próprio para a espera: ela é o número que decide se
                        você abre a conversa agora, e tabular-nums impede que
                        "6h" e "12 min" dancem de largura na rolagem. */}
                    <span className="tabular-nums">{espera}</span>
                    {` esperando${pausadaSufixo}`}
                  </>
                ),
                // O resumo da IA (o que a pessoa pediu) saiu da linha e virou
                // `title`. Ele é uma frase inteira, e o desenho reservou este
                // espaço para o ESTADO; deixar o resumo ali empurrava o "IA
                // pausada" para fora em toda conversa.
                titulo: reason ?? undefined,
              };
            } else if (it.assignedUserId) {
              const meu = !!myUserId && it.assignedUserId === myUserId;
              const nome = att ? memberName(att.email) : null;
              estado = meu
                ? {
                    tom: "border-human-line bg-human-surface text-human-ink",
                    ponto: "bg-human-ink",
                    texto: `Você assumiu${pausadaSufixo}`,
                  }
                : {
                    tom: "border-line bg-[var(--chip-bg)] text-ink-2",
                    ponto: "bg-ink-2",
                    // Sem nome resolvido (a lista de membros ainda não chegou, ou
                    // o responsável saiu do time) o chip diz só o que o banco
                    // garante: existe um responsável. Inventar "Alguém assumiu"
                    // com cara de nome seria pior que a frase genérica.
                    texto: nome
                      ? `${nome} assumiu${pausadaSufixo}`
                      : `Assumida pelo time${pausadaSufixo}`,
                  };
            }
            return (
              <Fragment key={phone}>
                {abreGrupo && (
                  <li
                    data-slot="inbox-grupo"
                    className={cn(
                      "flex items-center gap-[7px] px-4 pb-1.5 pt-3",
                      GRUPO_TINTA[grupo].texto
                    )}
                  >
                    {/* ⚠️ CADA GRUPO TEM A SUA COR (ver GRUPO_TINTA). Antes os
                        três cabeçalhos eram `text-ink-3` com ponto cinza, menos
                        o primeiro, e a lista lia como "uma seção que importa e
                        duas sobras". Os três estados importam; o que muda entre
                        eles é de quem é a vez. */}
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        GRUPO_TINTA[grupo].ponto
                      )}
                    />
                    <span className="min-w-0 truncate text-rotulo font-bold uppercase">
                      {GRUPO_ROTULO[grupo]}
                    </span>
                    <span className="shrink-0 text-legenda font-bold tabular-nums text-ink-3">
                      {porGrupo[grupo]}
                    </span>
                    {/* O filete até a borda fecha o cabeçalho como seção, e é o
                        que faz o grupo parecer um grupo sem precisar de faixa
                        cheia atrás do texto. */}
                    <span aria-hidden className="h-px min-w-3 flex-1 bg-line-soft" />
                  </li>
                )}
              <li>
                <Link
                  href={href}
                  data-slot="inbox-item"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // 16px à esquerda e 14px à direita, medidos na prancha: o
                    // respiro maior é do lado do avatar, e a hora encosta mais
                    // perto da borda.
                    "relative flex gap-2.5 border-b border-line-soft pb-2.5 pl-4 pr-3.5 pt-[9px] transition-colors duration-100",
                    active
                      ? // ⚠️ SELEÇÃO E HOVER DEIXARAM DE SER A MESMA COR. As duas
                        // usavam `--active-bg`, então passar o ponteiro por
                        // outra linha a deixava idêntica à selecionada e a tela
                        // perdia o "você está aqui". `--sel-bg` é a marca
                        // diluída (ver globals.css), e é o "tom" que faltava.
                        "bg-[var(--sel-bg)]"
                      : "hover:bg-[var(--active-bg)]"
                  )}
                >
                  {/* A barra virou um span ABSOLUTO, e não mais `border-l`.
                      Como borda, ela parava antes do `border-b` da linha e
                      ficava com um degrau no pé; e, pior, a cor da borda era
                      uma só, então não dava para ter uma barra âmbar numa linha
                      não selecionada. É exatamente o que a prancha pede: âmbar
                      marca quem espera por você mesmo com a conversa fechada, e
                      a seleção (roxo) vence quando as duas coincidem, porque a
                      barra roxa responde "onde eu estou". */}
                  <span
                    aria-hidden
                    data-slot="inbox-barra"
                    className={cn(
                      "absolute inset-y-0 left-0 w-[3px]",
                      active
                        ? "bg-[var(--sel-bar)]"
                        : needs
                          ? "bg-[var(--warn-fill)]"
                          : "bg-transparent"
                    )}
                  />
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
                            // ⚠️ Era `ring-surface`, e `--color-surface` foi
                            // apagado na faxina de 30/08/2026: a classe não é
                            // gerada pelo Tailwind e o anel saía na cor
                            // herdada, que é o que fazia o selo parecer sujo
                            // por cima do avatar. O anel tem que ser a cor do
                            // FUNDO da linha, e a linha selecionada tem fundo
                            // próprio.
                            className={cn(
                              "absolute -right-1 -top-1 ring-2",
                              active ? "ring-[var(--sel-bg)]" : "ring-raised"
                            )}
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
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          // 600 e 700, e não 500 e 600: na prancha o nome é a
                          // âncora da linha, e com 500 ele pesava menos que a
                          // prévia logo abaixo em telas sem hinting.
                          "min-w-0 flex-1 truncate text-corpo",
                          active || unread > 0 ? "font-bold" : "font-semibold"
                        )}
                      >
                        {label}
                      </span>
                      <span
                        // Âmbar agora segue o handoff, não a pausa: pausa passou
                        // a significar "alguém assumiu", que não é urgência.
                        // `text-warn-ink` e não `text-warn`: o fill do matiz não
                        // serve como tinta (regra do design system).
                        // Na linha aberta a hora sobe para `ink-2`: sobre a
                        // superfície de seleção o `ink-3` quase some.
                        className={cn(
                          "shrink-0 text-legenda tabular-nums",
                          needs
                            ? "font-medium text-warn-ink"
                            : active
                              ? "text-ink-2"
                              : "text-ink-3"
                        )}
                        suppressHydrationWarning
                      >
                        {formatTime(lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {snippet ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-apoio text-ink-2">
                          <Search size={11} className="shrink-0 opacity-70" />
                          <span className="truncate italic">{snippet}</span>
                        </span>
                      ) : (
                        // ⚠️ A PRÉVIA APARECE SEMPRE, inclusive na conversa que
                        // espera por você: era ela que o bloco de espera
                        // cobria. E a tinta é `ink-3` mesmo com não lidas (a
                        // prancha não escurece a prévia): quem grita "tem coisa
                        // nova" é o nome em 700 mais a pílula ao lado, e três
                        // sinais para o mesmo fato é o que fazia a linha inteira
                        // parecer em negrito.
                        <span className="min-w-0 flex-1 truncate text-apoio text-ink-3">
                          {lastFrom === "out" && (
                            // Quem respondeu por último ganha prefixo em
                            // destaque, como na prancha.
                            // ⚠️ A prancha tem TRÊS prefixos ("Você:", "IA:" e o
                            // nome do colega) e aqui só existe um: a lista lê
                            // `conversations.last_message_from`, que só sabe
                            // dizer "entrou" ou "saiu". Quem mandou (IA, você ou
                            // o colega) está em `chat_messages.message_type`,
                            // que esta consulta não traz. Deduzir pelo estado da
                            // IA erraria justamente na conversa reativada depois
                            // de um humano responder.
                            <span className="font-bold text-human-ink">
                              Você:{" "}
                            </span>
                          )}
                          {cleanPreview}
                        </span>
                      )}
                      {unread > 0 && (
                        <Badge variant="nao-lidas">
                          {unread > 99 ? "99+" : unread}
                        </Badge>
                      )}
                    </div>
                    {estado && (
                      <span
                        data-slot="inbox-estado"
                        title={estado.titulo}
                        className={cn(
                          "mt-[3px] inline-flex h-[21px] max-w-full shrink-0 items-center gap-[5px] self-start overflow-hidden whitespace-nowrap rounded-md border px-2 text-legenda font-bold",
                          estado.tom
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            estado.ponto
                          )}
                        />
                        <span className="min-w-0 truncate">{estado.texto}</span>
                      </span>
                    )}
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
