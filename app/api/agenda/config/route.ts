import { NextResponse } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { DURACAO_MAX, DURACAO_MIN, normalizarConfigDaAgenda } from "@/lib/agenda";
import { horarioCadastrado } from "@/lib/horarios";
import { paraJson } from "@/lib/json";

// Configuração da agenda: regras (`clients.agenda_config`), serviços e a coluna
// "Agendado" do funil (`agenda_etapa_do_funil`). Só o
// DONO (D14). Serviço que sai da lista vira `ativo = false` (nunca apagado:
// agendamentos antigos apontam para ele e guardam o nome).
export async function PUT(req: Request) {
  const r = await sessaoDaRota({ dono: "só o dono configura a agenda", ativa: true, revalidar: true });
  if ("erro" in r) return r.erro;
  const mine = r.mine;

  let body: { config?: unknown; servicos?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const config = normalizarConfigDaAgenda(body.config);
  const lista = Array.isArray(body.servicos) ? body.servicos.slice(0, 20) : [];
  const servicos: { id: number | null; nome: string; duracaoMin: number }[] = [];
  for (const s of lista as { id?: unknown; nome?: unknown; duracaoMin?: unknown }[]) {
    const nome = typeof s?.nome === "string" ? s.nome.trim().slice(0, 80) : "";
    const dur = typeof s?.duracaoMin === "number" ? s.duracaoMin : NaN;
    if (!nome || !Number.isInteger(dur) || dur < DURACAO_MIN || dur > DURACAO_MAX) {
      return NextResponse.json({ error: "cada serviço precisa de nome e duração válida" }, { status: 400 });
    }
    servicos.push({ id: typeof s.id === "number" ? s.id : null, nome, duracaoMin: dur });
  }
  if (config.ativa && servicos.length === 0) {
    return NextResponse.json({ error: "cadastre pelo menos um serviço para ligar a agenda" }, { status: 400 });
  }

  const svc = createServiceClient();
  // Primeira ativação sem horário próprio: vem a CÓPIA do horário de atendimento
  // (decisão do dono, 28/10/2026). Depois disso, os dois andam separados.
  if (config.ativa && !config.horario) {
    const { data: c } = await svc.from("clients").select("agent_config").eq("id", mine.id).maybeSingle();
    config.horario = horarioCadastrado(c?.agent_config ?? null);
  }
  const { data: atuais, error: lErr } = await svc
    .from("agenda_servicos")
    .select("id")
    .eq("client_id", mine.id)
    .eq("ativo", true);
  if (lErr) return NextResponse.json({ error: "agenda indisponível" }, { status: 503 });

  const manter = new Set(servicos.filter((s) => s.id !== null).map((s) => s.id));
  const sair = (atuais ?? []).map((a) => a.id).filter((id) => !manter.has(id));
  const erros: string[] = [];
  if (sair.length > 0) {
    const { error } = await svc.from("agenda_servicos").update({ ativo: false }).eq("client_id", mine.id).in("id", sair);
    if (error) erros.push(error.message);
  }
  for (const [ordem, s] of servicos.entries()) {
    const { error } = s.id
      ? await svc
          .from("agenda_servicos")
          .update({ nome: s.nome, duracao_min: s.duracaoMin, ordem, ativo: true })
          .eq("id", s.id)
          .eq("client_id", mine.id)
      : await svc
          .from("agenda_servicos")
          .insert({ client_id: mine.id, nome: s.nome, duracao_min: s.duracaoMin, ordem });
    if (error) erros.push(error.message);
  }
  const { error: cErr } = await svc.from("clients").update({ agenda_config: paraJson(config) }).eq("id", mine.id);
  if (cErr) erros.push(cErr.message);
  // A coluna "Agendado" do funil existe só com a agenda ligada (decisão do dono).
  const { error: eErr } = await svc.rpc("agenda_etapa_do_funil", { p_client: mine.id, p_ativa: config.ativa });
  if (eErr) erros.push(eErr.message);
  if (erros.length > 0) {
    console.error("falha ao salvar a agenda:", erros.join("; "));
    return NextResponse.json({ error: "não foi possível salvar tudo" }, { status: 500 });
  }

  const { data: salvos } = await svc
    .from("agenda_servicos")
    .select("id, nome, duracao_min")
    .eq("client_id", mine.id)
    .eq("ativo", true)
    .order("ordem")
    .order("id");
  return NextResponse.json({
    ok: true,
    config,
    servicos: (salvos ?? []).map((s) => ({ id: s.id, nome: s.nome, duracaoMin: s.duracao_min })),
  });
}
