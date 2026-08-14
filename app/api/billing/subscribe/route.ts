import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { PLANS, planFor, type PlanKey } from "@/lib/billing";
import {
  AsaasError,
  createCustomer,
  createSubscription,
  deleteSubscription,
  hojeISO,
  openPayment,
  updateSubscription,
} from "@/lib/asaas";

// Assinar um plano, trocar de plano (POST) ou cancelar (DELETE).
//
// Esta rota é o motivo de a escolha do plano acontecer DENTRO do app e não numa
// página solta do site: aqui existe sessão, então o pagamento fica ligado ao
// tenant certo. Se a pessoa pagasse fora, sobraria casar por e-mail digitado no
// checkout, que é um texto que ela controla, e daria conta liberada errada.
//
// Devolve `invoiceUrl`, a página do Asaas onde ela escolhe Pix, boleto ou cartão.
// Write via service_role: `clients` não dá UPDATE a `authenticated`.

const CPF_CNPJ_RE = /^\d{11}$|^\d{14}$/;

export async function POST(req: NextRequest) {
  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.role !== "dono") {
    return NextResponse.json(
      { error: "só o dono pode contratar ou trocar o plano" },
      { status: 403 }
    );
  }

  let body: { plan?: string; cpfCnpj?: string; name?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const plan = body.plan;
  if (plan !== "essencial" && plan !== "profissional" && plan !== "avancado") {
    return NextResponse.json({ error: "plano inválido" }, { status: 400 });
  }
  const plano = PLANS[plan as PlanKey];

  const svc = createServiceClient();
  const { data: atual, error: readErr } = await svc
    .from("clients")
    .select("billing_customer_id, billing_subscription_id, billing_plan")
    .eq("id", mine.id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: "falha ao ler a conta" }, { status: 500 });
  }

  const customerId = (atual?.billing_customer_id as string | null) ?? null;
  const subscriptionId = (atual?.billing_subscription_id as string | null) ?? null;

  try {
    // Já assina: é troca de plano, então muda o valor da assinatura existente
    // em vez de criar outra (duas assinaturas ativas cobrariam duas vezes).
    if (subscriptionId) {
      await updateSubscription(subscriptionId, {
        value: plano.priceBRL,
        description: `Plano ${plano.name}`,
      });
      const { error: upErr, data: linhas } = await svc
        .from("clients")
        .update({
          billing_plan: plano.key,
          billing_updated_at: new Date().toISOString(),
        })
        .eq("id", mine.id)
        .select("id");
      if (upErr || !linhas?.length) {
        return NextResponse.json(
          { error: "plano alterado no gateway, mas falha ao salvar aqui" },
          { status: 500 }
        );
      }
      const pagamento = await openPayment(subscriptionId);
      return NextResponse.json({
        ok: true,
        trocaDePlano: true,
        plan: plano.key,
        invoiceUrl: pagamento?.invoiceUrl ?? null,
      });
    }

    // Primeira assinatura: precisa do documento, que é exigência do Asaas para
    // emitir Pix e boleto. Não é escolha nossa. O documento vai para o gateway
    // e NÃO é gravado no nosso banco.
    const cpfCnpj = (body.cpfCnpj ?? "").replace(/\D/g, "");
    if (!CPF_CNPJ_RE.test(cpfCnpj)) {
      return NextResponse.json(
        { error: "informe um CPF (11 dígitos) ou CNPJ (14 dígitos)" },
        { status: 400 }
      );
    }
    const nome = (body.name ?? mine.name).trim().slice(0, 120);
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "informe o e-mail de cobrança" },
        { status: 400 }
      );
    }

    // Reaproveita o cliente do Asaas se já existir (caso de quem cancelou e
    // voltou): criar de novo duplicaria a pessoa na conta do gateway.
    let cliente = customerId;
    if (!cliente) {
      const criado = await createCustomer({
        name: nome,
        cpfCnpj,
        email,
        externalReference: mine.id,
      });
      cliente = criado.id;
    }

    const assinatura = await createSubscription({
      customer: cliente,
      value: plano.priceBRL,
      nextDueDate: hojeISO(),
      description: `Plano ${plano.name}`,
      externalReference: mine.id,
    });

    // O estado da conta NÃO vira 'active' aqui: quem confirma pagamento é o
    // webhook. Assinar não é pagar, e liberar antes de o dinheiro entrar seria
    // dar o produto de graça para quem só clicou.
    const { error: upErr, data: linhas } = await svc
      .from("clients")
      .update({
        billing_provider: "asaas",
        billing_customer_id: cliente,
        billing_subscription_id: assinatura.id,
        billing_plan: plano.key,
        billing_updated_at: new Date().toISOString(),
      })
      .eq("id", mine.id)
      .select("id");
    if (upErr || !linhas?.length) {
      console.error(
        "assinatura criada no Asaas mas não salva:",
        assinatura.id,
        upErr?.message
      );
      return NextResponse.json(
        { error: "assinatura criada, mas falha ao salvar aqui. Fale com a gente." },
        { status: 500 }
      );
    }

    const pagamento = await openPayment(assinatura.id);
    return NextResponse.json({
      ok: true,
      plan: plano.key,
      subscriptionId: assinatura.id,
      invoiceUrl: pagamento?.invoiceUrl ?? null,
    });
  } catch (e) {
    if (e instanceof AsaasError) {
      // 4xx do gateway costuma ser dado inválido (documento, e-mail): vale
      // mostrar. 5xx é problema do lado deles.
      const status = e.status >= 400 && e.status < 500 ? 400 : 502;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error("erro inesperado ao assinar:", e);
    return NextResponse.json({ error: "erro inesperado ao assinar" }, { status: 500 });
  }
}

