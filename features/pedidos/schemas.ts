import { z } from "zod";

// OS CORPOS DAS ROTAS QUE FECHAM UM PEDIDO (docs/plano-dados-e-estado.md, 2.9):
// `POST /api/conversations/resolve` e `/orientar`, as portas de Pedidos e da caixa de
// escrita de Conversas. Cada mensagem é a frase que a rota dizia antes do esquema (as
// rotas leem com `motivo: true`); o resto do comportamento não muda.

/** Um corpo que não é objeto (JSON torto, `null`) vira `{}`: cada campo diz o seu motivo. */
const objeto = <S extends z.ZodRawShape>(forma: S) =>
  z.preprocess((v) => (v !== null && typeof v === "object" ? v : {}), z.object(forma));

/** O pedido que a tela mostrava; outra coisa que não um número vale "o mais antigo da fila", como antes. */
const pedidoId = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "number" ? v : null));

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const corpoDoResolver = objeto({
  phone: z.unknown().optional().transform(texto).refine(Boolean, "phone é obrigatório"),
  pedidoId,
});

export const corpoDoOrientar = objeto({
  phone: z.unknown().optional().transform(texto),
  instruction: z.unknown().optional().transform(texto),
  pedidoId,
}).refine((c) => c.phone !== "" && c.instruction !== "", "phone e instruction são obrigatórios");
