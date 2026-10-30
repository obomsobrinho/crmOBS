import { NextResponse } from "next/server";
import { concluirBusca } from "@/lib/campanhas-servidor";
import { fonteApify } from "@/lib/fonte-apify";
import { segredoConfere } from "@/lib/segredo";
import { createServiceClient } from "@/lib/supabase/service";

/** Apify webhook (outside /api/admin). Checked with APIFY_WEBHOOK_SECRET query param `s`. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const buscaId = url.searchParams.get("busca");
  const token = url.searchParams.get("s");
  if (!buscaId) return NextResponse.json({ error: "busca ausente" }, { status: 400 });
  if (!segredoConfere(token, process.env.APIFY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  let payload: { runId?: string; status?: string; eventType?: string };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const svc = createServiceClient();
  const { data: row } = await svc.from("prospeccao_buscas").select("termo, status, fonte_execucao_id").eq("id", buscaId).maybeSingle();
  if (!row || row.status !== "buscando") return NextResponse.json({ ok: true, ignorado: true });
  const runId = payload.runId ?? row.fonte_execucao_id;
  if (!runId) {
    await concluirBusca(svc, buscaId, null, "Execução da fonte sem identificador");
    return NextResponse.json({ ok: true });
  }
  const failed = payload.status && payload.status !== "SUCCEEDED";
  if (failed) {
    await concluirBusca(svc, buscaId, null, `A fonte terminou com status ${payload.status ?? "desconhecido"}`);
    return NextResponse.json({ ok: true });
  }
  try {
    const bruto = await fonteApify.lerDataset(runId);
    const termo = (row.termo ?? "").split(",")[0]?.trim() || "empresa";
    const itens = bruto.map((item) => fonteApify.mapearItem(item, termo));
    await concluirBusca(svc, buscaId, itens, null);
    return NextResponse.json({ ok: true, itens: itens.length });
  } catch (e) {
    console.error("apify webhook:", e);
    await concluirBusca(svc, buscaId, null, "Falha ao ler o resultado da fonte");
    return NextResponse.json({ ok: true });
  }
}
