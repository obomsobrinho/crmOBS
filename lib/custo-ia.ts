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
import { diaIsoSP, diasDoMes, inicioDoDiaSP, somarMes } from "./fuso";
import { telefoneImpossivel } from "./avisos";
import { PLANS, PLAN_ORDER, type PlanKey } from "./billing";

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
 * Teto de quem NÃO tem plano (teste, conta interna, vitalício sem plano): 10 milhões de
 * tokens (~2.100 respostas, ~US$ 5 no `gpt-5.4-mini`, medido na OBM em 13/10/2026).
 */
export const LIMITE_PADRAO_TOKENS = 10_000_000;

/**
 * Teto por PLANO (decisão do dono, 15/10/2026): Essencial 13 mi, Profissional 33 mi,
 * Avançado 100 mi. Derivação em `DERIVACAO_DO_LIMITE` (conversas do plano em
 * `lib/billing.ts` x turnos por conversa x tokens por turno x margem), arredondada para o
 * número redondo que o dono aprovou. `clients.ia_limite_tokens` (limite personalizado)
 * sempre vence; sem plano vale `LIMITE_PADRAO_TOKENS`.
 */
export const LIMITE_POR_PLANO: Readonly<Record<PlanKey, number>> = {
  essencial: 13_000_000,
  profissional: 33_000_000,
  avancado: 100_000_000,
};

/**
 * De onde saem os números de `LIMITE_POR_PLANO`: 6 turnos do agente por conversa e cerca de
 * 4.400 tokens por turno (medido nos últimos 30 dias, 15/10/2026), com 25% de margem.
 */
export const DERIVACAO_DO_LIMITE = { turnosPorConversa: 6, tokensPorTurno: 4_400, margem: 1.25 } as const;

/** Tokens por mês que um plano de `conversas` por mês precisa, pela derivação (sem arredondar). */
export function limiteDerivadoDoPlano(conversas: number): number {
  const d = DERIVACAO_DO_LIMITE;
  return conversas * d.turnosPorConversa * d.tokensPorTurno * d.margem;
}

/** A chave do plano, ou `null` (nunca um plano chutado). */
export function chaveDoPlano(v: string | null | undefined): PlanKey | null {
  return (PLAN_ORDER as readonly string[]).includes(v ?? "") ? (v as PlanKey) : null;
}

/** De onde vem o teto de uma empresa. */
export type OrigemDoLimite = "personalizado" | "plano" | "padrao";

function limiteGravadoValido(gravado: number | null | undefined): gravado is number {
  return typeof gravado === "number" && Number.isFinite(gravado) && gravado > 0;
}

export function origemDoLimite(gravado: number | null | undefined, plano?: string | null): OrigemDoLimite {
  if (limiteGravadoValido(gravado)) return "personalizado";
  return chaveDoPlano(plano) ? "plano" : "padrao";
}

/** O texto que acompanha o teto: "Plano Avançado", "Limite personalizado" ou "Sem plano". */
export function rotuloDaOrigemDoLimite(gravado: number | null | undefined, plano?: string | null): string {
  const origem = origemDoLimite(gravado, plano);
  if (origem === "personalizado") return "Limite personalizado";
  const chave = chaveDoPlano(plano);
  return origem === "plano" && chave ? `Plano ${PLANS[chave].name}` : "Sem plano";
}

/** A partir de quanto do teto a empresa e o dono são avisados (80%). */
export const FRACAO_DO_AVISO = 0.8;

/** Tokens do mês, como `consumo_ia_mensal` guarda. `entrada` INCLUI os do cache. */
export interface TokensDoMes {
  entrada: number;
  cache: number;
  saida: number;
}

export type EstadoDoConsumo = "normal" | "aviso" | "parado";

/**
 * O teto da empresa: o personalizado gravado (`ia_limite_tokens`), senão o do PLANO
 * (`LIMITE_POR_PLANO`), senão o padrão de quem não tem plano. É a ÚNICA regra: o
 * `processTurn`, a faixa do app, os avisos e a central usam esta função.
 */
