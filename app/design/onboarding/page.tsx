import NavRail from "@/components/NavRail";
import OnboardingBar from "@/components/OnboardingBar";
import AgentPowerToggle from "@/components/AgentPowerToggle";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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
        <div className={cn(cardVariants(), "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6")}>
          {/* Como o controle do agente aparece na tela real: uma chave no
              cabeçalho mais uma linha dizendo o que falta. Era um cartão inteiro
              com título, parágrafo e botão. */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-titulo">Agente de IA</h1>
              <p className="text-apoio text-ink-2">
                Configure como o agente atende no WhatsApp.
              </p>
            </div>
            <AgentPowerToggle
              clientId="00000000-0000-0000-0000-000000000000"
              enabled={false}
              blocked
            />
          </div>
          <div className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
            Antes de ativar o agente, falta: {publishBlockers(INPUT).join(", ")}.
          </div>
        </div>
      </div>
    </div>
  );
}
