import GuardaDaTela from "@/components/GuardaDaTela";
import TelaDoPipeline from "@/features/pipeline/components/TelaDoPipeline";

export const dynamic = "force-dynamic";

// Pipeline (funil) do tenant. Colunas = estágios (pipeline_stages), cards =
// conversas (mesma fonte do inbox). A RLS restringe tudo ao tenant logado.
//
// Área migrada no passo 3b de docs/plano-dados-e-estado.md (15/11/2026): a página NÃO
// lê o banco (D8). A sessão vem do layout do `(app)`, a guarda decide no navegador
// (conta bloqueada vai para `/assinatura`, como fazia `requireActiveTenant`), e o
// quadro lê pelo cache (`features/pipeline/api/usePipelineDados.ts`).
export default function PipelinePage() {
  return (
    <GuardaDaTela ativa>
      <TelaDoPipeline />
    </GuardaDaTela>
  );
}
