import NavRail from "@/components/NavRail";
import { agoraMs } from "@/lib/periodo";
import AgendaDeMemoria from "./AgendaDeMemoria";
import { EMPRESA } from "./dados";

// Preview da AGENDA (docs/plano-agenda.md), dev-only, liberado pelo proxy. A
// tela de verdade com a fonte em memória: marcar, remarcar, cancelar, bloquear
// e configurar funcionam nesta aba, sem banco. `?vazio=1` sem horários,
// `?indisponivel=1` como fica antes da migration, `?semhorario=1` sem horário
// de atendimento, `?papel=atendente` sem a configuração.
export const dynamic = "force-dynamic";

export default async function DesignAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vazio?: string; indisponivel?: string; semhorario?: string; papel?: string }>;
}) {
  const { vazio, indisponivel, semhorario, papel } = await searchParams;
  const atendente = papel === "atendente";
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName={EMPRESA} activeHref="/agenda" role={atendente ? "atendente" : "dono"} />
      <AgendaDeMemoria
        agora={agoraMs()}
        empresa={EMPRESA}
        dono={!atendente}
        disponivel={indisponivel !== "1"}
        temHorario={semhorario !== "1"}
        querAgendar
        vazio={vazio === "1"}
      />
    </div>
  );
}
