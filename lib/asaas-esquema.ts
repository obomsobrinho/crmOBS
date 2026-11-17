import { z } from "zod";

/**
 * O corpo do webhook do Asaas (docs/plano-dados-e-estado.md, 2.9), em MODO SOMBRA:
 * a rota confere e registra a diferença, sem recusar. Tolerante a campo extra
 * (o Asaas manda muito mais do que o app lê). Depois de uma semana sem diferença
 * no log, a rota passa a recusar (passo 3a do plano).
 */
export const esquemaDoEventoAsaas = z.looseObject({
  id: z.string().min(1),
  event: z.string().min(1),
  payment: z
    .looseObject({
      id: z.string().optional(),
      status: z.string().optional(),
      value: z.number().optional(),
      subscription: z.string().nullable().optional(),
      customer: z.string().nullable().optional(),
      externalReference: z.string().nullable().optional(),
    })
    .optional(),
});
