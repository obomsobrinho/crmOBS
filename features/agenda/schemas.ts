import { z } from "zod";

// OS ESQUEMAS DE ENTRADA DA AGENDA (docs/plano-dados-e-estado.md, 2.9).

/**
 * A query do cron de lembretes (`GET /api/agenda/lembretes`): o Vercel Cron chama sem
 * nada, e a própria rota se chama de novo com `?continuacao=1` quando o lote não coube
 * (o endereço é montado na rota, então este é o formato real, não um palpite). Em MODO
 * SOMBRA: confere e registra, nunca recusa (passar a recusar é decisão do dono depois de
 * uma semana sem diferença).
 */
export const consultaDoCronDeLembretes = z.object({ continuacao: z.literal("1").optional() }).strict();
