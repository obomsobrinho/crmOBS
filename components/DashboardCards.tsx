import { MessagesSquare, Bot, BadgeCheck, Timer, type LucideIcon } from "lucide-react";
import { formatDuration, type DashboardMetrics } from "@/lib/metrics";

// Painel mínimo: 4 números em linguagem de dono (não é BI). Componente puro de
// apresentação (sem estado): a página calcula e passa as métricas; o /design
// passa mocks. Janela de 7 dias.
function Card({
  icon: Icon,
  value,
  label,
  helper,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-bloco p-5">
      <div className="flex items-center gap-2 text-ink-2">
        <Icon size={16} className="text-brand-ink" />
        <span className="text-apoio font-medium">{label}</span>
      </div>
      <div className="mt-3 font-display text-display tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-legenda text-ink-3">{helper}</div>
    </div>
  );
}

export default function DashboardCards({ metrics }: { metrics: DashboardMetrics }) {
  const { conversasSemana, semIntervencao, leadsQualificados, primeiraRespostaMs } =
    metrics;
  const pct =
    conversasSemana > 0
      ? Math.round((semIntervencao / conversasSemana) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        icon={MessagesSquare}
        value={String(conversasSemana)}
        label="Conversas na semana"
        helper="com mensagem nos últimos 7 dias"
      />
      <Card
        icon={Bot}
        value={String(semIntervencao)}
        label="Atendidas sem você"
        helper={
          conversasSemana > 0
            ? `${pct}% das conversas, a IA resolveu sozinha`
            : "a IA resolveu sozinha"
        }
      />
      <Card
        icon={BadgeCheck}
        value={String(leadsQualificados)}
        label="Leads qualificados"
        helper="a IA identificou e resumiu para você"
      />
      <Card
        icon={Timer}
        value={formatDuration(primeiraRespostaMs)}
        label="Tempo de 1a resposta"
        helper="média até o primeiro retorno ao cliente"
      />
    </div>
  );
}
