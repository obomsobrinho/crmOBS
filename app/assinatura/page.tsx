import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyClient } from "@/lib/auth";
import { fetchMembers } from "@/lib/team";
import { createServiceClient } from "@/lib/supabase/service";
import SubscriptionPanel from "@/components/SubscriptionPanel";
import BillingCheckout from "@/components/BillingCheckout";
import { type PlanKey } from "@/lib/billing";
import { frasesDeValor, type FraseValor } from "@/lib/valor";
import { agoraMs } from "@/lib/periodo";
import { resumoDeValorAgregado } from "@/lib/painel-agregado";
import { carregarAgregadoDoPainel } from "@/lib/painel-dados";
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
  // data de propósito: é o "tudo que a IA já fez aqui". Vem do MESMO agregado do
  // /painel (lib/painel-dados.ts: o banco soma, nenhuma linha de mensagem sobe),
  // e só é buscado para o dono, porque o bloco de valor mora no passo de cancelar.
  // Falhar aqui nunca pode travar a tela de pagamento: sem o acumulado, só some
  // o argumento de retenção.
  let frasesAcumuladas: FraseValor[] = [];
  if (client.role === "dono") {
    try {
      const agora = agoraMs();
      const [agregado, { data: cfg }] = await Promise.all([
        carregarAgregadoDoPainel(supabase, {
          clientId: client.id,
          avisos: client.avisos,
          agora,
          janelas: [],
          mes: null,
        }),
        // Só `hours` sai do jsonb (R-51).
        supabase
          .from("clients")
          .select("hours:agent_config->hours")
          .eq("id", client.id)
          .maybeSingle(),
      ]);
      const acumulado = resumoDeValorAgregado({
        janela: agregado.janela(0),
        series: agregado.series,
        hours: (cfg?.hours as BusinessHours | null | undefined) ?? null,
        mes: null,
      });
      frasesAcumuladas = frasesDeValor(acumulado, "desde o início");
    } catch {
      frasesAcumuladas = [];
    }
  }

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
