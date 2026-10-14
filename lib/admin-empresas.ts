import type { LinhaRpc } from "@/lib/supabase/schema";
import { normalizar } from "./clientes";
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

// A LISTA DE EMPRESAS DO /admin (P1 item 6, primeira fatia do Admin v1).
//
// Uma linha por empresa (tenant, `clients`): estado da IA, tokens do mês, % do
// teto, custo estimado e o teto. 10 por vez, em ordem de nome, busca por nome no
// SERVIDOR (`admin_empresas_pagina`, service_role, só pelas rotas do admin). O
// preview `/design/admin` roda a mesma conta sobre a memória.
//
// Sem realtime de propósito (decisão do plano): o dono atualiza com um botão.

export const PAGINA_EMPRESAS = 10;

export interface EmpresaItem {
  id: string;
  nome: string;
  /** `clients.account_type` (identifica, nunca autoriza; nulo = sem tipo). */
  tipo: string | null;
  /** `clients.billing_plan` (nulo = sem plano). */
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
}

export type LinhaEmpresa = LinhaRpc<
  "admin_empresas_pagina",
  "account_type" | "billing_plan" | "agent_published_at" | "ia_limite_tokens" | "ultima_atividade"
>;

/** A linha do banco vira o item da tela. `modelo` é o que atende hoje (o custo depende dele). */
export function paraEmpresa(l: LinhaEmpresa, modelo: string | null): EmpresaItem {
  const tokens: TokensDoMes = {
    entrada: Number(l.tokens_entrada) || 0,
    cache: Number(l.tokens_cache) || 0,
    saida: Number(l.tokens_saida) || 0,
  };
  const limiteGravado = l.ia_limite_tokens == null ? null : Number(l.ia_limite_tokens);
  const limite = limiteDaEmpresa(limiteGravado);
  const usados = tokensUsados(tokens);
  const consumo = estadoDoConsumo(usados, limite);
  return {
    id: l.id,
    nome: l.name,
    tipo: l.account_type,
    plano: l.billing_plan,
    publicada: !!l.agent_published_at,
    ligada: l.agent_enabled !== false,
    limiteGravado,
    limite,
    tokens,
    usados,
    consumo,
    estado: estadoDaIa({ publicada: !!l.agent_published_at, ligada: l.agent_enabled !== false, consumo }),
    percentual: percentualDoLimite(usados, limite),
    custoUsd: custoEstimadoUsd(tokens, modelo),
    ultimaAtividade: l.ultima_atividade,
  };
}

/** Recalcula o item com um teto novo (depois de editar), sem ir ao banco. */
export function comLimite(e: EmpresaItem, limiteGravado: number | null): EmpresaItem {
  const limite = limiteDaEmpresa(limiteGravado);
  const consumo = estadoDoConsumo(e.usados, limite);
  return {
    ...e,
    limiteGravado,
    limite,
    consumo,
    estado: estadoDaIa({ publicada: e.publicada, ligada: e.ligada, consumo }),
    percentual: percentualDoLimite(e.usados, limite),
  };
}

export interface ParamsEmpresas {
  busca: string;
}

export interface FonteEmpresas {
  pagina(p: ParamsEmpresas, depois: EmpresaItem | null, n?: number): Promise<EmpresaItem[]>;
}

/** Navegador: a rota do admin (o service_role nunca sai do servidor). */
export function fonteEmpresasDaApi(): FonteEmpresas {
  return {
    async pagina(p, depois, n = PAGINA_EMPRESAS) {
      const q = new URLSearchParams();
      if (p.busca.trim()) q.set("busca", p.busca.trim());
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

/** Preview `/design/admin`: a mesma ordem e a mesma busca sobre a memória. */
export function fonteEmpresasDaMemoria(todas: EmpresaItem[]): FonteEmpresas {
  const ordenadas = [...todas].sort(antes);
  return {
    async pagina(p, depois, n = PAGINA_EMPRESAS) {
      const lista = ordenadas.filter((e) => casaNome(e.nome, p.busca));
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
