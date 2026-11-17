import { z } from "zod";
import { campo, corpoJson } from "@/lib/esquema";

// OS ESQUEMAS DE ENTRADA DA AGENDA (docs/plano-dados-e-estado.md, 2.9).

/**
 * A query do cron de lembretes (`GET /api/agenda/lembretes`): o Vercel Cron chama sem
 * nada, e a própria rota se chama de novo com `?continuacao=1` quando o lote não coube
 * (o endereço é montado na rota, então este é o formato real, não um palpite). Em MODO
 * SOMBRA: confere e registra, nunca recusa (passar a recusar é decisão do dono depois de
 * uma semana sem diferença).
 */
export const consultaDoCronDeLembretes = z.object({ continuacao: z.literal("1").optional() }).strict();

// As rotas da agenda que a tela chama (varredura do passo 5): o esquema decide o JSON e
// entrega os campos como vieram; serviço, horário, conflito e permissão continuam no
// handler, com as frases de antes (a conferência depende do banco e da ordem dele).

/** `POST /api/agenda/agendamentos`. */
export const corpoDoAgendamento = corpoJson(
  { phone: campo<unknown>(), nome: campo<unknown>(), servicoId: campo<unknown>(), inicio: campo<unknown>(), resumo: campo<unknown>() },
  "JSON inválido",
);

/** `PATCH /api/agenda/agendamentos/[id]`. */
export const corpoDaMudancaDoAgendamento = corpoJson({ acao: campo<unknown>(), inicio: campo<unknown>() }, "JSON inválido");

/** `POST /api/agenda/bloqueios`. */
export const corpoDoBloqueio = corpoJson({ inicio: campo<unknown>(), fim: campo<unknown>(), motivo: campo<unknown>() }, "JSON inválido");

/** `DELETE /api/agenda/bloqueios?id=`: o id é conferido no handler ("id inválido"). */
export const consultaDoBloqueio = z.object({ id: z.string().optional() });

/** `PUT /api/agenda/config`. */
export const corpoDaConfigDaAgenda = corpoJson({ config: campo<unknown>(), servicos: campo<unknown>() }, "JSON inválido");

/** `GET /api/agenda/horarios?servico=&dia=&ignorar=&fora=`: conferidos no handler. */
export const consultaDosHorarios = z.object({
  servico: z.string().optional(),
  dia: z.string().optional(),
  ignorar: z.string().optional(),
  fora: z.string().optional(),
});
