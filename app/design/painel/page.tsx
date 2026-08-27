import { LayoutDashboard } from "lucide-react";
import NavRail from "@/components/NavRail";
import DashboardCards from "@/components/DashboardCards";
import DashboardBarras from "@/components/DashboardBarras";
import ValorResumo from "@/components/ValorResumo";
import { barrasPorDia, type DashboardMetrics } from "@/lib/metrics";
import { frasesDeValor, rotuloDoMes, type ValorResumo as Resumo } from "@/lib/valor";

// Preview de design do Painel (dev-only, liberado pelo proxy).
//
// ⚠️ Ele renderiza a tela INTEIRA, com a manchete de valor. Antes mostrava só os
// quatro cartões de operação, então quem revisava o painel pelo /design revisava
// meia tela: a manchete, que é o elemento mais forte, não aparecia.
export const dynamic = "force-dynamic";

const MOCK: DashboardMetrics = {
  conversasSemana: 42,
  semIntervencao: 31,
  leadsQualificados: 9,
  primeiraRespostaMs: 8000,
};

// Semana anterior, para os selos de variação: autonomia subiu, leads subiram e a
// resposta ficou mais rápida (o selo de tempo tem direção invertida).
const ANTERIOR: DashboardMetrics = {
  conversasSemana: 39,
  semIntervencao: 26,
  leadsQualificados: 6,
  primeiraRespostaMs: 21000,
};

const PERIODO = rotuloDoMes(2026, 7);

const MES: Resumo = {
  recebidas: 486,
  atendidasForaDoHorario: 213,
  atendidasEmFimDeSemanaOuFeriado: 47,
  conversasSemHumano: 38,
  leadsQualificados: 19,
  pedidosDeAgendamento: 6,
  respostasEmMenosDeUmMinuto: 122,
  primeiraRespostaMs: 42000,
  pico: { diaSemana: 0, hora: 17, mensagens: 31 },
  temHorario: true,
};

const ACUMULADO: Resumo = {
  recebidas: 4312,
  atendidasForaDoHorario: 1876,
  atendidasEmFimDeSemanaOuFeriado: 402,
  conversasSemHumano: 311,
  leadsQualificados: 164,
  pedidosDeAgendamento: 52,
  respostasEmMenosDeUmMinuto: 1094,
  primeiraRespostaMs: 39000,
  pico: { diaSemana: 0, hora: 17, mensagens: 268 },
  temHorario: true,
};

// Mensagens sintéticas dos últimos 14 dias, para as barras. Geradas relativas a
// "agora" porque `barrasPorDia` monta a janela a partir de agora: com datas fixas
// o preview ficaria com o gráfico vazio no dia seguinte.
const AGORA = Date.now();
const MSGS = Array.from({ length: 14 }).flatMap((_, i) => {
  const dia = AGORA - (13 - i) * 24 * 60 * 60 * 1000;
  // Volume variado, com um dia SEM movimento (índice 4) para provar que o
  // gráfico mostra o buraco em vez de encurtar o eixo.
  const ia = i === 4 ? 0 : 6 + ((i * 5) % 17);
  const time = i === 4 ? 0 : i % 4 === 0 ? 3 : 1;
  const linha = (tipo: string) => ({
    bot_message: "resposta",
    message_type: tipo,
    created_at: new Date(dia).toISOString(),
  });
  return [
    ...Array.from({ length: ia }, () => linha("ai")),
    ...Array.from({ length: time }, () => linha("manual")),
  ];
});

export default function DesignPainelPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      {/* Sem cartão de página, igual à tela real: os cartões flutuam sobre o
          canvas (`Stat variant="elevado"`). */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <LayoutDashboard size={20} className="text-brand-ink" />
            <h1 className="text-titulo">Painel</h1>
          </div>
          <p className="text-apoio text-ink-2">
            O que a IA fez pela conta Ótica Vision e como está a semana.
          </p>
        </div>

        <ValorResumo
          resumo={MES}
          frases={frasesDeValor(MES, PERIODO)}
          periodo={PERIODO}
          acumulado={ACUMULADO}
          frasesAcumuladas={frasesDeValor(ACUMULADO, "desde o início")}
        />

        <DashboardCards metrics={MOCK} anterior={ANTERIOR} esperando={2} />

        <DashboardBarras dias={barrasPorDia(MSGS, 14, AGORA)} />
      </div>
    </div>
  );
}
