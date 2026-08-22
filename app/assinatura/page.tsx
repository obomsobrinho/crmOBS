import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyClient } from "@/lib/auth";
import { fetchMembers } from "@/lib/team";
import { createServiceClient } from "@/lib/supabase/service";
import SubscriptionPanel from "@/components/SubscriptionPanel";
import BillingCheckout from "@/components/BillingCheckout";
import { type PlanKey } from "@/lib/billing";
import {
  frasesDeValor,
  resumoDeValor,
  type ValorMsg,
  type ValorQual,
} from "@/lib/valor";
import type { BusinessHours } from "@/lib/agent-prompt";

export const dynamic = "force-dynamic";

function planoDaUrl(v: string | string[] | undefined): PlanKey | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "essencial" || s === "profissional" || s === "avancado" ? s : null;
}

// Tela de assinatura. Fica FORA do route group (app) de propósito: é para onde o
// gate manda a conta bloqueada, então não pode estar atrás do próprio gate. O
// proxy continua exigindo login (a rota não está na lista de públicas).
//
// É CAIXA, não vitrine: a página de vendas com argumento mora no site. Aqui a
// pessoa só paga, troca de plano ou cancela. O `?plano=` vem do link do site e
// só pré-seleciona a linha.
export default async function AssinaturaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const client = await getMyClient();
  if (!client) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pessoas com acesso = base da cobrança por assento. Vem da RPC
  // tenant_members (o CRM não lê auth.users direto).
  const members = await fetchMembers(supabase);

  // Se já existe assinatura no gateway, a tela vira "trocar de plano" e o
  // documento não é pedido de novo. Esta coluna não vem no select do
  // getMyClient, então a leitura vai por service_role, escopada ao próprio id.
  let temAssinatura = false;
  if (client.role === "dono") {
    const svc = createServiceClient();
    const { data } = await svc
      .from("clients")
      .select("billing_subscription_id")
      .eq("id", client.id)
      .maybeSingle();
    temAssinatura = !!data?.billing_subscription_id;
  }

  const planoSugerido = planoDaUrl((await searchParams).plano);

  // Acumulado de valor desde o início, para o passo de cancelar. Sem janela de
  // data de propósito: é o "tudo que a IA já fez aqui". Teto de linhas porque um
  // tenant com um ano de operação tem dezenas de milhares, e esta tela precisa
  // abrir rápido. Quando o teto doer, o caminho é uma tabela de agregado mensal.
  const [{ data: todasMsgs }, { data: todasQuals }, { data: cfg }] =
    await Promise.all([
      supabase
        .from("chat_messages")
        .select("phone, user_message, bot_message, message_type, created_at")
        .order("created_at", { ascending: false })
        .limit(20000),
      supabase
        .from("conversation_qualifications")
        .select("phone, action, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("clients")
        .select("agent_config")
        .eq("id", client.id)
        .maybeSingle(),
    ]);

  const acumulado = resumoDeValor({
    msgs: (todasMsgs ?? []) as ValorMsg[],
    quals: (todasQuals ?? []) as ValorQual[],
    hours: (cfg?.agent_config as { hours?: BusinessHours } | null)?.hours ?? null,
  });
  const frasesAcumuladas = frasesDeValor(acumulado, "desde o início");

  return (
    <SubscriptionPanel
      companyName={client.name}
      email={user?.email ?? ""}
      access={client.access}
      status={client.subscriptionStatus}
      trialEndsAt={client.trialEndsAt}
      graceUntil={client.graceUntil}
      seats={members.length || null}
      billingPlan={client.billingPlan}
      isOwner={client.role === "dono"}
    >
      <BillingCheckout
        planoAtual={planoDaUrl(client.billingPlan ?? undefined)}
        temAssinatura={temAssinatura}
        nomePadrao={client.name}
        emailPadrao={user?.email ?? ""}
        planoSugerido={planoSugerido}
        frasesAcumuladas={frasesAcumuladas}
      />
    </SubscriptionPanel>
  );
}
