import { LayoutDashboard } from "lucide-react";
import NavRail from "@/components/NavRail";
import DashboardCards from "@/components/DashboardCards";
import type { DashboardMetrics } from "@/lib/metrics";

// Preview de design do Painel (dev-only, liberado pelo proxy). Métricas mock.
export const dynamic = "force-dynamic";

const MOCK: DashboardMetrics = {
  conversasSemana: 42,
  semIntervencao: 31,
  leadsQualificados: 9,
  primeiraRespostaMs: 8000,
};

export default function DesignPainelPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-6">
          <div className="mb-1 flex items-center gap-2">
            <LayoutDashboard size={20} className="text-accent" />
            <h1 className="font-display text-xl font-bold">Painel</h1>
          </div>
          <p className="mb-5 text-sm text-ink-muted">
            Um resumo da conta Ótica Vision nos últimos 7 dias.
          </p>
          <DashboardCards metrics={MOCK} />
        </div>
      </div>
    </div>
  );
}
