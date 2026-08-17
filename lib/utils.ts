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
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: ["display", "titulo", "corpo", "apoio", "legenda", "rotulo"],
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
