import NavRail from "@/components/NavRail";
import { agoraMs } from "@/lib/periodo";
import AgendaConfig from "./AgendaConfig";
import { EMPRESA } from "../dados";

// Protótipo do bloco de configuração da AGENDA (docs/plano-agenda.md), dev-only,
// liberado pelo proxy. Sem Google: `?conectada=0` mostra antes de conectar.
export const dynamic = "force-dynamic";

export default async function DesignAgendaConfigurarPage({
  searchParams,
}: {
  searchParams: Promise<{ conectada?: string }>;
}) {
  const { conectada } = await searchParams;
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName={EMPRESA} activeHref="/agente" role="dono" />
      <AgendaConfig agora={agoraMs()} conectadaInicial={conectada !== "0"} />
    </div>
  );
}
