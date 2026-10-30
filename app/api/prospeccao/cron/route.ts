import { NextResponse } from "next/server";
import { tickProspeccao } from "@/lib/prospeccao-cron";
import { segredoConfere } from "@/lib/segredo";

export const maxDuration = 120;

export async function GET(req: Request) {
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!segredoConfere(recebido, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  try {
    const resumo = await tickProspeccao(Date.now());
    return NextResponse.json({ ok: true, ...resumo });
  } catch (e) {
    console.error("prospeccao cron:", e);
    return NextResponse.json({ error: "falha no cron de prospecção" }, { status: 500 });
  }
}
