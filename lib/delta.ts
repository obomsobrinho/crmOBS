// Variação de um indicador entre o período atual e o anterior.
//
// Módulo PURO (zero imports, zero I/O), igual a `lib/valor.ts`, `lib/metrics.ts`
// e `lib/billing.ts`: servidor e browser precisam ter UMA opinião sobre o mesmo
// número. O cartão (`components/ui/stat.tsx`) não sabe nada disto de propósito.
//
// A regra que manda em tudo aqui: NUNCA inventar nem inflar. O cliente confere
// no WhatsApp dele, e um selo de variação errado é pior que nenhum selo. Por isso
// o resultado tem um estado "sem base" de primeira classe, e ele é o padrão
// quando falta período anterior para comparar.

/**
 * Para onde o número precisa ir para ser boa notícia.
 *
 * `neutra` existe e é usada de propósito no volume de conversas: demanda cair
 * não é o produto falhando, e pintar isso de vermelho joga o mercado do cliente
 * na nossa conta.
 *
 * `menor-melhor` é o tempo de primeira resposta, e é a razão desta prop existir:
 * o padrão de qualquer dashboard é "subiu, verde", e sem declarar a direção o
 * selo ficaria VERDE num atendimento que ficou mais lento.
 */
export type Direcao = "maior-melhor" | "menor-melhor" | "neutra";

export type Tom = "bom" | "ruim" | "neutro";

export type Delta =
  /** Tem comparação honesta: mostra o selo. */
  | { tipo: "selo"; texto: string; tom: Tom; subiu: boolean }
  /** Não tem base para comparar: mostra uma frase, nunca um número. */
  | { tipo: "sem-base"; texto: string };

/**
 * Piso de base para a variação sair em PORCENTAGEM. Abaixo dele ela sai em valor
 * absoluto: de 2 para 4 é "+100%", o que não significa nada para um dentista e
 * ainda parece manipulação quando ele faz a conta na mão.
 */
export const PISO_PERCENTUAL = 10;

export function calcularDelta(input: {
  atual: number;
  /** `null` = não existe período anterior medido (conta nova, dado truncado). */
  anterior: number | null;
  direcao: Direcao;
  /** Texto do "sem base". Ex.: "primeira semana medida". */
  semBase?: string;
}): Delta {
  const { atual, anterior, direcao } = input;
  const semBase = input.semBase ?? "sem período anterior para comparar";

  // Sem período anterior, ou período anterior vazio: não há de onde tirar
  // variação. Zero como base daria divisão por zero ou um "+100%" sem sentido.
  if (anterior == null || anterior === 0)
    return { tipo: "sem-base", texto: semBase };

  const diff = atual - anterior;
  if (diff === 0)
    return { tipo: "selo", texto: "igual", tom: "neutro", subiu: false };

  const subiu = diff > 0;
  const melhorou =
    direcao === "neutra" ? null : direcao === "maior-melhor" ? subiu : !subiu;
  const tom: Tom = melhorou == null ? "neutro" : melhorou ? "bom" : "ruim";

  // Base pequena: valor absoluto em vez de porcentagem.
  if (anterior < PISO_PERCENTUAL) {
    return { tipo: "selo", texto: `${subiu ? "+" : ""}${diff}`, tom, subiu };
  }

  const pct = Math.round((diff / anterior) * 100);
  // Arredondamento pode zerar uma diferença real (de 201 para 202 dá 0%), e
  // "0%" com seta seria pior que o absoluto.
  if (pct === 0) {
    return { tipo: "selo", texto: `${subiu ? "+" : ""}${diff}`, tom, subiu };
  }

  return { tipo: "selo", texto: `${pct > 0 ? "+" : ""}${pct}%`, tom, subiu };
}

/**
 * Delta de duração. Sai em segundos ou minutos, NUNCA em porcentagem: "23% mais
 * rápido" é mais difícil de conferir que "12s mais rápido".
 */
export function deltaDuracao(input: {
  atualMs: number | null;
  anteriorMs: number | null;
  semBase?: string;
}): Delta {
  const { atualMs, anteriorMs } = input;
  const semBase = input.semBase ?? "sem período anterior para comparar";
  if (atualMs == null || anteriorMs == null)
    return { tipo: "sem-base", texto: semBase };

  const diff = atualMs - anteriorMs;
  const abs = Math.abs(diff);
  // Menos de 1s de diferença não é notícia, é ruído de medição.
  if (abs < 1000)
    return { tipo: "selo", texto: "igual", tom: "neutro", subiu: false };

  const s = Math.round(abs / 1000);
  const legivel = s < 60 ? `${s}s` : `${Math.round(s / 60)}min`;
  const subiu = diff > 0;
  return {
    tipo: "selo",
    // Sem sinal: "12s mais rápido" se lê sem precisar decodificar "+" ou "-".
    texto: subiu ? `${legivel} mais lento` : `${legivel} mais rápido`,
    tom: subiu ? "ruim" : "bom",
    subiu,
  };
}
