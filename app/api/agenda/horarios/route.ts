import { NextResponse } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { horariosLivres } from "@/lib/agenda";
import { agendaDoTenant, ocupadosDoTenant } from "@/lib/agenda-servidor";
import { horarioCadastrado } from "@/lib/horarios";
import { inicioDoDiaSP } from "@/lib/fuso";

// Horários livres de UM dia para UM serviço, para o time marcar ou remarcar
// pela tela. Mesma regra da IA (`horariosLivres`), sem a antecedência mínima
// (quem marca é uma pessoa). `?servico=<id>&dia=AAAA-MM-DD[&ignorar=<id>]`.
export async function GET(req: Request) {
  const r = await sessaoDaRota();
  if ("erro" in r) return r.erro;
  const mine = r.mine;
  const url = new URL(req.url);
  const servicoId = Number(url.searchParams.get("servico"));
  const dia = url.searchParams.get("dia") ?? "";
  const ignorar = Number(url.searchParams.get("ignorar")) || undefined;
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
  const hours = horarioCadastrado(c?.agent_config ?? null);
  if (!hours) return NextResponse.json({ inicios: [], semHorario: true });
  const de = inicioDoDiaSP(dia);
  const ocupados = await ocupadosDoTenant(svc, mine.id, de, de + 2 * 86_400_000, ignorar);
  if (!ocupados) return NextResponse.json({ error: "agenda indisponível" }, { status: 503 });
  const dias = horariosLivres({
    agora: Date.now(),
    hours,
    ocupados,
    config: agenda.config,
    duracaoMin: servico.duracaoMin,
    deDia: dia,
    semAntecedencia: true,
  });
  return NextResponse.json({ inicios: (dias[0]?.inicios ?? []).map((t) => new Date(t).toISOString()) });
}
