import { z } from "zod";

// PEÇAS DOS ESQUEMAS DAS ROTAS (docs/plano-dados-e-estado.md, 2.9, varredura do passo 5).
// Cada rota que já existia passou a ler o corpo por um esquema que aceita EXATAMENTE o que
// ela aceitava e devolve as MESMAS frases (as rotas leem com `motivo: true`, então a
// mensagem do primeiro problema é a frase da tela). Os esquemas de cada área moram ao lado
// dela (`features/<área>/schemas.ts`, ou `lib/<área>-schemas.ts` até a área mudar de pasta);
// aqui ficam só as peças repetidas.
//
// A conferência que depende do banco, da Evolution ou da ordem do handler (um grupo da
// lista, a etapa da montagem) continua no handler, na mesma ordem: o esquema tem só o que
// dá para decidir sem I/O e antes de tudo, e o resto passa como veio (`campo`).

/**
 * O corpo JSON de uma rota que respondia `fraseSemJson` quando `req.json()` falhava.
 * `lerCorpo` com `motivo` entrega `null` nesse caso, e o `null` JSON também cai aqui
 * (antes ele derrubava a rota com 500 ao ler um campo). Um valor que não é objeto (um
 * número, um texto, uma lista) segue como `{}`: antes ele passava do `try` e cada campo
 * dizia o seu motivo, e continua assim. Chave a mais passa como veio (o handler é que
 * decide o que lê, como antes).
 */
export function corpoJson<S extends z.ZodRawShape>(forma: S, fraseSemJson: string) {
  return z.preprocess(
    (v) => (v === null ? undefined : typeof v === "object" && !Array.isArray(v) ? v : {}),
    z.looseObject(forma, { error: fraseSemJson }),
  );
}

/**
 * Um campo que o handler confere sozinho, depois (contra o banco, a Evolution ou na ordem
 * dele): passa como veio, com o tipo que a rota já declarava para o corpo.
 */
export const campo = <T>() => z.custom<T>(() => true).optional();

/** Um campo que a rota lia com `x?.trim()`: texto aparado, ou `""` para o resto. */
export const textoAparado = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v.trim() : ""));
