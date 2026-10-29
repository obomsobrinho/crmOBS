import NavRail from "@/components/NavRail";
import type { Tela } from "@/components/admin/campanhas/tipos";
import { agoraMs } from "@/lib/periodo";
import PreviaDeCampanhas from "./PreviaDeCampanhas";

// Preview de Campanhas v2, a prospecção do dono do produto (docs/plano-campanhas.md).
// Dev-only, sem banco e sem sessão: empresas de mentira, nenhuma busca paga,
// nenhuma mensagem enviada. `?tela=` abre direto numa tela:
// leads | busca | campanhas | campanha | rascunho;
// `?cenario=vazio` mostra tudo sem dados (os estados vazios).
export const dynamic = "force-dynamic";

const TELAS: Record<string, Tela> = {
  leads: { aba: "leads", busca: null },
  busca: { aba: "leads", busca: "b1" },
  campanhas: { aba: "campanhas", vista: "lista" },
  campanha: { aba: "campanhas", vista: "detalhe", id: "g8" },
  rascunho: { aba: "campanhas", vista: "editar", id: "c3" },
};

export default async function DesignCampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ tela?: string; cenario?: string }>;
}) {
  const { tela, cenario } = await searchParams;
  const vazio = cenario === "vazio";
  const inicial = (!vazio && tela && TELAS[tela]) || (tela === "leads" ? TELAS.leads : TELAS.campanhas);

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      {/* Sem item próprio no menu: a rota de verdade ainda não existe. */}
      <NavRail clientName="O Bom Sobrinho" activeHref="/clientes" role="dono" ehAdmin />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PreviaDeCampanhas tela={inicial} agora={agoraMs()} vazio={vazio} />
      </div>
    </div>
  );
}
