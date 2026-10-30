import { NextResponse } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";

// Bloquear um trecho da agenda (almoço, folga, compromisso fora do sistema).
// Qualquer membro (D14). Não desmarca o que já existe no trecho: a tela avisa.
export async function POST(req: Request) {
  const r = await sessaoDaRota({ ativa: true });
  if ("erro" in r) return r.erro;
  const mine = r.mine;
  let body: { inicio?: unknown; fim?: unknown; motivo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const inicio = typeof body.inicio === "string" ? Date.parse(body.inicio) : NaN;
  const fim = typeof body.fim === "string" ? Date.parse(body.fim) : NaN;
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) {
    return NextResponse.json({ error: "início e fim válidos, com o fim depois do início" }, { status: 400 });
  }
  if (fim - inicio > 62 * 86_400_000) {
    return NextResponse.json({ error: "bloqueio de no máximo 62 dias" }, { status: 400 });
  }
  const motivo = typeof body.motivo === "string" && body.motivo.trim() ? body.motivo.trim().slice(0, 120) : null;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("agenda_bloqueios")
    .insert({
      client_id: mine.id,
      inicio: new Date(inicio).toISOString(),
      fim: new Date(fim).toISOString(),
      motivo,
      criado_por: mine.userId,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "não foi possível bloquear" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request) {
  const r = await sessaoDaRota({ ativa: true });
  if ("erro" in r) return r.erro;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const svc = createServiceClient();
  const { error } = await svc.from("agenda_bloqueios").delete().eq("id", id).eq("client_id", r.mine.id);
  if (error) return NextResponse.json({ error: "não foi possível desbloquear" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
