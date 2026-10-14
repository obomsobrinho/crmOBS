// USO DE IA POR EMPRESA E TETO DO MÊS (P1 item 6, docs/plano-custo-ia.md,
// aprovado pelo dono em 13/10/2026; docs/adr/2026-10-13-ai-usage-cap-in-tokens.md).
//
// Módulo PURO (sem I/O): o `processTurn` (checagem antes do modelo), o `logTurn`
// (soma do turno), a faixa da empresa, a bancada e o `/admin` usam as MESMAS
// funções. Duas opiniões sobre "a IA desta empresa está parada?" é como a faixa
// diz uma coisa e o WhatsApp faz outra.
//
// O teto é em TOKENS (entrada + saída dos turnos do agente), não em dinheiro. O
// custo em US$ é só ESTIMATIVA, pela tabela oficial abaixo, e modelo fora da
// tabela é `null` (nunca um chute).
import { diaIsoSP } from "./fuso";
import { telefoneImpossivel } from "./avisos";

/**
 * QUEM PODE DISPARAR O AVISO DE USO DE IA (revisão do arquiteto, 13/10/2026).
 * Só um turno REAL do WhatsApp: nunca a bancada (`dryRun`, que roda as suítes
 * pagas no tenant de teste) e nunca o telefone de teste (DDD 00). Nenhum teste
 * automático pode causar chamada à Evolution
 * (docs/adr/2026-10-03-test-phone-never-reaches-evolution.md). A bancada CONTA e
 * é BARRADA pelo teto igual; se ela cruzar a linha, o primeiro turno real
 * depois manda o aviso pendente (o estado do mês decide, e
 * `marcar_aviso_consumo` garante uma vez só).
 */
export function podeAvisarConsumo(t: { dryRun: boolean; phone: string }): boolean {
  return !t.dryRun && !telefoneImpossivel(t.phone);
}

/**
 * Preço oficial por 1 milhão de tokens, em US$. Fonte:
 * https://developers.openai.com/api/docs/pricing, lida em 13/10/2026.
 * Modelo novo só entra aqui com a fonte e a data; fora da tabela, o custo é `null`.
 */
export const FONTE_DOS_PRECOS = {
  url: "https://developers.openai.com/api/docs/pricing",
  lidoEm: "2026-10-13",
} as const;

export interface PrecoPorMilhao {
  entrada: number;
  entradaCache: number;
  saida: number;
}

export const PRECOS_POR_MODELO: Readonly<Record<string, PrecoPorMilhao>> = {
  "gpt-5.4-mini": { entrada: 0.75, entradaCache: 0.075, saida: 4.5 },
};

/**
 * Teto padrão por empresa e mês: 10 milhões de tokens (~2.100 respostas, ~US$ 5
 * no `gpt-5.4-mini`, medido na OBM em 13/10/2026). `clients.ia_limite_tokens`
 * nulo significa este valor.
 */
export const LIMITE_PADRAO_TOKENS = 10_000_000;

/** A partir de quanto do teto a empresa e o dono são avisados (80%). */
export const FRACAO_DO_AVISO = 0.8;

/** Tokens do mês, como `consumo_ia_mensal` guarda. `entrada` INCLUI os do cache. */
export interface TokensDoMes {
  entrada: number;
  cache: number;
  saida: number;
}

export type EstadoDoConsumo = "normal" | "aviso" | "parado";

/** O teto da empresa: o gravado, ou o padrão quando é nulo (ou inválido). */
export function limiteDaEmpresa(gravado: number | null | undefined): number {
  return typeof gravado === "number" && Number.isFinite(gravado) && gravado > 0
    ? gravado
    : LIMITE_PADRAO_TOKENS;
}

/** O que conta para o teto: entrada (com o cache) mais saída. */
export function tokensUsados(t: Pick<TokensDoMes, "entrada" | "saida">): number {
  return Math.max(0, t.entrada || 0) + Math.max(0, t.saida || 0);
}

/** `normal` abaixo de 80%, `aviso` de 80% até o teto, `parado` no teto ou acima. */
export function estadoDoConsumo(usados: number, limite: number): EstadoDoConsumo {
  if (usados >= limite) return "parado";
  if (usados >= limite * FRACAO_DO_AVISO) return "aviso";
  return "normal";
}

/**
 * Os limiares do teto em tokens inteiros: `aviso` (80%) e `parado` (100%).
 * Para uso inteiro, `usados >= aviso` é o mesmo que `estadoDoConsumo` dizer
 * aviso. É o que o SQL do admin recebe para limpar marcas (a regra fica aqui).
 */
