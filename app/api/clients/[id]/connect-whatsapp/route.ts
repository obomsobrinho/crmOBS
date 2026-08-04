import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { buildFallbackPersona } from "@/lib/agent-prompt";
import {
  connectInstance,
  createInstance,
  extractQrBase64,
} from "@/lib/evolution";

// Cria (ou reconecta) a instância Evolution do tenant logado e devolve o QR.
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/connect-whatsapp">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });

  const webhookUrl = process.env.N8N_BOT_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_BOT_WEBHOOK_URL não configurado" },
      { status: 500 }
    );
  }

  // Reusa a instância se já existir; senão deriva um nome único do client_id.
  const instanceName = mine.evolution_instance ?? `crm_${id.replace(/-/g, "").slice(0, 12)}`;

  let qr: string | null = null;
  try {
    const createRes = await createInstance(instanceName, webhookUrl);
    if (createRes.ok) {
      qr = extractQrBase64(await createRes.json());
    } else {
      // Instância provavelmente já existe → pede um QR novo via /connect.
      const connectRes = await connectInstance(instanceName);
      if (!connectRes.ok) {
        const detail = await connectRes.text();
        return NextResponse.json(
          { error: "falha ao conectar na Evolution", detail },
          { status: 502 }
        );
      }
      qr = extractQrBase64(await connectRes.json());
    }
  } catch {
    return NextResponse.json(
      { error: "falha ao contatar a Evolution" },
      { status: 502 }
    );
  }

  // Persiste o instanceName no client (service_role: a RLS não dá update a
  // authenticated em clients). Aproveita para garantir uma persona-fallback se
  // o tenant ainda não tem nenhuma — sem ela o agente rodaria sem o contrato de
  // output e poderia disparar ramificações do n8n sem motivo.
  const svc = createServiceClient();
  const { data: cur } = await svc
    .from("clients")
    .select("persona")
    .eq("id", id)
    .maybeSingle();

  const update: Record<string, unknown> = {};
  if (mine.evolution_instance !== instanceName) {
    update.evolution_instance = instanceName;
  }
  const curPersona = (cur?.persona as string | null) ?? null;
  if (!curPersona || !curPersona.trim()) {
    update.persona = buildFallbackPersona(mine.name);
  }

  if (Object.keys(update).length > 0) {
    const { error } = await svc.from("clients").update(update).eq("id", id);
    if (error) {
      return NextResponse.json(
        { error: "instância criada, mas falhou ao salvar", detail: error.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ instance: instanceName, qr });
}
