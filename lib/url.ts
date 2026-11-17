import { createParser, parseAsString, parseAsStringLiteral } from "nuqs";

/**
 * Os leitores de parâmetro de URL que mais de uma área usa (D3, docs/plano-dados-e-estado.md
 * 2.8). Valor inválido na URL cai no padrão: um endereço editado à mão nunca quebra
 * a tela. Sem Zod aqui (decisão de 11/11/2026): o nuqs já faz isso, e o Zod
 * entraria no JS de toda rota sem ganho.
 *
 * Toda tela usa o modo RASO (o padrão do nuqs): trocar filtro não vai ao servidor.
 * Abrir uma lista ou um item cria entrada no histórico (`history: "push"`); digitar
 * filtro ou busca substitui (o padrão, `replace`), com o mesmo atraso da busca.
 */

/** Página da lista, de 1 em diante. */
export const parametroDePagina = createParser({
  parse: (v: string) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 ? n : null;
  },
  serialize: (n: number) => String(n),
}).withDefault(1);

/** Texto da busca. Vazio é o padrão (some da URL). */
export const parametroDeBusca = parseAsString.withDefault("");

/** Uma aba entre as possíveis da tela; outra coisa na URL cai na primeira. */
export function parametroDeAba<const T extends readonly string[]>(abas: T) {
  return parseAsStringLiteral(abas).withDefault(abas[0]);
}
