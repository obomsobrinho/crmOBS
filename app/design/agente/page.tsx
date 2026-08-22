import NavRail from "@/components/NavRail";
import AgentConfigForm from "@/components/AgentConfigForm";
import { Card } from "@/components/ui/card";
import { EMPTY_CONFIG, type AgentConfig } from "@/lib/agent-prompt";

// Preview de design do construtor do agente (dev-only, liberado pelo proxy).
// Renderiza o form real com um AgentConfig mock, sem banco e sem login.
export const dynamic = "force-dynamic";

const MOCK: AgentConfig = {
  ...EMPTY_CONFIG,
  companyName: "Ótica Vision",
  companyWhat:
    "é uma ótica no centro da cidade, com exame de vista gratuito e armações de várias marcas.",
  companyAddress: "Rua das Flores, 120 - Centro",
  companySite: "https://oticavision.com.br",
  hoursNote: "fechado em feriados",
  agentName: "Alê",
  agentRole: "atendente",
  tone: "amigavel",
  goals: ["duvidas", "qualificar", "agendar"],
  dontDo: ["Nunca prometer prazo de entrega", "Não dar desconto por conta própria"],
  escalateWhen: ["Quando pedirem receita médica"],
  handoffNotice: "Vou verificar isso com a equipe e já te confirmo por aqui.",
  details:
    "Fazemos exame de vista gratuito com hora marcada. Trabalhamos com as marcas Ray-Ban, Oakley e Chilli Beans. Lentes multifocais têm garantia de 1 ano. Promoção do mês: 2ª armação com 40% de desconto.",
};

export default function DesignAgentePage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/agente" />
      {/* overflow-y-auto como na tela real: a rolagem é do cartão, uma só. */}
      <Card className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <AgentConfigForm
          clientId="preview"
          instance="crm_preview01"
          initialMode="guiado"
          initialConfig={MOCK}
          initialPersona={null}
          hasManualPersona={false}
          initialNotifyJid="120363000000000000@g.us"
          stageNames={{ aguardando_humano: "Aguardando atendimento" }}
          agentEnabled
          blockers={[]}
          preview
        />
      </Card>
    </div>
  );
}
