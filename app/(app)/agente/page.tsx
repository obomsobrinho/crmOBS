import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import AgentConfigForm from "@/components/AgentConfigForm";
import { Card } from "@/components/ui/card";
import { validateConfig, type AgentConfig } from "@/lib/agent-prompt";
import { publishBlockers } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

type Mode = "guiado" | "avancado";

export default async function AgentePage() {
  const client = await requireActiveTenant();
  // Configurar o agente é só do dono. Atendente não vê nem acessa.
  if (!client || client.role !== "dono") redirect("/inbox");
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select(
      "persona, agent_config, prompt_mode, evolution_instance, notify_group_jid"
    )
    .eq("id", client!.id)
    .maybeSingle();

  const persona = (data?.persona as string | null) ?? null;
  const promptMode = (data?.prompt_mode as Mode | null) ?? "guiado";
  const instance = (data?.evolution_instance as string | null) ?? null;
  const notifyGroup = (data?.notify_group_jid as string | null) ?? null;

  // Normaliza o agent_config guardado (pode ser null ou de outra versão).
  let initialConfig: AgentConfig | null = null;
  if (data?.agent_config) {
    const r = validateConfig(data.agent_config);
    if (r.ok) initialConfig = r.value;
  }

  const hasManualPersona =
    !data?.agent_config && !!persona && persona.trim().length > 0;

  // O cartão é o container de rolagem da tela: uma barra só, do cartão de
  // publicação até o fim do formulário. Antes era overflow-hidden aqui mais uma
  // rolagem própria dentro do formulário, o que dava duas barras e obrigava a
  // pessoa a descobrir qual era a certa.
  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <AgentConfigForm
        clientId={client!.id}
        instance={instance}
        initialMode={promptMode}
        initialConfig={initialConfig}
        initialPersona={persona}
        prefillCompanyName={initialConfig ? null : client?.name}
        hasManualPersona={hasManualPersona}
        initialNotifyJid={notifyGroup}
        // Atendendo agora = já foi ao ar alguma vez E está ligado na chave.
        agentEnabled={!!client!.agentPublishedAt && client!.agentEnabled}
        blockers={publishBlockers({
          hasInstance: !!client!.evolution_instance,
          agentConfigured: !!client!.onboarding.steps.find(
            (s) => s.key === "configurar"
          )?.done,
          tested: !!client!.onboarding.steps.find((s) => s.key === "testar")?.done,
          published: !!client!.agentPublishedAt,
        })}
      />
    </Card>
  );
}
