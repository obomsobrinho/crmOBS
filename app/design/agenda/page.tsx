import NavRail from "@/components/NavRail";
import { agoraMs } from "@/lib/periodo";
import { AgendaDeMemoria } from "./AgendaDeMemoria";
import { EMPRESA } from "./dados";

// Preview da AGENDA (docs/plano-agenda.md), dev-only, liberado pelo proxy. A
// tela de verdade (grade semanal) com a fonte em memória: marcar, remarcar,
// cancelar e bloquear funcionam nesta aba, sem banco. `?vazio=1` sem horários,
// `?indisponivel=1` como fica antes da migration, `?semhorario=1` sem horário
// de atendimento, `?papel=atendente` sem a engrenagem, `?horario=obs|curto` com o
// horário curto da OBS ou de uma hora por dia (quarta fechada), `?agora=` (instante
// ISO) com o relógio fixo, para testar a linha do agora. Configurações em
// /design/agenda/configuracoes.
export const dynamic = "force-dynamic";

export default async function DesignAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vazio?: string; indisponivel?: string; semhorario?: string; papel?: string; horario?: string; agora?: string }>;
}) {
  const { vazio, indisponivel, semhorario, papel, horario, agora } = await searchParams;
  const fixo = agora ? Date.parse(agora) : NaN;
  const atendente = papel === "atendente";
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName={EMPRESA} activeHref="/agenda" role={atendente ? "atendente" : "dono"} agendaAtiva />
      <AgendaDeMemoria
        agora={Number.isFinite(fixo) ? fixo : agoraMs()}
        horario={horario}
        dono={!atendente}
        disponivel={indisponivel !== "1"}
        semHorario={semhorario === "1"}
        vazio={vazio === "1"}
      />
    </div>
  );
}
