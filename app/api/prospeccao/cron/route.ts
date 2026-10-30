import { NextResponse } from "next/server";
import { agoraMs } from "@/lib/periodo";
import { tickProspeccao } from "@/lib/prospeccao-cron";
import { segredoConfere } from "@/lib/segredo";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

// O TICK DA PROSPECÇÃO (D3): o pg_cron do Supabase chama a cada 5 minutos com o
// `CRON_SECRET` como `Authorization: Bearer` (lido do Vault pelo job, nunca escrito
// numa migration). Fora de `/api/admin`, que responde 404 a quem não tem sessão
// de admin. O que cada execução faz está em `lib/prospeccao-cron.ts`.
export async function GET(req: Request) {
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!segredoConfere(recebido, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await tickProspeccao(createServiceClient(), agoraMs())) });
  } catch (e) {
    console.error("prospecção, cron:", e);
    return NextResponse.json({ error: "falha no cron de prospecção" }, { status: 500 });
  }
}