export function limiaresDoLimite(limite: number): { aviso: number; parado: number } {
  return { aviso: Math.ceil(limite * FRACAO_DO_AVISO), parado: limite };
}

/** Marcas dos avisos do mês (`consumo_ia_mensal.aviso_80_em`/`aviso_100_em`). */
export interface MarcasDoMes {
  aviso80: string | null;
  aviso100: string | null;
}

/**
 * Qual aviso está PENDENTE: o nível do estado atual cuja marca ainda é nula.
 * Nulo = nada a mandar (abaixo de 80%, ou já marcado). Decide sem escrever no
 * banco: depois do aviso, nenhuma mensagem tenta de novo.
 */
export function avisoPendente(
  estado: EstadoDoConsumo,
  marcas: MarcasDoMes
): "aviso" | "parado" | null {
  if (estado === "parado") return marcas.aviso100 ? null : "parado";
  if (estado === "aviso") return marcas.aviso80 ? null : "aviso";
  return null;
}

/** Porcentagem do teto já usada (pode passar de 100). */
export function percentualDoLimite(usados: number, limite: number): number {
  if (limite <= 0) return 100;
  return (usados / limite) * 100;
}

/**
 * Custo ESTIMADO em US$ pela tabela oficial. A parte da entrada que veio do
 * cache paga o preço do cache; o resto, o preço cheio. Modelo fora da tabela (ou
 * sem modelo) devolve `null`: nunca um preço parecido.
 */
export function custoEstimadoUsd(
  t: TokensDoMes,
  modelo: string | null | undefined
): number | null {
  const preco = modelo ? PRECOS_POR_MODELO[modelo] : undefined;
  if (!preco) return null;
  const entrada = Math.max(0, t.entrada || 0);
  const cache = Math.min(entrada, Math.max(0, t.cache || 0));
  const saida = Math.max(0, t.saida || 0);
  return (
    ((entrada - cache) * preco.entrada + cache * preco.entradaCache + saida * preco.saida) /
    1_000_000
  );
}

/**
 * O mês civil de São Paulo de um instante, como `AAAA-MM-01` (a chave de
 * `consumo_ia_mensal`). Vira à meia-noite do dia 1 em São Paulo, nunca em UTC.
 */
export function mesSP(instante: number | Date): string {
  return `${diaIsoSP(instante).slice(0, 7)}-01`;
}

/**
 * Estado da IA de uma empresa como o `/admin` mostra: desligada na chave (ou
 * nunca publicada) vem antes do consumo, porque aí o teto não importa.
 */
export type EstadoDaIa = "ativa" | "aviso" | "parada" | "desligada";

export function estadoDaIa(a: {
  publicada: boolean;
  ligada: boolean;
  consumo: EstadoDoConsumo;
}): EstadoDaIa {
  if (!a.publicada || !a.ligada) return "desligada";
  if (a.consumo === "parado") return "parada";
  if (a.consumo === "aviso") return "aviso";
  return "ativa";
}

export const ROTULO_ESTADO_DA_IA: Record<EstadoDaIa, string> = {
  ativa: "Ativa",
  aviso: "Perto do limite",
  parada: "Parada no limite",
  desligada: "Desligada",
};

/** Texto da faixa da empresa e da bancada quando o teto do mês foi atingido. */
export const TEXTO_LIMITE_ATINGIDO = "Limite de IA do mês atingido";
export const TEXTO_LIMITE_ATINGIDO_DETALHE =
  "A IA não responde até o mês virar ou o limite ser aumentado. As mensagens continuam chegando e o time segue atendendo por aqui.";

/** Orientar um pedido com a IA parada no limite: recusado, o pedido fica aberto. */
export const TEXTO_ORIENTAR_NO_LIMITE =
  "A IA está parada no limite de uso do mês. Responda pela conversa ou peça para aumentar o limite.";

// ---------------------------------------------------------------------------
// Formatos de tela (pt-BR). Um formatador só por tipo: criar Intl custa caro.
// ---------------------------------------------------------------------------

const FMT_UMA_CASA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const FMT_USD = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1,2 mi", "850 mil", "320". */
export function tokensCurto(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${FMT_UMA_CASA.format(v / 1_000_000)} mi`;
  if (v >= 1_000) return `${FMT_UMA_CASA.format(v / 1_000)} mil`;
  return String(v);
}

/** "US$ 3,50"; abaixo de um centavo, "menos de US$ 0,01"; sem preço, null. */
export function usdCurto(v: number | null): string | null {
  if (v == null) return null;
  if (v > 0 && v < 0.01) return `menos de ${FMT_USD.format(0.01)}`;
  return FMT_USD.format(v);
}
