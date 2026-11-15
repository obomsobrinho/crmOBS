import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import { rowToStage } from "@/lib/pipeline";
import {
  CONTAGENS_PIPELINE_VAZIAS,
  fontePipelineDoBanco,
  paramsPipeline,
  primeirasColunas,
} from "@/features/pipeline/api/fonte";
import { foraDaLista } from "@/lib/inbox-lista";
import PipelineBoard from "@/features/pipeline/components/PipelineBoard";

export const dynamic = "force-dynamic";

// Pipeline (funil) do tenant. Colunas = estágios (pipeline_stages), cards =
// conversas (mesma fonte do inbox). O gate de auth/instância roda no layout do
// route group (app). A RLS restringe tudo ao tenant logado.
export default async function PipelinePage() {
  const supabase = await createClient();

  // O gate e os estágios saem JUNTOS (passo 0 de docs/plano-dados-e-estado.md):
  // os estágios não dependem do tenant (a RLS já restringe), então eram uma
  // viagem a mais em série. Num redirecionamento do gate a leitura se perde.
  const [client, { data: stagesRows }] = await Promise.all([
    requireActiveTenant(),
    supabase
      .from("pipeline_stages")
      .select("id, key, name, position, is_canonical, is_default, archived, color")
      .order("position"),
  ]);
  const stages = (stagesRows ?? []).map(rowToStage);

  // A PRIMEIRA PÁGINA DE CADA COLUNA (10 cards) e os números, pela MESMA função
  // do banco que o navegador usa para as páginas seguintes
  // (docs/plano-carregamento.md, fase 5).
  let inicial: Awaited<ReturnType<typeof primeirasColunas>> = {
    colunas: {},
    contagens: CONTAGENS_PIPELINE_VAZIAS,
  };
  try {
    inicial = await primeirasColunas(
      fontePipelineDoBanco(supabase, client.id),
      paramsPipeline(stages, {
        busca: "",
        atendente: "all",
        soEsperando: false,
        fora: foraDaLista(client.avisos),
      })
    );
  } catch (e) {
    console.error("pipeline, primeira página:", e);
  }

  return (
    <PipelineBoard
      clientId={client?.id ?? ""}
      myRole={client?.role ?? null}
      numeroAvisos={client.avisos}
      initialStages={stages}
      inicial={inicial}
    />
  );
}
