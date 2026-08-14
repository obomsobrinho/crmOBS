import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { graceUntilFrom } from "@/lib/billing";

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
  if (req.headers.get("asaas-access-token") !== esperado) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let corpo: EventoAsaas;
  try {
    corpo = (await req.json()) as EventoAsaas;
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
  let clientId: string | null = null;
  if (pagamento.subscription) {
    const { data } = await svc
      .from("clients")
      .select("id")
      .eq("billing_subscription_id", pagamento.subscription)
      .maybeSingle();
    clientId = (data?.id as string | undefined) ?? null;
  }
  if (!clientId && pagamento.customer) {
    const { data } = await svc
      .from("clients")
      .select("id")
      .eq("billing_customer_id", pagamento.customer)
      .maybeSingle();
    clientId = (data?.id as string | undefined) ?? null;
  }
  if (!clientId && pagamento.externalReference) {
    const { data } = await svc
      .from("clients")
      .select("id")
      .eq("id", pagamento.externalReference)
      .maybeSingle();
    clientId = (data?.id as string | undefined) ?? null;
  }

  // Grava o evento ANTES de aplicar a regra (recomendação do Asaas). O UNIQUE
  // é o que garante que reenvio não reprocessa.
  const { data: registrado, error: insErr } = await svc
    .from("billing_events")
    .insert({
      asaas_event_id: eventoId,
      event: evento,
      client_id: clientId,
      payload: corpo as unknown as Record<string, unknown>,
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
  let update: Record<string, unknown> | null = null;

  switch (evento) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
      // Dinheiro entrou: conta em dia, sem carência pendente, e o teste some
      // (quem paga não volta a ser trial).
      update = {
        subscription_status: "active",
        grace_until: null,
        trial_ends_at: null,
      };
      break;

    case "PAYMENT_OVERDUE":
      // Atrasou: entra em carência em vez de bloquear na hora, porque Pix e
      // boleto atrasam por motivo bobo e derrubar o atendimento de quem paga é
      // pior que esperar alguns dias.
      update = {
        subscription_status: "past_due",
        grace_until: graceUntilFrom(agora),
      };
      break;

    case "PAYMENT_REFUNDED":
      // Dinheiro devolvido: o período deixou de estar pago. Sem carência, mas
      // também sem cancelar, porque estorno não é sempre desistência.
      update = { subscription_status: "past_due", grace_until: null };
      break;

    case "PAYMENT_DELETED":
      // Cobrança apagada NÃO muda estado de propósito: isso acontece em limpeza
      // administrativa e ao cancelar assinatura, e bloquear alguém por causa de
      // uma faxina nossa seria um tiro no pé. Fica só o registro.
      update = null;
      break;

    default:
      update = null;
  }

  let erro: string | null = null;
  if (update) {
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
