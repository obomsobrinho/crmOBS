import NavRail from "@/components/NavRail";
import OnboardingBar from "@/components/OnboardingBar";
import AgentConfigForm from "@/components/AgentConfigForm";
import { Card } from "@/components/ui/card";
import { EMPTY_CONFIG, type AgentConfig } from "@/lib/agent-prompt";
import { onboardingState } from "@/lib/onboarding";
import type { KnowledgeDoc } from "@/lib/crm";

// Preview do `/agente` em MODO MONTAGEM (dev-only, liberado pelo proxy).
//
// Existe separado do /design/agente porque os dois modos são estados diferentes
// da MESMA tela, e um preview só não mostra os dois. Aqui `jaPublicou` é falso,
// que é o sinal (`agent_published_at` nulo) que liga o acompanhante.
//
// A `OnboardingBar` é renderizada de propósito: ela aparece em toda página do app
// enquanto o agente não foi publicado, então é ESTE o enquadramento real da
// montagem. Sem ela não dá para julgar se existem dois contadores de progresso na
// mesma tela, que era a objeção principal contra o acompanhante.
export const dynamic = "force-dynamic";

// Conta nova de verdade: tudo vazio menos o nome, que vem do cadastro. É o que a
// pessoa vê no primeiro segundo.
const VAZIO: AgentConfig = {
  ...EMPTY_CONFIG,
  companyName: "Ótica Vision",
};

const SEM_DOCS: KnowledgeDoc[] = [];

// Trilho no passo 2: conectou, ainda não configurou, não testou, não publicou.
const ONBOARDING = onboardingState({
  hasInstance: true,
  agentConfigured: false,
  tested: false,
  published: false,
});

export default function DesignAgenteMontagemPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/agente" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <OnboardingBar state={ONBOARDING} />
        <Card className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-6">
          <AgentConfigForm
            clientId="preview"
            instance="crm_preview01"
            initialMode="guiado"
            initialConfig={VAZIO}
            initialPersona={null}
            hasManualPersona={false}
            initialNotifyJid={null}
            stageNames={{ aguardando_humano: "Aguardando atendimento" }}
            knowledgeDocs={SEM_DOCS}
            knowledgeKeyConfigured
            // Nunca foi ao ar: acompanhante ligado, chave desabilitada, e o
            // rodapé diz a verdade ("ainda não vai ao ar").
            agentEnabled={false}
            jaPublicou={false}
            blockers={["configurar o agente", "testar a conversa"]}
            preview
          />
        </Card>
      </div>
    </div>
  );
}
