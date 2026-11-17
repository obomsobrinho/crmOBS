import { NextResponse } from "next/server";
import { lerConsulta, sessaoDaRota } from "@/lib/rota";
import { consultaDosHorarios } from "@/features/agenda/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { horarioDaAgenda, horariosDoTime } from "@/lib/agenda";
import { agendaDoTenant, ocupadosDoTenant } from "@/lib/agenda-servidor";
import { horarioCadastrado } from "@/lib/horarios";
import { DEFAULT_HOURS } from "@/lib/agent-prompt";
import { inicioDoDiaSP } from "@/lib/fuso";

// Horários livres de UM dia para UM serviço, para o time marcar ou remarcar
// pela tela. Mesma grade da IA (`horariosDoTime`), sem a antecedência mínima
// (quem marca é uma pessoa), sem limite de dias e, com `fora=1`, fora do
// expediente (decisão do dono, 28/10/2026).
// `?servico=<id>&dia=AAAA-MM-DD[&ignorar=<id>][&fora=1]`.
// Só para "fora do expediente" quando não há horário cadastrado: o dia inteiro.
const HORAS_VAZIAS = DEFAULT_HOURS;

export async function GET(req: Request) {
  const r = await sessaoDaRota();
  if ("erro" in r) return r.erro;
  const mine = r.mine;
  // A consulta cruza o esquema (`features/agenda/schemas.ts`); os valores são conferidos abaixo, como antes.
  const lido = lerConsulta(req, consultaDosHorarios);
  if ("erro" in lido) return lido.erro;
  const q = lido.dados;
  const servicoId = Number(q.servico ?? null);
  const dia = q.dia ?? "";
  const ignorar = Number(q.ignorar ?? null) || undefined;
  const fora = q.fora === "1";
  if (!Number.isInteger(servicoId) || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return NextResponse.json({ error: "serviço e dia são obrigatórios" }, { status: 400 });
  }
  const svc = createServiceClient();
  const [agenda, { data: c }] = await Promise.all([
    agendaDoTenant(svc, mine.id),
    svc.from("clients").select("agent_config").eq("id", mine.id).maybeSingle(),
  ]);
  if (!agenda) return NextResponse.json({ error: "agenda indisponível" }, { status: 503 });
  const servico = agenda.servicos.find((s) => s.id === servicoId);
  if (!servico) return NextResponse.json({ error: "serviço não encontrado" }, { status: 400 });
  // O horário PRÓPRIO da agenda (ou a cópia do de atendimento, se nunca salvo).
  const hours = horarioDaAgenda(agenda.config, horarioCadastrado(c?.agent_config ?? null));
  // Sem horário cadastrado o time ainda marca, no dia inteiro.
  const semHorario = !hours;
  const de = inicioDoDiaSP(dia);
  const ocupados = await ocupadosDoTenant(svc, mine.id, de, de + 2 * 86_400_000, ignorar);
  if (!ocupados) return NextResponse.json({ error: "agenda indisponível" }, { status: 503 });
  const inicios = horariosDoTime({
    agora: Date.now(),
    dia,
    hours: hours ?? HORAS_VAZIAS,
    ocupados,
    config: agenda.config,
    duracaoMin: servico.duracaoMin,
    foraDoExpediente: fora || semHorario,
  });
  return NextResponse.json({ inicios: inicios.map((t) => new Date(t).toISOString()) });
}
