import type { LinhaRpc } from "@/lib/supabase/schema";
import { normalizar } from "./clientes";
import {
  alertasDaConta,
  nomeDoPlano,
  situacaoDaConta,
  type Alerta,
  type EstadoDoWhatsApp,
  type FiltroDeSituacao,
  type Situacao,
} from "./admin-alertas";
import {
  custoEstimadoUsd,
  estadoDaIa,
  estadoDoConsumo,
  limiteDaEmpresa,
  percentualDoLimite,
  tokensUsados,
  type EstadoDaIa,
  type EstadoDoConsumo,
  type TokensDoMes,
} from "./custo-ia";

// A LISTA DE CLIENTES DA CENTRAL DO DONO (P1 item 6; docs/plano-central-clientes.md).
//
// Uma linha por cliente (tenant, `clients`): situação da assinatura, estado da
// IA, tokens do mês, % do teto, custo estimado, última atividade e o alerta
// principal. 10 por vez, em ordem de nome, busca por nome e filtro de situação no
// SERVIDOR (`admin_empresas_pagina`, service_role, só pelas rotas do admin). O
// preview `/design/clientes` roda a mesma conta sobre a memória.
//
// Sem realtime de propósito (decisão do plano): o dono atualiza com um botão.

export const PAGINA_EMPRESAS = 10;

export interface EmpresaItem {
  id: string;
  nome: string;
  /** `clients.account_type` (identifica, nunca autoriza; nulo = sem tipo). */
  tipo: string | null;
  /** Nome do plano em `clients.billing_plan` (`PLANS`); nulo = sem plano. */
  plano: string | null;
  publicada: boolean;
  ligada: boolean;
  /** O teto gravado (nulo = o padrão). */
  limiteGravado: number | null;
  /** O teto que vale (o gravado ou o padrão). */
  limite: number;
  tokens: TokensDoMes;
  usados: number;
  consumo: EstadoDoConsumo;
  estado: EstadoDaIa;
  percentual: number;
  /** Estimativa pela tabela oficial; nulo quando o modelo não está nela. */
  custoUsd: number | null;
  ultimaAtividade: string | null;
  /** As colunas de assinatura que `accessState` lê (a situação sai delas). */
  conta: { subscription_status: string; trial_ends_at: string | null; grace_until: string | null };
  situacao: Situacao;
  /** Do mais urgente ao menos; o primeiro é o principal. */
  alertas: Alerta[];
  /** `clients.evolution_instance` preenchida (o banco não guarda se a conexão está de pé). */
  temInstancia: boolean;
  criadaEm: string;
}

/** O item sem os alertas (os alertas dependem do resto dele). */
export type EmpresaBase = Omit<EmpresaItem, "alertas">;

export type LinhaEmpresa = LinhaRpc<
  "admin_empresas_pagina",
  | "account_type"
  | "billing_plan"
  | "agent_published_at"
  | "ia_limite_tokens"
  | "ultima_atividade"
  | "trial_ends_at"
  | "grace_until"
>;

/**
 * A linha do banco vira o item da tela. `modelo` é o que atende hoje (o custo
 * depende dele); `agora` é o relógio de quem monta (situação e alertas dependem
 * de datas).
 */
export function paraEmpresa(l: LinhaEmpresa, modelo: string | null, agora: number): EmpresaItem {
  const tokens: TokensDoMes = {
    entrada: Number(l.tokens_entrada) || 0,
    cache: Number(l.tokens_cache) || 0,
    saida: Number(l.tokens_saida) || 0,
  };
  const limiteGravado = l.ia_limite_tokens == null ? null : Number(l.ia_limite_tokens);
  const limite = limiteDaEmpresa(limiteGravado);
  const usados = tokensUsados(tokens);
  const consumo = estadoDoConsumo(usados, limite);
  const publicada = !!l.agent_published_at;
  const ligada = l.agent_enabled !== false;
  const conta = {
    subscription_status: l.subscription_status,
    trial_ends_at: l.trial_ends_at,
    grace_until: l.grace_until,
  };
  const temInstancia = !!l.tem_instancia;
  const base: EmpresaBase = {
    id: l.id,
    nome: l.name,
    tipo: l.account_type,
    plano: nomeDoPlano(l.billing_plan),
    publicada,
    ligada,
    limiteGravado,
    limite,
    tokens,
    usados,
    consumo,
    estado: estadoDaIa({ publicada, ligada, consumo }),
    percentual: percentualDoLimite(usados, limite),
    custoUsd: custoEstimadoUsd(tokens, modelo),
    ultimaAtividade: l.ultima_atividade,
    conta,
    situacao: situacaoDaConta(conta, agora),
    temInstancia,
    criadaEm: l.created_at,
  };
  return { ...base, alertas: alertasDaEmpresa(base, agora) };
}

