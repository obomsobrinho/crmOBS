"use client";

import { useEffect, useId, useRef } from "react";
import { assinarComSessao } from "@/lib/supabase/client";

/**
 * O ÚNICO LUGAR QUE ABRE CANAL DE REALTIME (02/10/2026, auditoria F1, R-02,
 * R-03, R-21 e R-22). Componente nenhum chama `.channel(` nem `.subscribe(`:
 * assina por aqui, e herda de graça as quatro regras que antes cada dono tinha
 * de lembrar sozinho (e cinco esqueciam):
 *
 * 1. SESSÃO ANTES DO CANAL (`assinarComSessao`);
 * 2. CALLBACK DE STATUS: a PRIMEIRA `SUBSCRIBED` é pulada (os dados acabaram de
 *    vir do servidor; existe e2e que falha se abrir a tela refizer a busca) e
 *    cada `SUBSCRIBED` seguinte chama `revalidar`, porque entre a queda e a
 *    volta ninguém recebeu evento;
 * 3. VOLTAR PARA A ABA revalida (`visibilitychange` + `focus`, no máximo uma
 *    vez a cada 10s, menos quando a aba ficou para trás de verdade): cobre o
 *    socket que o sistema operacional matou com a máquina dormindo;
 * 4. ABA ESCONDIDA NÃO BUSCA: no modo `buscar` o evento só anota que a aba
 *    ficou atrasada, e a revalidação sai uma vez quando ela volta. No modo
 *    `aplicar` o evento é entregue mesmo escondida, porque quem usa esse modo
 *    só encaixa o payload no estado (zero consulta).
 *
 * E UM CANAL POR TENANT POR ABA. Os componentes de uma tela (lista, contadores
 * do menu, faixa "O cliente quer", chave da IA, responsável, pedidos, notas)
 * assinam o MESMO canal `tenant-{clientId}`, que escuta as tabelas do tenant
 * filtradas por `client_id`. Cada assinante recebe só as tabelas que pediu e
 * filtra a conversa dele no próprio `aoEvento` (pelo `phone` do payload). Eram
 * uns 10 canais por aba na conversa, cada um com 1 a 4 escutas que o servidor
 * de realtime autoriza a cada mudança. Mensagens (`chat_messages`) ficam em
 * canal próprio por telefone (`useCanalConversa`): é a tabela de maior volume e
 * o filtro no servidor poupa a aba de receber a conversa dos outros.
 *
 * Contrato do payload: um evento atualiza UMA linha. Quem recebe encaixa o que
 * veio no `novo`/`antigo` (as tabelas estão em REPLICA IDENTITY FULL, menos
 * `conversation_qualifications`, que é append-only e só emite INSERT aqui) ou
 * busca SÓ aquela linha. Refazer a lista inteira por um evento não é permitido.
 */

/** Janela mínima entre duas revalidações por voltar o foco. */
export const JANELA_FOCO_MS = 10_000;
/** Quanto o canal do tenant sobrevive sem ninguém, para a navegação reaproveitar. */
const GRACA_CANAL_MS = 3_000;

/**
 * As tabelas do canal do tenant. Todas têm `client_id` e estão na publicação
 * `supabase_realtime` (conferido em `pg_publication_tables`): uma tabela fora
 * dela faz o Supabase recusar o canal INTEIRO, então não acrescentar aqui sem
 * conferir. `conversation_qualifications` é append-only (réplica na PK), por
 * isso só INSERT.
 */
const ESCUTAS_DO_TENANT = [
  { tabela: "conversations", evento: "*" },
  { tabela: "dados_cliente", evento: "*" },
  { tabela: "handoffs", evento: "*" },
  { tabela: "conversation_qualifications", evento: "INSERT" },
  { tabela: "conversation_notes", evento: "*" },
  { tabela: "pipeline_stages", evento: "*" },
] as const;

export type TabelaTenant = (typeof ESCUTAS_DO_TENANT)[number]["tabela"];
export type Linha = Record<string, unknown>;

export type EventoBanco = {
  tabela: string;
  tipo: "INSERT" | "UPDATE" | "DELETE";
  novo: Linha | null;
  antigo: Linha | null;
};

