import NavRail from "@/components/NavRail";
import { agoraMs } from "@/lib/periodo";
import { ConfiguracaoDeMemoria } from "../AgendaDeMemoria";
import { EMPRESA } from "../dados";

// Preview das CONFIGURAÇÕES DA AGENDA, dev-only. `?desligada=1` abre com a
// agenda desligada (o menu, no app, perde o item); `?semhorario=1` sem horário
// de atendimento. Salvar só muda esta aba.
export const dynamic = "force-dynamic";

export default async function DesignConfiguracoesDaAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ desligada?: string; semhorario?: string }>;
}) {
  const { desligada, semhorario } = await searchParams;
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName={EMPRESA} activeHref="/agenda" role="dono" agendaAtiva={desligada !== "1"} />
      <ConfiguracaoDeMemoria agora={agoraMs()} desligada={desligada === "1"} semHorario={semhorario === "1"} />
    </div>
  );
}
