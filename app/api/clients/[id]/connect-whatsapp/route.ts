import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { buildFallbackPersona } from "@/lib/agent-prompt";
import {
  connectInstance,
  connectionState,
  createInstance,
  extractPairingCode,
  extractQrBase64,
  logoutInstance,
} from "@/lib/evolution";

/**
 * Número de WhatsApp em só dígitos, com DDI. Aceita o que a pessoa digitar
 * ("(31) 99999-8888", "+55 31 ..."); com 10 ou 11 dígitos assume Brasil.
 * Devolve null quando não dá para ser um número.
 */
function normalizarNumero(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const d = bruto.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

// Cria (ou reconecta) a instância Evolution do tenant logado e devolve o QR,
// ou, se vier `number` no corpo, o CÓDIGO DE PAREAMENTO (24/09/2026): o jeito
// de conectar pelo próprio celular, onde não dá para ler um QR na mesma tela.
export async function POST(
  req: NextRequest,
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

  // Corpo opcional: sem ele é o fluxo de sempre, pelo QR.
  let corpo: { number?: unknown } = {};
  try {
    corpo = await req.json();
  } catch {
    // sem corpo = QR
  }
  const pedeNumero = corpo.number !== undefined && corpo.number !== null && corpo.number !== "";
  const number = pedeNumero ? normalizarNumero(corpo.number) : null;
  if (pedeNumero && !number) {
    return NextResponse.json(
      { error: "Confira o número: DDD mais o número do WhatsApp." },
      { status: 400 }
    );
  }

  let qr: string | null = null;
  let pairingCode: string | null = null;
  try {
    const createRes = await createInstance(instanceName, webhookUrl, number ?? undefined);
    if (createRes.ok) {
      const body = await createRes.json();
      qr = extractQrBase64(body);
      pairingCode = extractPairingCode(body);
    }
    // Instância que já existe (ou criada sem devolver o código): pede de novo.
    if (!createRes.ok || (number && !pairingCode)) {
      if (number) {
        // O código de pareamento só nasce do estado FECHADO. Parada em
        // "connecting" (um QR pedido e não lido), ela volta a fechado antes.
        // ⚠️ Nunca derrubar uma instância ABERTA: seria desconectar o WhatsApp
        // de quem já está atendendo.
        const st = await connectionState(instanceName);
        const estado = st.ok
          ? ((await st.json()) as { instance?: { state?: string } })?.instance?.state
          : undefined;
        if (estado === "open") {
          return NextResponse.json({ instance: instanceName, connected: true });
        }
        if (estado === "connecting") await logoutInstance(instanceName);
      }
      const connectRes = await connectInstance(instanceName, number ?? undefined);
      if (!connectRes.ok) {
        const detail = await connectRes.text();
        return NextResponse.json(
          { error: "falha ao conectar na Evolution", detail },
          { status: 502 }
        );
      }
      const body = await connectRes.json();
      qr = extractQrBase64(body) ?? qr;
      pairingCode = extractPairingCode(body) ?? pairingCode;
    }
  } catch {
    return NextResponse.json(
      { error: "falha ao contatar a Evolution" },
      { status: 502 }
    );
  }
  if (number && !pairingCode) {
    return NextResponse.json(
      { error: "Não recebemos o código do WhatsApp. Tente de novo em alguns segundos." },
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

  return NextResponse.json({ instance: instanceName, qr, pairingCode });
}
