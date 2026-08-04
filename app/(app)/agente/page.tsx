import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyClient } from "@/lib/auth";
import AgentConfigForm from "@/components/AgentConfigForm";
import NotifyTargetCard from "@/components/NotifyTargetCard";
import { validateConfig, type AgentConfig } from "@/lib/agent-prompt";

export const dynamic = "force-dynamic";

type Mode = "guiado" | "avancado";

export default async function AgentePage() {
  const client = await getMyClient();
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

  return (
    <div className="glass flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-2xl p-6">
      <NotifyTargetCard clientId={client!.id} initialJid={notifyGroup} />
      <AgentConfigForm
        clientId={client!.id}
        instance={instance}
        initialMode={promptMode}
        initialConfig={initialConfig}
        initialPersona={persona}
        prefillCompanyName={initialConfig ? null : client?.name}
        hasManualPersona={hasManualPersona}
        notifyGroupConfigured={!!notifyGroup}
      />
    </div>
  );
}
