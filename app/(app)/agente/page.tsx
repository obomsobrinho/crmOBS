import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import AgentConfigForm from "@/components/AgentConfigForm";
import { Card } from "@/components/ui/card";
import { validateConfig, type AgentConfig } from "@/lib/agent-prompt";
import { publishBlockers } from "@/lib/onboarding";
import type { KnowledgeDoc } from "@/lib/crm";

export const dynamic = "force-dynamic";

type Mode = "guiado" | "avancado";

export default async function AgentePage() {
  const client = await requireActiveTenant();
  // Configurar o agente é só do dono. Atendente não vê nem acessa.
  if (!client || client.role !== "dono") redirect("/inbox");
  const supabase = await createClient();
  // Os estágios vêm junto porque a bancada de teste mora nesta tela agora (era o
  // /playground): eles só rotulam o "estágio que moveria" no diagnóstico.
  //
  // Os documentos vêm junto porque a base de conhecimento passou a morar DENTRO
  // do grupo "O que ele sabe" (26/08/2026). O motivo é que o código já tratava
  // as duas coisas como uma: a seção FONTES E HONESTIDADE do prompt lista os
  // "detalhes do negócio" e os trechos da base na MESMA frase, como o que o
  // agente pode afirmar. Só o menu é que separava. Mesmo select da tela
  // /conhecimento, que segue existindo como rota (fora do menu).
  const [{ data }, { data: stages }, { data: docsRows }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "persona, agent_config, prompt_mode, notify_group_jid"
      )
      .eq("id", client!.id)
      .maybeSingle(),
    supabase.from("pipeline_stages").select("key, name").eq("client_id", client!.id),
    supabase
      .from("knowledge_documents")
      .select("id, title, status, chunk_count, byte_size, error, created_at")
      .eq("client_id", client!.id)
      .order("created_at", { ascending: false }),
  ]);

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

  const persona = (data?.persona as string | null) ?? null;
  const promptMode = (data?.prompt_mode as Mode | null) ?? "guiado";
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
  //
  // ⚠️ `px-6 pt-6` e NÃO `p-6`: o rodapé do formulário é `sticky bottom-0`, e
  // `bottom: 0` cola no fim da content box do container de rolagem. Com padding
  // embaixo, a faixa parava 24px acima do fim e dava para ver conteúdo passando
  // por baixo dela. O respiro de baixo vem do `py-3` do próprio rodapé.
  return (
    <Card
      variant="pagina"
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-6 max-md:px-4 max-md:pt-2"
    >
      <AgentConfigForm
        clientId={client!.id}
        initialMode={promptMode}
        initialConfig={initialConfig}
        initialPersona={persona}
        prefillCompanyName={initialConfig ? null : client?.name}
        hasManualPersona={hasManualPersona}
        initialNotifyJid={notifyGroup}
        stageNames={stageNames}
        knowledgeDocs={docs}
        knowledgeKeyConfigured={!!process.env.OPENAI_API_KEY}
        // Atendendo agora = já foi ao ar alguma vez E está ligado na chave.
        agentEnabled={!!client!.agentPublishedAt && client!.agentEnabled}
        // Só muda a frase do rodapé (salvar já publica, ou ainda não vai ao ar).
        // A montagem virou rota própria, mas esta tela CONTINUA aberta a quem
        // ainda não publicou (decisão do dono): é a única porta para o modo
        // avançado antes da primeira ativação. Quem cai aqui nesse estado veio de
        // link direto, porque `/` e o aviso mandam para `/montagem`.
        jaPublicou={!!client!.agentPublishedAt}
        blockers={publishBlockers({
          hasInstance: !!client!.evolution_instance,
          agentConfigured: client!.montagem.feito.configurar,
          tested: client!.montagem.feito.testar,
          published: !!client!.agentPublishedAt,
        })}
      />
    </Card>
  );
}
