import { NextResponse } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { conflita } from "@/lib/agenda";
import { agendaDoTenant, marcarAgendamento, ocupadosDoTenant } from "@/lib/agenda-servidor";

// O TIME marca um horário pela tela `/agenda` (docs/plano-agenda.md). Qualquer
// membro (D14). Fora do expediente é permitido (D15): a tela avisa, a rota não
// barra. Sobreposição com outro agendamento ou com um bloqueio: 409.
// O tenant vem SEMPRE da sessão, nunca do corpo.
export async function POST(req: Request) {
  const r = await sessaoDaRota({ ativa: true });
  if ("erro" in r) return r.erro;
  const mine = r.mine;

  let body: { phone?: unknown; nome?: unknown; servicoId?: unknown; inicio?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const nome = typeof body.nome === "string" && body.nome.trim() ? body.nome.trim().slice(0, 80) : null;
  const servicoId = typeof body.servicoId === "number" ? body.servicoId : NaN;
  const inicio = typeof body.inicio === "string" ? Date.parse(body.inicio) : NaN;
  if (phone.length < 10 || phone.length > 15) {
    return NextResponse.json({ error: "telefone inválido" }, { status: 400 });
  }
  if (!Number.isInteger(servicoId) || !Number.isFinite(inicio)) {
    return NextResponse.json({ error: "serviço e horário são obrigatórios" }, { status: 400 });
  }

  const svc = createServiceClient();
  const agenda = await agendaDoTenant(svc, mine.id);
  if (!agenda) return NextResponse.json({ error: "agenda indisponível" }, { status: 503 });
  const servico = agenda.servicos.find((s) => s.id === servicoId);
  if (!servico) return NextResponse.json({ error: "serviço não encontrado" }, { status: 400 });
  const fim = inicio + servico.duracaoMin * 60_000;

  const ocupados = await ocupadosDoTenant(svc, mine.id, inicio, fim);
  if (!ocupados) return NextResponse.json({ error: "agenda indisponível" }, { status: 503 });
  if (conflita(inicio, fim, ocupados)) {
    return NextResponse.json({ error: "esse horário já está ocupado" }, { status: 409 });
  }
  const res = await marcarAgendamento(svc, {
    clientId: mine.id,
    phone,
    nome,
    servicoId: servico.id,
    servicoNome: servico.nome,
    inicio,
    fim,
    origem: "time",
    criadoPor: mine.userId,
  });
  if (!res.ok) {
    return res.motivo === "conflito"
      ? NextResponse.json({ error: "esse horário já está ocupado" }, { status: 409 })
      : NextResponse.json({ error: "não foi possível marcar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: res.id });
}
