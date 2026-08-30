import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * O `tailwind-merge` precisa ser ENSINADO sobre a nossa escala tipográfica.
 *
 * Por padrão ele resolve `text-*` assim: se o valor for um tamanho conhecido
 * (xs, sm, lg...), é fonte; senão, é cor. Como `corpo`, `apoio` e `legenda` não
 * são tamanhos que ele conhece, ele os classificava como COR, entrava em
 * conflito com `text-ink-2` e descartava a cor silenciosamente. O sintoma era
 * um botão nascer com a tinta errada sem ninguém ter escrito isso em lugar
 * nenhum.
 *
 * Registrando os seis papéis no grupo de tamanho de fonte, `text-corpo` e
 * `text-ink-2` voltam a poder conviver, que é o esperado: um é tamanho, o
 * outro é cor.
 *
 * `numero` entra na mesma lista pelo mesmo motivo, e não é opcional: sem ele o
 * `text-numero` do `StatValor` seria classificado como COR e descartaria
 * `text-brand-ink` em silêncio, que é exatamente o sintoma descrito acima.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "titulo",
            "corpo",
            "apoio",
            "legenda",
            "rotulo",
            "numero",
            // ⚠️ Os dois degraus de numeral da rodada 3 (68 e 44) entram AQUI,
            // e esquecer isso repetiria o bug descrito acima: `text-manchete`
            // seria classificado como COR, entraria em conflito com
            // `text-brand-ink` no `StatValor` da manchete e descartaria a cor
            // em silêncio.
            "manchete",
            "destaque",
            // Título de cartão (16/22), pelo mesmo motivo dos dois acima.
            //
            // ⚠️ Chama-se `cartao` e NÃO `bloco`: já existe `--color-bloco`, e
            // com os dois nomes iguais o Tailwind resolvia `text-bloco` como
            // COR (a regra emitida era `color: var(--s-bloco)`), então o título
            // nascia sem os 16px e sem o peso 600. Nome de papel tipográfico
            // não pode repetir nome de cor.
            "cartao",
          ],
        },
      ],
    },
  },
});

/**
 * Junta classes e resolve conflito de Tailwind, com a ÚLTIMA ganhando.
 *
 * É o que permite `<Button className="mt-2 w-full">`: a base escreve o padrão
 * da casa e quem usa sobrescreve só o que precisa, sem duplicar declaração nem
 * depender da ordem em que o CSS foi gerado.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
