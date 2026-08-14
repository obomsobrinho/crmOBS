import SubscriptionPanel from "@/components/SubscriptionPanel";
import BillingCheckout from "@/components/BillingCheckout";
import { accessState } from "@/lib/billing";

// Preview de design da tela de assinatura (dev-only, liberado pelo proxy).
// Mostra o pior caso, que é o que o gate produz: teste gratuito vencido.
export const dynamic = "force-dynamic";

const TRIAL_VENCIDO = accessState({
  subscription_status: "trialing",
  trial_ends_at: "2026-08-01T12:00:00.000Z",
  grace_until: null,
});

export default function DesignAssinaturaPage() {
  return (
    <SubscriptionPanel
      companyName="Ótica Vision"
      email="dono@oticavision.com.br"
      access={TRIAL_VENCIDO}
      status="trialing"
      trialEndsAt="2026-08-01T12:00:00.000Z"
      graceUntil={null}
      seats={3}
      billingPlan={null}
      isOwner
    >
      <BillingCheckout
        planoAtual={null}
        temAssinatura={false}
        nomePadrao="Ótica Vision"
        emailPadrao="dono@oticavision.com.br"
        planoSugerido="profissional"
      />
    </SubscriptionPanel>
  );
}
