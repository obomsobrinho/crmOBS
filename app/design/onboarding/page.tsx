import NavRail from "@/components/NavRail";
import AvisoMontagem from "@/components/AvisoMontagem";
import AgentPowerToggle from "@/components/AgentPowerToggle";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { publishBlockers } from "@/lib/onboarding";

// Preview de design do que sobrou do trilho de onboarding (dev-only, liberado
// pelo proxy).
//
// ⚠️ A BARRA DE QUATRO PASSOS NÃO EXISTE MAIS. Ela foi absorvida pelo assistente
// de `/montagem` (preview em `/design/montagem`), e o que ficou em toda página do
// app é UMA LINHA sem numeral: o contador de progresso da conta passou a existir
// num lugar só. Esta tela existe para julgar exatamente isso, a linha convivendo
// com o resto da interface.
export const dynamic = "force-dynamic";

// Conectou, ainda não configurou. É o estado em que a linha aparece e a chave do
// agente fica travada dizendo o que falta.
const INPUT = {
  hasInstance: true,
  agentConfigured: false,
  // ⚠️ Testar NÃO bloqueia mais a ativação (decisão do dono, 28/08/2026), então
  // este campo não muda a frase abaixo. Fica aqui só porque o sinal continua
  // existindo no banco.
  tested: false,
  published: false,
};

export default function DesignOnboardingPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <AvisoMontagem />
        <div
          className={cn(
            cardVariants(),
            "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6"
          )}
        >
          {/* Como o controle do agente aparece na tela real: uma chave no
              cabeçalho mais uma linha dizendo o que falta. */}
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
