import { NextResponse } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { conflita, momentoDoLembrete } from "@/lib/agenda";
import { horarioCadastrado } from "@/lib/horarios";
import {
  agendaDoTenant,
  cancelarAgendamento,
  ocupadosDoTenant,
  remarcarAgendamento,
} from "@/lib/agenda-servidor";

// Cancelar ou remarcar UM agendamento pela tela (qualquer membro, D14).
// `{ acao: "cancelar" }` ou `{ acao: "remarcar", inicio }`. O contato não é
// avisado automaticamente (a tela diz isso). 409 quando o novo horário bate.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await sessaoDaRota({ ativa: true });
  if ("erro" in r) return r.erro;
  const mine = r.mine;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }
  let body: { acao?: unknown; inicio?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const svc = createServiceClient();

  if (body.acao === "cancelar") {
    const ok = await cancelarAgendamento(svc, mine.id, id, "time");
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "agendamento não encontrado ou já cancelado" }, { status: 404 });
  }

  if (body.acao === "remarcar") {
    const inicio = typeof body.inicio === "string" ? Date.parse(body.inicio) : NaN;
    if (!Number.isFinite(inicio)) {
      return NextResponse.json({ error: "novo horário é obrigatório" }, { status: 400 });
    }
    const { data: atual } = await svc
      .from("agendamentos")
      .select("servico_id, servico_nome, inicio, fim")
      .eq("id", id)
      .eq("client_id", mine.id)
      .eq("status", "confirmado")
      .maybeSingle();
    if (!atual) {
      return NextResponse.json({ error: "agendamento não encontrado ou já cancelado" }, { status: 404 });
    }
    // A duração segue a do serviço quando ele ainda existe; senão, a de antes.
    const [agenda, { data: c }] = await Promise.all([
      agendaDoTenant(svc, mine.id),
      svc.from("clients").select("agent_config").eq("id", mine.id).maybeSingle(),
    ]);
    const hours = horarioCadastrado(c?.agent_config ?? null);
    const servico = agenda?.servicos.find((s) => s.id === atual.servico_id);
    const duracao = servico ? servico.duracaoMin * 60_000 : Date.parse(atual.fim) - Date.parse(atual.inicio);
    const fim = inicio + duracao;
    const ocupados = await ocupadosDoTenant(svc, mine.id, inicio, fim, id);
    if (!ocupados) return NextResponse.json({ error: "agenda indisponível" }, { status: 503 });
    if (conflita(inicio, fim, ocupados)) {
      return NextResponse.json({ error: "esse horário já está ocupado" }, { status: 409 });
    }
    const res = await remarcarAgendamento(svc, {
      clientId: mine.id,
      id,
      inicio,
      fim,
      servicoId: atual.servico_id,
      servicoNome: atual.servico_nome,
      origem: "time",
      criadoPor: mine.userId,
      por: "time",
      lembreteEm: agenda?.config.lembrete && hours ? momentoDoLembrete({ inicio, marcadoEm: Date.now(), hours }) : null,
    });
    if (!res.ok) {
      return res.motivo === "conflito"
        ? NextResponse.json({ error: "esse horário já está ocupado" }, { status: 409 })
        : NextResponse.json({ error: "não foi possível remarcar" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: res.id });
  }

  return NextResponse.json({ error: "ação inválida" }, { status: 400 });
}
