import NavRail from "@/components/NavRail";
import OnboardingBar from "@/components/OnboardingBar";
import AgentPublishCard from "@/components/AgentPublishCard";
import { onboardingState, publishBlockers } from "@/lib/onboarding";

// Preview de design do trilho de onboarding (dev-only, liberado pelo proxy).
// Estado do meio do caminho: WhatsApp conectado, agente configurado, falta
// testar e publicar. É o estado em que a barra mostra mais coisa.
export const dynamic = "force-dynamic";

const INPUT = {
  hasInstance: true,
  agentConfigured: true,
  tested: false,
  published: false,
};

export default function DesignOnboardingPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <OnboardingBar state={onboardingState(INPUT)} />
        <div className="glass flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-2xl p-6">
          <AgentPublishCard
            clientId="00000000-0000-0000-0000-000000000000"
            published={false}
            blockers={publishBlockers(INPUT)}
          />
          <p className="text-sm text-ink-muted">
            Conteúdo da página fica aqui embaixo do trilho.
          </p>
        </div>
      </div>
    </div>
  );
}