/**
 * Os alertas de UMA empresa: a lista, `comLimite` e o detalhe usam esta função
 * (o detalhe passa o estado do WhatsApp lido ao vivo). A regra é de
 * `alertasDaConta` (lib/admin-alertas.ts); aqui só se monta a entrada a partir
 * do item que já tem o estado da IA calculado.
 */
export function alertasDaEmpresa(e: EmpresaBase, agora: number, whatsapp?: EstadoDoWhatsApp): Alerta[] {
  return alertasDaConta({
    conta: e.conta,
    estado: e.estado,
    publicada: e.publicada,
    temInstancia: e.temInstancia,
    ultimaAtividade: e.ultimaAtividade,
    criadaEm: e.criadaEm,
    agora,
    whatsapp,
  });
}

/** Recalcula o item com um teto novo (depois de editar), sem ir ao banco. */
export function comLimite(e: EmpresaItem, limiteGravado: number | null, agora: number): EmpresaItem {
  const limite = limiteDaEmpresa(limiteGravado);
  const consumo = estadoDoConsumo(e.usados, limite);
  const novo: EmpresaBase = {
    ...e,
    limiteGravado,
    limite,
    consumo,
    estado: estadoDaIa({ publicada: e.publicada, ligada: e.ligada, consumo }),
    percentual: percentualDoLimite(e.usados, limite),
  };
  return { ...novo, alertas: alertasDaEmpresa(novo, agora) };
}

export interface ParamsEmpresas {
  busca: string;
  /** Filtro de situação (`subscription_status` gravado); nulo = todos. */
  situacao: FiltroDeSituacao | null;
}

export interface FonteEmpresas {
  pagina(p: ParamsEmpresas, depois: EmpresaItem | null, n?: number): Promise<EmpresaItem[]>;
}

/** Navegador: a rota da central (o service_role nunca sai do servidor). */
export function fonteEmpresasDaApi(): FonteEmpresas {
  return {
    async pagina(p, depois, n = PAGINA_EMPRESAS) {
      const q = new URLSearchParams();
      if (p.busca.trim()) q.set("busca", p.busca.trim());
      if (p.situacao) q.set("situacao", p.situacao);
      if (depois) {
        q.set("depoisNome", depois.nome);
        q.set("depoisId", depois.id);
      }
      q.set("n", String(n));
      const res = await fetch(`/api/admin/empresas?${q.toString()}`);
      if (!res.ok) throw new Error(`empresas: ${res.status}`);
      const corpo = (await res.json()) as { itens?: EmpresaItem[] };
      return corpo.itens ?? [];
    },
  };
}

/** Busca por nome igual em espírito ao SQL (sem acento, sem caixa). */
export function casaNome(nome: string, busca: string): boolean {
  const q = normalizar(busca.trim());
  return q === "" || normalizar(nome).includes(q);
}

/** Ordem do SQL: nome, depois id. */
function antes(a: EmpresaItem, b: EmpresaItem): number {
  if (a.nome !== b.nome) return a.nome < b.nome ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Preview `/design/clientes`: a mesma ordem, a mesma busca e o mesmo filtro sobre a memória. */
export function fonteEmpresasDaMemoria(todas: EmpresaItem[]): FonteEmpresas {
  const ordenadas = [...todas].sort(antes);
  return {
    async pagina(p, depois, n = PAGINA_EMPRESAS) {
      const lista = ordenadas.filter(
        (e) => casaNome(e.nome, p.busca) && (!p.situacao || e.conta.subscription_status === p.situacao)
      );
      const ini = depois ? lista.findIndex((e) => antes(e, depois) > 0) : 0;
      return ini < 0 ? [] : lista.slice(ini, ini + n);
    },
  };
}

/**
 * O teto que a pessoa digitou, SEMPRE em milhões de tokens ("10", "2,5", "2.5"),
 * vira tokens inteiros, ou `null` para "usar o padrão" (campo vazio). Inválido
 * (zero, negativo, texto) devolve `undefined`. Limite superior de 1 bilhão
 * (1.000 milhões): acima disso é erro de digitação.
 */
export const LIMITE_MAXIMO_TOKENS = 1_000_000_000;

export function limiteDigitado(texto: string): number | null | undefined {
  const t = texto.trim();
  if (t === "") return null;
  // Vírgula OU ponto é a casa decimal ("2,5" e "2.5" são 2,5 milhões), nunca
  // separador de milhar: "0.5" era 5 milhões na primeira versão.
  if (!/^\d+([.,]\d+)?$/.test(t)) return undefined;
  const tokens = Math.round(Number(t.replace(",", ".")) * 1_000_000);
  if (!Number.isFinite(tokens) || tokens < 1 || tokens > LIMITE_MAXIMO_TOKENS) return undefined;
  return tokens;
}

/** Valida o corpo da rota: inteiro positivo até o máximo, ou null (o padrão). */
export function limiteValido(v: unknown): v is number | null {
  return (
    v === null ||
    (typeof v === "number" && Number.isInteger(v) && v > 0 && v <= LIMITE_MAXIMO_TOKENS)
  );
}
