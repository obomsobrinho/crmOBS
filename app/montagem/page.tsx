import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import MontagemWizard from "@/components/MontagemCliente";
import { validateConfig, type AgentConfig } from "@/lib/agent-prompt";
import type { KnowledgeDoc } from "@/lib/crm";

// O assistente de montagem. Tela cheia, sem o menu, e por isso FORA do route
// group `(app)`, como `/connect` e `/assinatura`.
//
// ⚠️ QUATRO GUARDAS, e nenhuma delas é decoração:
//
// 1. `requireActiveTenant` manda conta bloqueada para `/assinatura`. Fica aqui,
//    e não num layout, porque layout de Server Component não conhece a rota.
// 2. Atendente vai para `/inbox`: configurar o agente é do dono, e o `PUT`
//    responde 403 de qualquer forma. Sem esta linha ele veria a tela inteira e
//    só descobriria no fim.
// 3. Quem JÁ PUBLICOU vai para `/agente`. O assistente roda uma vez na vida da
//    conta; deixá-lo acessível depois criaria um segundo lugar de editar o
//    agente que está atendendo cliente de verdade.
// 4. Quem está em modo AVANÇADO vai para `/agente`. Ele tem persona escrita à
//    mão, e o assistente salva pelo formulário guiado, o que a substituiria.
//    ⚠️ Esta guarda não é redundante com a anterior: um tenant novo pode entrar
//    no avançado por `/agente` ANTES de publicar, e aí só o `prompt_mode` o
//    protege.
export const dynamic = "force-dynamic";

export default async function MontagemPage() {
  const client = await requireActiveTenant();
  if (client.role !== "dono") redirect("/inbox");
  if (client.agentPublishedAt) redirect("/agente");

  const supabase = await createClient();
  const [{ data }, { data: stages }, { data: docsRows }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "agent_config, agent_config_updated_at, prompt_mode, evolution_instance, notify_group_jid"
      )
      .eq("id", client.id)
      .maybeSingle(),
    supabase
      .from("pipeline_stages")
      .select("key, name")
      .eq("client_id", client.id),
    supabase
      .from("knowledge_documents")
      .select("id, title, status, chunk_count, byte_size, error, created_at")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false }),
  ]);

  if ((data?.prompt_mode as string | null) === "avancado") redirect("/agente");

  const docs: KnowledgeDoc[] = (
    (docsRows ?? []) as {
      id: string;
      title: string;
      status: "processing" | "ready" | "error";
      chunk_count: number;
      byte_size: number | null;
      error: string | null;
      created_at: string;
    }[]
  ).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    chunkCount: d.chunk_count,
    byteSize: d.byte_size,
    error: d.error,
    createdAt: d.created_at,
  }));

  const stageNames: Record<string, string> = {};
  for (const s of (stages ?? []) as { key: string; name: string }[]) {
    stageNames[s.key] = s.name;
  }

  // Normaliza o agent_config guardado (pode ser null ou de outra versão).
  let initialConfig: AgentConfig | null = null;
  if (data?.agent_config) {
    const r = validateConfig(data.agent_config);
    if (r.ok) initialConfig = r.value;
  }

  return (
    <MontagemWizard
      clientId={client.id}
      clientName={client.name}
      hasInstance={!!data?.evolution_instance}
      initialConfig={initialConfig}
      agentConfigUpdatedAt={
        (data?.agent_config_updated_at as string | null) ?? null
      }
      initialNotifyJid={(data?.notify_group_jid as string | null) ?? null}
      // O nome do cadastro só entra quando ainda não existe configuração: depois
      // disso quem manda é o que a pessoa escreveu.
      prefillCompanyName={initialConfig ? null : client.name}
      knowledgeDocs={docs}
      knowledgeKeyConfigured={!!process.env.OPENAI_API_KEY}
      stageNames={stageNames}
      passoDoServidor={client.montagem.passo}
    />
  );
}
