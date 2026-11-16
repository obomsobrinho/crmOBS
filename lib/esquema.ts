import { z } from "zod";

// PEÇAS DOS ESQUEMAS DAS ROTAS (docs/plano-dados-e-estado.md, 2.9, varredura do passo 5).
// Cada rota que já existia passou a ler o corpo por um esquema que aceita EXATAMENTE o que
// ela aceitava e devolve as MESMAS frases (as rotas leem com `motivo: true`, então a
// mensagem do primeiro problema é a frase da tela). Os esquemas de cada área moram ao lado
// dela (`features/<área>/schemas.ts`, ou `lib/<área>-schemas.ts` até a área mudar de pasta);
// aqui ficam só as peças repetidas.

/**
 * O corpo JSON de uma rota que respondia `fraseSemJson` quando `req.json()` falhava.
 * `lerCorpo` com `motivo` entrega `null` nesse caso, e o `null` JSON também cai aqui
 * (antes ele derrubava a rota com 500 ao ler um campo). Um valor que não é objeto (um
 * número, um texto, uma lista) segue como `{}`: antes ele passava do `try` e cada campo
 * dizia o seu motivo, e continua assim.
 */
export function corpoJson<S extends z.ZodRawShape>(forma: S, fraseSemJson: string) {
  return z.preprocess(
    (v) => (v === null ? undefined : typeof v === "object" && !Array.isArray(v) ? v : {}),
    z.object(forma, { error: fraseSemJson }),
  );
}

/** Um campo que a rota lia com `x?.trim()`: texto aparado, ou `""` para o resto. */
export const textoAparado = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() : ""));

/** Um campo que a rota só repassava se fosse texto (`typeof x === "string"`), ou `undefined`. */
export const textoOuNada = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v : undefined));
