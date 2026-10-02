"use client";

import AvatarContato from "@/components/AvatarContato";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import AvatarMembro from "@/components/AvatarMembro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DISSOLVER_LISTA,
  useDissolverLateral,
} from "@/components/ui/dissolver-rolagem";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import { formatEspera, formatTime, prettyPhone } from "@/lib/format";
import {
  JANELAS,
  JANELA_PADRAO,
  ORDEM_JANELAS,
  type JanelaKey,
} from "@/lib/inbox";
import {
  PAGINA_INBOX,
  cursorDe,
  encaixar,
  foraDaLista,
  inicioDaJanela,
  type Contagens,
  type ItemLista,
} from "@/lib/inbox-lista";
import {
  fonteDaMemoria,
  fonteDoBanco,
  type FonteInbox,
  type ParamsLista,
} from "@/lib/inbox-fonte";
import { useDebounce } from "@/lib/use-debounce";
import { agoraMs } from "@/lib/periodo";
import { fetchMembers, memberName, type Member } from "@/lib/team";
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
  inicial,
  clientId,
  previewTodos,
  previewMensagens,
  activePhone,
  myUserId,
  numeroAvisos = null,
}: {
  /** A primeira página e as contagens, que o servidor já buscou. */
  inicial: { itens: ItemLista[]; contagens: Contagens; temMais: boolean };
  /** Tenant logado. Sem ele (preview /design) a lista roda sobre `previewTodos`. */
  clientId?: string;
  previewTodos?: ItemLista[];
  previewMensagens?: { phone: string; texto: string }[];
  /** Só para o preview de design (/design): força a conversa "aberta". */
  activePhone?: string;
  /** Sem ele o filtro "Suas" não aparece (não dá para saber o que é seu). */
  myUserId?: string;
  /** Destino dos avisos: esse número nunca é conversa (lib/avisos.ts). */
  numeroAvisos?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  // DE ONDE VÊM AS CONVERSAS (01/10/2026, docs/plano-carregamento.md): o banco,
  // 10 por vez, com recorte, filtro e busca aplicados LÁ (`inbox_pagina`). O
  // preview /design usa a mesma regra sobre uma lista na memória.
  const fonte = useMemo<FonteInbox>(
    () =>
      clientId
        ? fonteDoBanco(supabase, clientId)
        : fonteDaMemoria(previewTodos ?? inicial.itens, previewMensagens),
    [clientId, supabase, previewTodos, previewMensagens, inicial.itens]
  );
  const fora = useMemo(() => foraDaLista(numeroAvisos), [numeroAvisos]);

  const [items, setItems] = useState<ItemLista[]>(inicial.itens);
  const [temMais, setTemMais] = useState(inicial.temMais);
  const [contagens, setContagens] = useState<Contagens>(inicial.contagens);
  const [carregando, setCarregando] = useState(false);
  // A chave da IA mudada AGORA nesta aba (ver `ouvirIa`), por cima do banco.
  const [iaLocal, setIaLocal] = useState<Record<string, string | null>>({});
  const [membersById, setMembersById] = useState<Record<string, Member>>({});
  const [query, setQuery] = useState("");
  // A busca vai ao SERVIDOR, e só depois de a pessoa parar de digitar.
  const busca = useDebounce(query.trim(), 300);
  // "unanswered" = a última mensagem foi do contato, ou seja, a bola está com a
  // gente. É o corte que o operador realmente faz ao abrir a tela.
  const [filter, setFilter] = useState<FiltroKey>("all");
  // Recorte de TEMPO, que é outra pergunta que a de estado: os chips dizem "o
  // que está acontecendo", este diz "de quando". Abre em "Hoje" por decisão do
  // dono em 19/09/2026: a lista dele abria com 48 conversas e ele disse "não faz
  // sentido eu querer ficar vendo todas as conversas".
  const [janela, setJanela] = useState<JanelaKey>(JANELA_PADRAO);
  const pathname = usePathname();
  // No CELULAR a lista e a conversa não dividem a tela (plano do mobile, fase
  // 1): com uma conversa aberta a lista some, e quem volta é a seta do
  // cabeçalho da conversa. Por CSS (`max-md:hidden`) e não desmontando: o
  // desktop continua com a MESMA árvore, e a assinatura de realtime não reabre.
  const conversaAberta = !!activePhone || /^\/inbox\/[^/]+/.test(pathname);
  const {
    ref: chipsRef,
    style: chipsStyle,
    onScroll: chipsOnScroll,
  } = useDissolverLateral<HTMLDivElement>();

  // O recorte de agora. Fica também num ref, para o realtime e a rolagem lerem
  // o valor atual sem reassinar o canal a cada troca de filtro.
  const params = useMemo<ParamsLista>(
    () => ({
      inicio: inicioDaJanela(janela, agoraMs()),
      filtro: filter,
      busca,
      eu: myUserId ?? null,
      fora,
    }),
    [janela, filter, busca, myUserId, fora]
  );
  const paramsRef = useRef(params);
  const estadoRef = useRef({ items, temMais });
  useEffect(() => {
    paramsRef.current = params;
    estadoRef.current = { items, temMais };
  });
  // Resposta de um recorte antigo (a pessoa trocou de filtro no meio) é jogada fora.
  const versaoRef = useRef(0);
  const carregandoRef = useRef(false);

  const recarregarContagens = useCallback(
    async (p: ParamsLista) => {
      try {
        setContagens(await fonte.contagens({ inicio: p.inicio, eu: p.eu, fora: p.fora }));
      } catch (e) {
        console.error("contagens da lista:", e);
      }
    },
    [fonte]
  );

  /**
   * Busca de novo o que já está na tela (as N primeiras linhas), sem jogar a
   * rolagem fora. É o "revalidar": depois de o realtime cair, ao voltar para a
   * aba, ou ao trocar de recorte (aí com N = 1 página).
   */
  const revalidar = useCallback(
    async (p: ParamsLista, quantas?: number) => {
      const v = ++versaoRef.current;
      const n = Math.min(50, Math.max(PAGINA_INBOX, quantas ?? estadoRef.current.items.length));
      setCarregando(true);
      try {
        const [pagina] = await Promise.all([fonte.pagina(p, null, n), recarregarContagens(p)]);
        if (v !== versaoRef.current) return;
        setItems(pagina);
        setTemMais(pagina.length === n);
      } catch (e) {
        console.error("lista de conversas:", e);
      } finally {
        if (v === versaoRef.current) setCarregando(false);
      }
    },
    [fonte, recarregarContagens]
  );

  const carregarMais = useCallback(async () => {
    const { items: atuais, temMais: mais } = estadoRef.current;
    if (!mais || carregandoRef.current || atuais.length === 0) return;
    const v = versaoRef.current;
    carregandoRef.current = true;
    setCarregando(true);
    try {
      const pagina = await fonte.pagina(paramsRef.current, cursorDe(atuais[atuais.length - 1]));
      if (v !== versaoRef.current) return;
      setItems((cur) => {
        const vistos = new Set(cur.map((i) => i.phone));
        return [...cur, ...pagina.filter((i) => !vistos.has(i.phone))];
      });
      setTemMais(pagina.length === PAGINA_INBOX);
    } catch (e) {
      console.error("mais conversas:", e);
    } finally {
      carregandoRef.current = false;
      if (v === versaoRef.current) setCarregando(false);
    }
  }, [fonte]);

  // Trocou recorte, filtro ou busca: primeira página do recorte novo. A
  // PRIMEIRA renderização é pulada: ela já veio do servidor, com o recorte
  // padrão, e buscar de novo seria jogar a consulta fora.
  const primeiraRef = useRef(true);
  useEffect(() => {
    if (primeiraRef.current) {
      primeiraRef.current = false;
      return;
    }
    void revalidar(params, PAGINA_INBOX);
  }, [params, revalidar]);

  // ROLAGEM INFINITA: um marcador no fim da lista; quando ele aparece, vem a
  // próxima página. O observador é refeito a cada página nova, e é isso que
  // continua carregando enquanto a lista não enche a altura da coluna.
  const fimRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const alvo = fimRef.current;
    if (!alvo || !temMais) return;
    const obs = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) void carregarMais();
      },
      { rootMargin: "200px 0px" }
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [items.length, temMais, carregarMais]);

  // REALTIME, LINHA A LINHA (01/10/2026). Antes cada mensagem que chegava fazia
  // a lista buscar TUDO de novo (500 conversas, todos os contatos, 300 resumos),
  // em toda aba aberta, inclusive escondida. Agora:
  // 1. o canal só escuta o tenant (`client_id=eq.`), não o banco inteiro;
  // 2. o evento só anota QUAL conversa mudou, e um debounce junta a rajada de
  //    um lote (4 mensagens e a resposta viram uma busca por conversa);
  // 3. a busca é da LINHA, com o recorte de agora, e ela é encaixada no lugar
  //    (`encaixar`) sem tocar no resto;
  // 4. aba escondida não busca nada: o canal (`useCanalTenant`) anota que ficou
  //    para trás e revalida quando a pessoa voltar.
  const pendentesRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processarPendentes = useCallback(async () => {
    const fones = [...pendentesRef.current];
    pendentesRef.current.clear();
    if (fones.length === 0) return;
    const v = versaoRef.current;
    const p = paramsRef.current;
    try {
      const linhas = await Promise.all(
        fones.map((f) => fonte.linha(p, f).then((l) => [f, l] as const))
      );
      if (v !== versaoRef.current) return;
      setItems((cur) =>
        linhas.reduce((acc, [f, l]) => encaixar(acc, f, l, estadoRef.current.temMais), cur)
      );
      void recarregarContagens(p);
    } catch (e) {
      console.error("linha da lista:", e);
    }
  }, [fonte, recarregarContagens]);

  const anotar = useCallback(
    (phone: string | null | undefined) => {
      if (!phone) return;
      pendentesRef.current.add(phone);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void processarPendentes(), 500);
    },
    [processarPendentes]
  );

  // ⚠️ O REALTIME CAI, E A LISTA PRECISA SABER DISSO (31/08/2026). A regra
  // inteira (pular a primeira `SUBSCRIBED`, revalidar nas seguintes e ao voltar
  // para a aba, no máximo a cada 10s) mora em `useCanalTenant`, que é por onde
  // toda assinatura passa desde 02/10/2026. Daqui sai só o que é da lista: qual
  // linha buscar e como revalidar o recorte inteiro.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );
  useCanalTenant({
    clientId,
    tabelas: ["conversations", "dados_cliente", "conversation_qualifications"],
    aoEvento: (ev) => anotar(foneDoEvento(ev)),
    revalidar: () => void revalidar(paramsRef.current),
  });

  // A chave da IA virou AGORA, no cabeçalho da conversa. O realtime também vai
  // chegar, mas depois de ir ao Postgres e voltar; aqui a correção é imediata.
  useEffect(() => ouvirIa(({ phone, estado }) => {
    setIaLocal((m) => (m[phone] === estado ? m : { ...m, [phone]: estado }));
  }), []);

  // Membros do time (para nomear o atendente de cada conversa). Mudam raramente;
  // uma busca no mount basta (a navegação entre páginas revalida).
  useEffect(() => {
    if (!clientId) return;
    void (async () => {
      const list = await fetchMembers(supabase);
      setMembersById(Object.fromEntries(list.map((m) => [m.userId, m])));
    })();
  }, [supabase, clientId]);

  const contagem: Record<FiltroKey, number> = {
    all: contagens.todas,
    unanswered: contagens.sem_resposta,
    mine: contagens.suas,
    needs: contagens.esperando,
  };

  // Ordenada e recortada pelo BANCO; aqui só o trecho da busca.
  const results = useMemo(
    () =>
      items.map((it) => ({
        it,
        snippet: it.trecho && busca ? makeSnippet(it.trecho, busca) : null,
      })),
    [items, busca]
  );

  // Quantas conversas em cada grupo, para o cabeçalho de seção: do BANCO, não
  // do que já carregou (com 10 na tela, o grupo pode ter 40).
  const porGrupo: Record<Grupo, number> = {
    espera: contagens.esperando,
    time: contagens.grupo_time,
    ia: contagens.grupo_ia,
  };

  // O agrupamento vale para a lista INTEIRA. Filtrada, a lista já é de um grupo
  // só, e um cabeçalho repetindo o nome do filtro seria ruído.
  const agrupar = filter === "all" && !busca;
  // Chip com zero não entra, EXCETO "Todas": um filtro que não recorta nada só
  // ocupa a faixa e ainda sugere que há algo ali.
  const chipsVisiveis = (["all", "needs", "unanswered", "mine"] as FiltroKey[])
    .filter((k) => k !== "mine" || myUserId)
    .filter((k) => k === "all" || k === filter || contagem[k] > 0);

  return (
    <Card
      asChild
      variant="pagina"
      className={cn(
        "flex w-[296px] shrink-0 flex-col overflow-hidden",
        // Celular: a lista é a tela inteira, sem moldura de cartão.
        "max-md:w-full max-md:flex-1",
        conversaAberta && "max-md:hidden",
      )}
    >
      <aside>
      {/* Respiro de 16px nas laterais e no topo, como a prancha: era 12px, e a
          lista ficava colada na borda do cartão. */}
      <div className="relative border-b border-line px-4 pb-2.5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-titulo">Conversas</h2>
          {/* SELETOR DE PERÍODO, na linha do título (19/09/2026).
              ⚠️ Ele tinha que caber SEM criar uma segunda fileira de controles:
              a busca já subiu uma vez por causa disso (os chips reenvolvem e
              faziam o cabeçalho pular de altura). A linha do título era a única
              com folga, e o que estava nela, o total de conversas, saiu: com
              recorte de tempo um total solto é ambíguo ("5 de quando?"), e o
              chip "Todas" logo abaixo já mostra o número da janela. */}
          {/* ⚠️ É o MESMO componente das abas do Painel (`Tabs variant="painel"`),
              decisão do dono em 30/09/2026 ("temos que seguir um padrão"). Era
              um seletor feito à mão, com outra cor, e foi copiado para os avisos
              do Agente antes de alguém perceber. Compacto (12px) como o do
              movimento no Painel, porque divide a linha com o título. */}
          <Tabs value={janela} onValueChange={(v) => setJanela(v as JanelaKey)}>
            <TabsList
              variant="painel"
              data-slot="inbox-periodo"
              aria-label="Período das conversas"
              className="shrink-0 bg-canvas"
            >
              {ORDEM_JANELAS.map((k) => (
                <TabsTrigger
                  key={k}
                  value={k}
                  variant="painel"
                  data-slot="inbox-periodo-opcao"
                  data-ativo={janela === k ? "sim" : undefined}
                  className="whitespace-nowrap px-2 py-1 text-legenda"
                >
                  {JANELAS[k].rotulo}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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
        {/* No celular os chips NÃO reenvolvem: rolam para o lado, dissolvendo
            na borda (desenho do mobile), para a lista começar mais alto. */}
        {/* ⚠️ Com um chip só ("Todas"), a faixa inteira some (achado do dono,
            30/09/2026): um filtro que não recorta nada não tem o que escolher. */}
        {chipsVisiveis.length > 1 && (
        <div
          ref={chipsRef}
          style={chipsStyle}
          onScroll={chipsOnScroll}
          className="mt-[11px] flex flex-wrap items-center gap-1.5 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:[scrollbar-width:none]"
        >
          {chipsVisiveis.map((k) => {
              const ativo = filter === k;
              const urgente = k === "needs";
              return (
                <Button
                  key={k}
                  // ⚠️ O ATIVO SE DISTINGUE POR COR, NÃO POR PESO (variante
                  // `chip` do Button, pelo `aria-pressed`): cada um inverte
                  // dentro do PRÓPRIO matiz. O urgente vira âmbar cheio, o
                  // resto vira tinta cheia.
                  variant={urgente ? "chip-alerta" : "chip"}
                  size="chip"
                  data-slot="inbox-chip"
                  data-ativo={ativo ? "sim" : undefined}
                  aria-pressed={ativo}
                  onClick={() => setFilter(k)}
                >
                  {CHIP_ROTULO[k]}
                  <span className="font-bold tabular-nums opacity-75">
                    {contagem[k]}
                  </span>
                </Button>
              );
            })}
        </div>
        )}
      </div>

      <ScrollArea
        fade={DISSOLVER_LISTA}
        seta
        setaRotulo="Ver as conversas de baixo"
        className="min-h-0 flex-1"
      >
        {results.length === 0 && !carregando && (
          <EstadoVazio
            tamanho="compacto"
            className="items-start text-left"
            texto={
              busca
                ? "Nada encontrado."
                : filter === "needs"
                  ? "Nenhuma conversa precisa de você."
                  : filter === "unanswered"
                    ? "Nenhuma conversa esperando resposta."
                    : filter === "mine"
                      ? "Nenhuma conversa atribuída a você."
                      : // ⚠️ Com recorte de tempo ligado, "Nenhuma conversa ainda"
                        // seria mentira: numa conta com 48 conversas, o vazio é do
                        // RECORTE, não da conta. E a frase diz onde está o resto,
                        // senão a pessoa conclui que perdeu o histórico.
                        janela !== "tudo" && contagens.existe_alguma
                        ? `Nada em ${JANELAS[janela].rotulo.toLowerCase()}. Veja em Tudo.`
                        : "Nenhuma conversa ainda."
            }
          />
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
            const paused = isPaused(phone in iaLocal ? iaLocal[phone] : it.ia);
            // Handoff em aberto: o que a IA pediu (resumo da ÚLTIMA
            // qualificação, então reflete o último pedido da pessoa) e há quanto
            // tempo isso está esperando. O tempo sai do PRIMEIRO handoff em
            // aberto, que é a espera de verdade.
            const needs = needsYou(it);
            const reason = needs ? it.resumo : null;
            const espera = needs && it.handoffAt ? formatEspera(it.handoffAt) : null;
            const att = it.assignedUserId ? membersById[it.assignedUserId] : null;
            // Quem atende: outra pergunta, outra resposta. Regra em lib/crm para
            // a lista e o board do pipeline não discordarem sobre o mesmo contato.
            const quem = quemAtende({ pausada: paused, temAtendente: !!att });
            // Ao abrir a conversa você a está lendo, então não mostra badge.
            const unread = active ? 0 : it.unread;
            const label = name || prettyPhone(phone);
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
                    <AvatarContato size="md" phone={phone} name={name} fotoPath={it.fotoPath} />
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
                          <AvatarMembro
                            size="3xs"
                            email={att.email}
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
                          />
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
          {/* O fim da lista: quando aparece, vem a próxima página. */}
          {temMais && (
            <li ref={fimRef} data-slot="inbox-mais" aria-hidden className="h-px" />
          )}
          {carregando && (
            <li data-slot="inbox-carregando" className="px-4 py-3 text-legenda text-ink-3">
              Carregando…
            </li>
          )}
          </ul>
        </ScrollArea>
      </aside>
    </Card>
  );
}