export function limiteDaEmpresa(gravado: number | null | undefined, plano?: string | null): number {
  if (limiteGravadoValido(gravado)) return gravado;
  const chave = chaveDoPlano(plano);
  return chave ? LIMITE_POR_PLANO[chave] : LIMITE_PADRAO_TOKENS;
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

/**
 * Os limiares do teto que VALE para a empresa (o personalizado, senão o do plano, senão o padrão). É o que
 * qualquer escrita que muda o teto passa ao banco para limpar as marcas dos avisos do mês: a edição do
 * limite (`admin_mudar_limite_ia`) e a troca de plano (`limpar_marcas_consumo_ia`, via
 * `alinharMarcasDoMes`, lib/consumo-ia.ts). Uma regra só, a de `limiaresDoLimite`.
 */
export function limiaresDaEmpresa(
  gravado: number | null | undefined,
  plano?: string | null
): { aviso: number; parado: number } {
  return limiaresDoLimite(limiteDaEmpresa(gravado, plano));
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

/** "1,2 bi", "1,2 mi", "850 mil", "320". */
export function tokensCurto(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000_000) return `${FMT_UMA_CASA.format(v / 1_000_000_000)} bi`;
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

/** O mês civil de São Paulo de um instante: a chave `AAAA-MM`, e os instantes (ms) em que ele começa e acaba. */
function mesCivilSP(agora: number): { mes: string; inicio: number; fim: number } {
  const mes = mesSP(agora).slice(0, 7);
  return { mes, inicio: inicioDoDiaSP(`${mes}-01`), fim: inicioDoDiaSP(`${somarMes(mes, 1)}-01`) };
}

/**
 * Quanto do mês civil de São Paulo já passou, de 0 a 1 (o instante dentro do mês, pelo relógio de lá). É a
 * base do "gasto ideal até hoje" (limite x esta fração).
 */
export function fracaoDoMesSP(agora: number): number {
  const { inicio, fim } = mesCivilSP(agora);
  return Math.min(1, Math.max(0, (agora - inicio) / (fim - inicio)));
}

/**
 * ONDE o uso do mês está contra o ritmo ideal de hoje: a posição do marcador (`idealPct`, a fração do mês em
 * %) e se o gasto está no ou abaixo do ritmo (`abaixo`, bom: gasto, menos é melhor) ou acima (`acima`, ruim).
 * É a ÚNICA regra de "no ritmo": a barra de meta, a frase e a projeção saem dela, nunca de uma segunda conta.
 */
export function posicaoNoRitmo(
  usados: number,
  limite: number,
  agora: number
): { idealPct: number; estado: "abaixo" | "acima" } {
  const f = fracaoDoMesSP(agora);
  return { idealPct: f * 100, estado: usados <= limite * f ? "abaixo" : "acima" };
}

/**
 * O ritmo do gasto do mês: o uso contra o ideal de hoje (limite x fração do mês já passada) e para onde o
 * ritmo atual leva. `abaixo` é bom (gasta menos que o ritmo do limite), `acima` é ruim. A projeção usa o
 * MESMO contador do mês (`usados`) e a fração do mês, nada de curva inventada: no ritmo atual o mês termina
 * em `usados / fração` tokens, e o limite se esgota na fração `fração x limite / usados` do mês. Sem
 * dados de verdade (nenhum token, ou menos de um dia inteiro do mês passado) devolve `null`: a tela não diz nada.
 */
export interface RitmoDoMes {
  estado: "abaixo" | "acima";
  /** O gasto ideal até hoje, em % do limite (a posição do marcador). */
  idealPct: number;
  /** Onde o mês termina no ritmo atual, em % do limite. */
  projetadoPct: number;
  /** O limite já foi atingido. */
  esgotado: boolean;
  /** O dia (AAAA-MM-DD, São Paulo) em que o ritmo atual esgota o limite; nulo quando está abaixo do ritmo ou já esgotou. */
  esgotaEm: string | null;
}

export function ritmoDoMes(usados: number, limite: number, agora: number): RitmoDoMes | null {
  if (!(limite > 0) || !(usados > 0)) return null;
  const { mes, inicio, fim } = mesCivilSP(agora);
  const f = fracaoDoMesSP(agora);
  if (f * diasDoMes(mes) < 1) return null; // menos de um dia inteiro: o número ainda é ruído
  const { idealPct, estado } = posicaoNoRitmo(usados, limite, agora);
  const projetadoPct = (usados / f / limite) * 100;
  const esgotado = usados >= limite;
  let esgotaEm: string | null = null;
  if (estado === "acima" && !esgotado) {
    esgotaEm = diaIsoSP(inicio + ((f * limite) / usados) * (fim - inicio));
  }
  return { estado, idealPct, projetadoPct, esgotado, esgotaEm };
}

/** A frase sob a barra: "Abaixo do ritmo: ... termina o mês em 38% do limite" ou "Acima do ritmo: ... passa do limite por volta de 24/10". */
export function textoDoRitmo(r: RitmoDoMes): string {
  if (r.estado === "abaixo") {
    return `Abaixo do ritmo: no ritmo atual termina o mês em ${Math.round(r.projetadoPct)}% do limite`;
  }
  if (r.esgotado || !r.esgotaEm) return "Acima do ritmo: o limite do mês já foi atingido";
  const [, mes, dia] = r.esgotaEm.split("-");
  return `Acima do ritmo: no ritmo atual passa do limite por volta de ${dia}/${mes}`;
}