// Cancelamento self-service (decisão do dono do produto: botão, não ligação).
export async function DELETE(req: NextRequest) {
  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.role !== "dono") {
    return NextResponse.json(
      { error: "só o dono pode cancelar a assinatura" },
      { status: 403 }
    );
  }

  let motivo = "";
  try {
    const body = (await req.json()) as { motivo?: string };
    motivo = (body.motivo ?? "").trim().slice(0, 500);
  } catch {
    // Motivo é opcional: cancelar não pode depender de a pessoa explicar.
  }

  const svc = createServiceClient();
  const { data: atual } = await svc
    .from("clients")
    .select("billing_subscription_id")
    .eq("id", mine.id)
    .maybeSingle();
  const subscriptionId = (atual?.billing_subscription_id as string | null) ?? null;

  if (!subscriptionId) {
    return NextResponse.json(
      { error: "não há assinatura ativa para cancelar" },
      { status: 409 }
    );
  }

  try {
    await deleteSubscription(subscriptionId);
  } catch (e) {
    if (e instanceof AsaasError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    console.error("erro inesperado ao cancelar:", e);
    return NextResponse.json({ error: "erro inesperado ao cancelar" }, { status: 500 });
  }

  const { error: upErr, data: linhas } = await svc
    .from("clients")
    .update({
      subscription_status: "canceled",
      billing_subscription_id: null,
      billing_updated_at: new Date().toISOString(),
    })
    .eq("id", mine.id)
    .select("id");
  if (upErr || !linhas?.length) {
    return NextResponse.json(
      { error: "cancelado no gateway, mas falha ao salvar aqui" },
      { status: 500 }
    );
  }

  // O motivo é o que responde "por que perdi esse cliente". Best-effort: não
  // pode impedir o cancelamento.
  if (motivo) {
    const { error: evErr } = await svc.from("billing_events").insert({
      asaas_event_id: `cancelamento:${mine.id}:${Date.now()}`,
      event: "CANCELAMENTO_PELO_CLIENTE",
      client_id: mine.id,
      payload: { motivo, plano: planFor(mine.billingPlan)?.key ?? null },
      processed_at: new Date().toISOString(),
    });
    if (evErr)
      console.error("falha ao registrar o motivo do cancelamento:", evErr.message);
  }

  return NextResponse.json({ ok: true });
}
