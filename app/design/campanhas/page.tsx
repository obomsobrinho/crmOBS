import NavRail from "@/components/NavRail";
import { ABAS_DE_CAMPANHAS, type AbaDeCampanhas } from "@/components/admin/campanhas/tipos";
import { agoraMs } from "@/lib/periodo";
import PreviaDeCampanhas from "./PreviaDeCampanhas";

// Preview de Campanhas, a prospecção do dono do produto (docs/plano-campanhas.md).
// Dev-only, sem banco e sem sessão: empresas de mentira, nenhuma busca paga,
// nenhuma mensagem enviada. `?aba=fila|leads|resultados|campanha` abre na aba;
// `?cenario=vazia` mostra a campanha sem nenhum lead.
export const dynamic = "force-dynamic";

export default async function DesignCampanhasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; cenario?: string }>;
}) {
  const { aba, cenario } = await searchParams;
  const abaInicial: AbaDeCampanhas = ABAS_DE_CAMPANHAS.includes(aba as AbaDeCampanhas) ? (aba as AbaDeCampanhas) : "fila";

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      {/* Sem item próprio no menu: a rota de verdade ainda não existe (decisão D12). */}
      <NavRail clientName="O Bom Sobrinho" activeHref="/clientes" role="dono" ehAdmin />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:gap-3">
        <PreviaDeCampanhas aba={abaInicial} agora={agoraMs()} vazia={cenario === "vazia"} />
      </div>
    </div>
  );
}
