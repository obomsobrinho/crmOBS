import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { atualizacaoDoEvento } from "@/lib/billing";
import { segredoConfere } from "@/lib/segredo";
import type { Json } from "@/lib/database.types";

// Webhook do Asaas: é ele que muda o estado da assinatura de um tenant.
//
// Rota PÚBLICA por natureza (o gateway precisa alcançar pela internet), então a
// autenticação é o `asaas-access-token`, o mesmo token cadastrado no painel do
// Asaas. Sem isso, qualquer um que descubra a URL manda "pagamento confirmado" e
// libera conta de graça.
//
// IDEMPOTENTE pelo id do evento, como a documentação do Asaas recomenda: o
// gateway reenvia em caso de falha, e `billing_events.asaas_event_id` é UNIQUE,
// então o reenvio bate na constraint e sai por 200 sem reprocessar.
//
// Responde 200 mesmo quando não consegue casar o evento com um tenant. Devolver
// erro faria o Asaas reenviar para sempre um evento que nunca vai resolver.

interface PagamentoAsaas {
  id?: string;
  status?: string;
  value?: number;
  subscription?: string | null;
  customer?: string | null;
  externalReference?: string | null;
}

interface EventoAsaas {
  id?: string;
  event?: string;
  payment?: PagamentoAsaas;
}

export async function POST(req: NextRequest) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado) {
    console.error("webhook do Asaas chamado sem ASAAS_WEBHOOK_TOKEN configurado");
    return NextResponse.json({ error: "não configurado" }, { status: 500 });
  }
  if (!segredoConfere(req.headers.get("asaas-access-token"), esperado)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let bruto: Json;
  let corpo: EventoAsaas;
  try {
    bruto = (await req.json()) as Json;
    corpo = bruto as EventoAsaas;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const eventoId = typeof corpo.id === "string" ? corpo.id : "";
  const evento = typeof corpo.event === "string" ? corpo.event : "";
  if (!eventoId || !evento) {
    return NextResponse.json({ error: "evento sem id ou tipo" }, { status: 400 });
  }

  const svc = createServiceClient();
  const pagamento = corpo.payment ?? {};

  // Acha o tenant: pela assinatura, pelo cliente do gateway, ou pelo
  // externalReference (que guarda o clients.id na criação). Três caminhos
  // porque perder um pagamento por causa de um id é pior que uma query a mais.
  // Cada busca já traz `vitalicio_desde`: a conta vitalícia nunca é reescrita.
  let tenant: { id: string; vitalicio_desde: string | null } | null = null;
  if (pagamento.subscription) {
    const { data } = await svc
      .from("clients")
      .select("id, vitalicio_desde")
      .eq("billing_subscription_id", pagamento.subscription)
      .maybeSingle();
    tenant = data;
  }
  if (!tenant && pagamento.customer) {
    const { data } = await svc
      .from("clients")
      .select("id, vitalicio_desde")
      .eq("billing_customer_id", pagamento.customer)
      .maybeSingle();
    tenant = data;
  }
  if (!tenant && pagamento.externalReference) {
    const { data } = await svc
      .from("clients")
      .select("id, vitalicio_desde")
      .eq("id", pagamento.externalReference)
      .maybeSingle();
    tenant = data;
  }
  const clientId = tenant?.id ?? null;

  // Grava o evento ANTES de aplicar a regra (recomendação do Asaas). O UNIQUE
  // é o que garante que reenvio não reprocessa.
  const { data: registrado, error: insErr } = await svc
    .from("billing_events")
    .insert({
      asaas_event_id: eventoId,
      event: evento,
      client_id: clientId,
      payload: bruto,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    // 23505 = violação de unicidade, ou seja, evento repetido. É sucesso.
    if (insErr.code === "23505") {
      return NextResponse.json({ received: true, duplicado: true });
    }
    console.error("falha ao gravar evento de cobrança:", insErr.message);
    return NextResponse.json({ error: "falha ao gravar o evento" }, { status: 500 });
  }

  if (!clientId) {
    // Evento de alguém que não é nosso tenant (ou teste). Fica registrado com
    // client_id nulo, que já é a informação útil.
    return NextResponse.json({ received: true, semTenant: true });
  }

  const agora = new Date();

  // CONTA VITALÍCIA NUNCA É REESCRITA PELO GATEWAY (central do dono, entrega 2):
  // o evento fica registrado e nada muda. O gatilho `clients_guarda_da_conta`
  // recusa a escrita no banco também, se algum outro caminho tentar.
  let erro: string | null = null;
  const update = atualizacaoDoEvento(evento, agora);
  if (tenant?.vitalicio_desde) {
    erro = "ignorado: cliente vitalicio";
  } else if (update) {
    const { error: upErr, data: linhas } = await svc
      .from("clients")
      .update({ ...update, billing_updated_at: agora.toISOString() })
      .eq("id", clientId)
      .select("id");
    if (upErr || !linhas?.length) {
      erro = upErr?.message ?? "update não afetou nenhuma linha";
      console.error("falha ao aplicar evento de cobrança:", erro);
    }
  }

  if (registrado?.id) {
    await svc
      .from("billing_events")
      .update({ processed_at: new Date().toISOString(), error: erro })
      .eq("id", registrado.id);
  }

  return NextResponse.json({ received: true });
}
