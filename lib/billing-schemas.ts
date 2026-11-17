import { z } from "zod";
import type { PlanKey } from "./billing";
import { campo, corpoJson } from "./esquema";

// OS CORPOS DE `POST` E `DELETE /api/billing/subscribe` (docs/plano-dados-e-estado.md, 2.9;
// varredura do passo 5). Cobrança custa dinheiro se quebrar: o esquema decide só o que a
// rota decidia ANTES de qualquer leitura (o JSON e o plano), com as mesmas frases; CPF ou
// CNPJ, nome e e-mail continuam conferidos no handler, depois de ler a conta, na mesma
// ordem. A Assinatura ainda não mudou para `features/`, então o esquema mora ao lado de
// `lib/billing.ts`.

export const corpoDaAssinatura = corpoJson(
  {
    plan: z
      .unknown()
      .refine((v): v is PlanKey => v === "essencial" || v === "profissional" || v === "avancado", "plano inválido"),
    cpfCnpj: campo<string>(),
    name: campo<string>(),
    email: campo<string>(),
  },
  "JSON inválido",
).transform((c) => ({ ...c, plan: c.plan as PlanKey }));

/**
 * O cancelamento: o motivo é opcional, e cancelar nunca depende dele. Corpo ausente, torto
 * ou sem texto vale motivo vazio, como antes (o `try` engolia tudo).
 */
export const corpoDoCancelamento = z.preprocess(
  (v) => (v !== null && typeof v === "object" && !Array.isArray(v) ? v : {}),
  z.looseObject({
    motivo: z
      .unknown()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim().slice(0, 500) : "")),
  }),
);
