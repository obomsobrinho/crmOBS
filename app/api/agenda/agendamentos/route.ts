import { NextResponse } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { conflita } from "@/lib/agenda";
import { jidDoNumero, normalizarNumero } from "@/lib/avisos";
import { agendaDoTenant, marcarAgendamento, moverParaAgendado, ocupadosDoTenant } from "@/lib/agenda-servidor";

// O TIME marca um horário pela tela `/agenda` (docs/plano-agenda.md). Qualquer
// membro. Fora do expediente e sem limite de dias (decisão do dono): a rota não
// barra. Sobreposição com outro agendamento ou com um bloqueio: 409.
// O tenant vem SEMPRE da sessão, nunca do corpo.
export async function POST(req: Request) {
  const r = await sessaoDaRota({ ativa: true });
  if ("erro" in r) return r.erro;
  const mine = r.mine;

  let body: { phone?: unknown; nome?: unknown; servicoId?: unknown; inicio?: unknown; resumo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const bruto = typeof body.phone === "string" ? body.phone.trim() : "";
  const digitos = bruto.includes("@") ? bruto.replace(/@.*$/, "").replace(/\D/g, "") : normalizarNumero(bruto) ?? "";
  const nome = typeof body.nome === "string" && body.nome.trim() ? body.nome.trim().slice(0, 80) : null;
  const resumo = typeof body.resumo === "string" ? body.resumo.trim().slice(0, 500) : "";
  const servicoId = typeof body.servicoId === "number" ? body.servicoId : NaN;
  const inicio = typeof body.inicio === "string" ? Date.parse(body.inicio) : NaN;
  if (digitos.length < 10 || digitos.length > 15) {
    return NextResponse.json({ error: "telefone inválido" }, { status: 400 });
  }
  if (!Number.isInteger(servicoId) || !Number.isFinite(inicio)) {
    return NextResponse.json({ error: "serviço e horário são obrigatórios" }, { status: 400 });
  }

  const svc = createServiceClient();
  // O telefone EXATAMENTE como o contato está gravado (dados_cliente.telefone:
  // quase sempre o JID "5511...@s.whatsapp.net", às vezes só dígitos), para
  // casar com a conversa, a ficha e o turno da IA. Número novo, digitado à mão:
  // o formato do WhatsApp (`normalizarNumero` + `jidDoNumero`, lib/avisos.ts).
  const [agenda, { data: gravado }] = await Promise.all([
    agendaDoTenant(svc, mine.id),
    svc.from("dados_cliente").select("telefone").eq("client_id", mine.id).eq("telefone", bruto).maybeSingle(),
  ]);
  const phone = gravado ? gravado.telefone : bruto.includes("@") ? bruto : jidDoNumero(digitos);
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
    resumo,
  });
  if (!res.ok) {
    return res.motivo === "conflito"
      ? NextResponse.json({ error: "esse horário já está ocupado" }, { status: 409 })
      : NextResponse.json({ error: "não foi possível marcar" }, { status: 500 });
  }
  // Marcar move o contato para a coluna "Agendado" (quando ela existe).
  await moverParaAgendado(svc, mine.id, phone);
  return NextResponse.json({ ok: true, id: res.id });
}