/** O telefone da linha que mudou (`phone` ou, em `dados_cliente`, `telefone`). */
export function foneDoEvento(ev: EventoBanco): string | null {
  const l = ev.novo ?? ev.antigo;
  const f = (l?.phone ?? l?.telefone) as string | undefined;
  return f ?? null;
}

type Modo = "buscar" | "aplicar";

type Assinante = {
  modo: Modo;
  /** Tabelas que ele quer; `null` = tudo o que o canal entregar. */
  tabelas: ReadonlySet<string> | null;
  aoEvento: (ev: EventoBanco) => void;
  revalidar: () => void;
  atrasada: boolean;
  ultima: number;
};

const todos = new Set<Assinante>();

const visivel = () => document.visibilityState === "visible";

function revalidarAgora(a: Assinante) {
  a.ultima = Date.now();
  a.atrasada = false;
  a.revalidar();
}

function aoVoltarOFoco() {
  if (!visivel()) return;
  const agora = Date.now();
  for (const a of todos) {
    if (!a.atrasada && agora - a.ultima < JANELA_FOCO_MS) continue;
    revalidarAgora(a);
  }
}

function registrar(a: Assinante): () => void {
  if (todos.size === 0) {
    document.addEventListener("visibilitychange", aoVoltarOFoco);
    window.addEventListener("focus", aoVoltarOFoco);
  }
  todos.add(a);
  return () => {
    todos.delete(a);
    if (todos.size === 0) {
      document.removeEventListener("visibilitychange", aoVoltarOFoco);
      window.removeEventListener("focus", aoVoltarOFoco);
    }
  };
}

function entregar(a: Assinante, ev: EventoBanco) {
  if (a.tabelas && !a.tabelas.has(ev.tabela)) return;
  if (a.modo === "buscar" && !visivel()) {
    a.atrasada = true;
    return;
  }
  a.aoEvento(ev);
}

function reconectou(a: Assinante) {
  if (visivel()) revalidarAgora(a);
  else a.atrasada = true;
}

type PayloadCru = { eventType?: string; new?: unknown; old?: unknown };
type CanalSolto = {
  on(
    tipo: "postgres_changes",
    filtro: { event: string; schema: string; table: string; filter?: string },
    cb: (pl: PayloadCru) => void
  ): CanalSolto;
  subscribe(cb: (status: string) => void): unknown;
};

type Escuta = { tabela: string; evento: string; filtro?: string };

/**
 * Monta UM canal (depois da sessão) com o callback de status que pula a primeira
 * `SUBSCRIBED`. Devolve a limpeza.
 */
function montarCanal(
  nome: string,
  escutas: readonly Escuta[],
  aoEvento: (ev: EventoBanco) => void,
  aoReconectar: () => void
): () => void {
  let primeira = true;
  return assinarComSessao((sb) => {
    // eslint-disable-next-line no-restricted-syntax -- este módulo é o único lugar que abre canal
    const base = sb.channel(nome);
    let c = base as unknown as CanalSolto;
    for (const e of escutas) {
      c = c.on(
        "postgres_changes",
        { event: e.evento, schema: "public", table: e.tabela, filter: e.filtro },
        (pl) =>
          aoEvento({
            tabela: e.tabela,
            tipo: (pl.eventType ?? e.evento) as EventoBanco["tipo"],
            novo: (pl.new as Linha | null) ?? null,
            antigo: (pl.old as Linha | null) ?? null,
          })
      );
    }
    c.subscribe((status: string) => {
      if (status !== "SUBSCRIBED") return;
      if (primeira) {
        primeira = false;
        return;
      }
      aoReconectar();
    });
    return base;
  });
}

// O canal do tenant, um por aba. Reaproveitado por todo assinante do mesmo
// tenant e fechado `GRACA_CANAL_MS` depois que o último sai (a navegação entre
// telas desmonta um componente e monta outro, e refazer o canal ali seria
// desperdício).
type CanalDoTenant = {
  assinantes: Set<Assinante>;
  sair: () => void;
  encerrar: ReturnType<typeof setTimeout> | null;
};
const canaisDoTenant = new Map<string, CanalDoTenant>();

