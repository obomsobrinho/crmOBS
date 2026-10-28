import NavRail from "@/components/NavRail";
import { agoraMs } from "@/lib/periodo";
import AgendaLista from "./AgendaLista";
import { EMPRESA } from "./dados";

// Protótipo da AGENDA (docs/plano-agenda.md), dev-only, liberado pelo proxy.
// Sem banco e sem Google: horários falsos de hoje em diante. `?vazio=1` mostra
// a lista sem horário; `?desconectada=1`, a faixa de quando o Google desconecta.
// A configuração (o bloco de "O que ele pode fazer") está em
// /design/agenda/configurar.
export const dynamic = "force-dynamic";

export default async function DesignAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vazio?: string; desconectada?: string }>;
}) {
  const { vazio, desconectada } = await searchParams;
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      {/* "Agenda" ainda é "Em breve" no menu: o protótipo não mexe no NavRail. */}
      <NavRail clientName={EMPRESA} activeHref="/agenda" role="dono" />
      <AgendaLista agora={agoraMs()} vazio={vazio === "1"} desconectada={desconectada === "1"} />
    </div>
  );
}
