// A PALETA ÚNICA DE RÓTULOS: cor de tag e cor de estágio do funil (02/10/2026,
// auditoria F11, R-48).
//
// Antes havia DUAS paletas fixas em hexadecimal (`STAGE_COLORS` em
// lib/pipeline.ts e `TAG_COLORS` em lib/crm.ts) que discordavam sobre a mesma
// chave (`green` era turquesa no funil e verde na tag), não tinham valor para o
// tema escuro e, na das tags, incluíam verde, âmbar e vermelho, que o sistema
// reserva para ESTADO: uma tag vermelha lia como erro.
//
// Agora são OITO matizes, nenhum deles verde, âmbar ou vermelho, com os papéis
// da casa (`fill`, `on`, `ink`, `surface`) como variáveis em `app/globals.css`,
// uma por tema. Módulo PURO: só chave para nome de variável CSS.
//
// O BANCO NÃO MUDA. `tags.color` e `pipeline_stages.color` guardam a chave que
// cada um escolheu um dia (`green`, `amber`, `red`, `purple`, `orange`...). A
// tradução para o matiz permitido mais próximo acontece só na hora de
// DESENHAR (`chaveDoRotulo`), e um valor que ninguém conhece vira o neutro.
// Escolher uma cor de novo grava uma das oito chaves de `ROTULO_CHAVES`.

/** Os matizes que a pessoa pode escolher, na ordem em que o seletor mostra. */
export const ROTULO_CHAVES = [
  "gray",
  "blue",
  "cyan",
  "indigo",
  "violet",
  "fuchsia",
  "pink",
  "stone",
] as const;

export type ChaveDoRotulo = (typeof ROTULO_CHAVES)[number];

/** O neutro: o que sobra quando a chave guardada não é conhecida. */
export const ROTULO_NEUTRO: ChaveDoRotulo = "gray";

/**
 * As chaves que já existem gravadas, mapeadas para o matiz permitido mais
 * próximo. Verde vira ciano (o único frio perto dele), âmbar e laranja viram o
 * pedra (o único quente), vermelho vira rosa, roxo vira violeta.
 */
const LEGADO: Record<string, ChaveDoRotulo> = {
  purple: "violet",
  green: "cyan",
  teal: "cyan",
  amber: "stone",
  orange: "stone",
  red: "pink",
};

/** A chave que vale para desenhar: a própria, a traduzida ou o neutro. */
export function chaveDoRotulo(guardada: string | null | undefined): ChaveDoRotulo {
  if (!guardada) return ROTULO_NEUTRO;
  if ((ROTULO_CHAVES as readonly string[]).includes(guardada)) {
    return guardada as ChaveDoRotulo;
  }
  return LEGADO[guardada] ?? ROTULO_NEUTRO;
}

export interface CoresDoRotulo {
  chave: ChaveDoRotulo;
  /** Bolinha e amostra. */
  fill: string;
  /** Tinta sobre o `fill`. */
  on: string;
  /** O matiz como texto ou ícone. */
  ink: string;
  /** Fundo tingido. */
  surface: string;
}

/** Os quatro papéis do matiz, como `var(--rotulo-...)` (viram sozinhos por tema). */
export function coresDoRotulo(guardada: string | null | undefined): CoresDoRotulo {
  const chave = chaveDoRotulo(guardada);
  const v = (papel: string) => `var(--rotulo-${chave}-${papel})`;
  return {
    chave,
    fill: v("fill"),
    on: v("on"),
    ink: v("ink"),
    surface: v("surface"),
  };
}

/** Só o `fill`: o que as bolinhas e as amostras pedem. */
export function fillDoRotulo(guardada: string | null | undefined): string {
  return coresDoRotulo(guardada).fill;
}