function entrarNoTenant(clientId: string, a: Assinante): () => void {
  let t = canaisDoTenant.get(clientId);
  if (!t) {
    const assinantes = new Set<Assinante>();
    t = {
      assinantes,
      encerrar: null,
      sair: montarCanal(
        `tenant-${clientId}`,
        ESCUTAS_DO_TENANT.map((e) => ({ ...e, filtro: `client_id=eq.${clientId}` })),
        (ev) => assinantes.forEach((x) => entregar(x, ev)),
        () => assinantes.forEach(reconectou)
      ),
    };
    canaisDoTenant.set(clientId, t);
  }
  const canal = t;
  if (canal.encerrar) {
    clearTimeout(canal.encerrar);
    canal.encerrar = null;
  }
  canal.assinantes.add(a);
  return () => {
    canal.assinantes.delete(a);
    if (canal.assinantes.size > 0) return;
    canal.encerrar = setTimeout(() => {
      if (canal.assinantes.size > 0) return;
      canal.sair();
      if (canaisDoTenant.get(clientId) === canal) canaisDoTenant.delete(clientId);
    }, GRACA_CANAL_MS);
  };
}

type OpcoesComuns = {
  /** `buscar` (padrão): escondida, só anota. `aplicar`: entrega sempre (só encaixa payload). */
  modo?: Modo;
  /** Reconectou, voltou o foco ou a aba ficou para trás: refazer o que a tela mostra. */
  revalidar?: () => void;
  aoEvento: (ev: EventoBanco) => void;
  /** Desliga tudo (preview `/design`, sem banco nem sessão). */
  ativo?: boolean;
};

function useAssinante(
  { modo = "buscar", revalidar, aoEvento }: OpcoesComuns,
  montar: ((a: Assinante) => () => void) | null,
  tabelas: ReadonlySet<string> | null,
  chave: string
) {
  const aoEventoRef = useRef(aoEvento);
  const revalidarRef = useRef(revalidar);
  useEffect(() => {
    aoEventoRef.current = aoEvento;
    revalidarRef.current = revalidar;
  });

  useEffect(() => {
    if (!montar) return;
    const a: Assinante = {
      modo,
      tabelas,
      aoEvento: (ev) => aoEventoRef.current(ev),
      revalidar: () => revalidarRef.current?.(),
      atrasada: false,
      ultima: Date.now(),
    };
    const sairFoco = registrar(a);
    const sairCanal = montar(a);
    return () => {
      sairCanal();
      sairFoco();
    };
    // `chave` resume o que identifica a assinatura; `montar` e `tabelas` nascem
    // dela a cada render e não devem refazer o canal sozinhos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, modo]);
}

/**
 * Assina as tabelas do TENANT (canal compartilhado). O `aoEvento` recebe só as
 * tabelas pedidas e deve ignorar o que não é da conversa dele (`foneDoEvento`).
 */
export function useCanalTenant({
  clientId,
  tabelas,
  ...resto
}: OpcoesComuns & {
  clientId: string | null | undefined;
  tabelas: readonly TabelaTenant[];
}) {
  const ligado = !!clientId && resto.ativo !== false;
  const chave = `tenant:${clientId}:${tabelas.join(",")}:${ligado}`;
  useAssinante(
    resto,
    ligado ? (a) => entrarNoTenant(clientId as string, a) : null,
    new Set(tabelas),
    chave
  );
}

/**
 * Canal PRÓPRIO, filtrado no servidor por uma coluna da conversa (hoje só
 * `chat_messages` por `phone`: tabela de alto volume, não vale mandar a
 * conversa dos outros para esta aba). Mesmas regras do canal do tenant.
 */
export function useCanalConversa({
  nome,
  tabela,
  filtro,
  ...resto
}: OpcoesComuns & {
  nome: string;
  tabela: string;
  /** Filtro do servidor, por exemplo `phone=eq.55...@s.whatsapp.net`. */
  filtro: string;
}) {
  // O sufixo evita dois canais com o MESMO nome na mesma aba (o Supabase devolve
  // o canal que já está inscrito, e um `.on()` novo nele derruba a página).
  const instancia = useId();
  const ligado = resto.ativo !== false;
  const chave = `conversa:${nome}:${tabela}:${filtro}:${ligado}`;
  useAssinante(
    resto,
    ligado
      ? (a) =>
          montarCanal(
            `${nome}-${instancia}`,
            [{ tabela, evento: "*", filtro }],
            (ev) => entregar(a, ev),
            () => reconectou(a)
          )
      : null,
    null,
    chave
  );
}
