import NavRail from "@/components/NavRail";
import Playground, { type PlaygroundTurn } from "@/components/Playground";
import type { TurnDiagnostics } from "@/lib/agent-diagnostics";

// Preview de design do Playground (dev-only, liberado pelo proxy). Começa com uma
// conversa de exemplo já com handoff aberto, para exercitar os 3 painéis.
export const dynamic = "force-dynamic";

const STAGE_NAMES: Record<string, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  aguardando_humano: "Aguardando atendimento",
  fechado: "Fechado",
};

const diag = (over: Partial<TurnDiagnostics>): TurnDiagnostics => ({
  latencyMs: 1840,
  action: "none",
  summary: "",
  preferenciaHorario: "",
  ragSearched: true,
  ragMatches: [
    {
      similarity: 0.62,
      preview: "Aceitamos PIX, cartão e boleto. Parcelamos em até 6x sem juros.",
    },
  ],
  stageWouldMove: null,
  guardrail: { blocked: false, reason: null, draft: null },
  handoffOpened: false,
  ...over,
});

const TURNS: PlaygroundTurn[] = [
  { role: "user", content: "Oi! Como funciona o pagamento de vocês?" },
  {
    role: "assistant",
    content:
      "Oi! Aceitamos PIX, cartão e boleto, e dá pra parcelar em até 6x sem juros. Posso te ajudar com mais alguma coisa?",
    diag: diag({ action: "none" }),
  },
  { role: "user", content: "Vocês têm atendimento de emergência pra daqui meia hora?" },
  {
    // Handoff silencioso: a IA não envia nada, só abre o handoff.
    role: "assistant",
    content: "",
    diag: diag({
      action: "pausar",
      summary: "Cliente quer um atendimento de emergência em cerca de 30 minutos.",
      stageWouldMove: "aguardando_humano",
      handoffOpened: true,
      ragMatches: [
        { similarity: 0.41, preview: "Encaixes de urgência dependem da agenda do dia." },
      ],
    }),
  },
];

export default function DesignPlaygroundPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/playground" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-6">
          <Playground stageNames={STAGE_NAMES} initialTurns={TURNS} />
        </div>
      </div>
    </div>
  );
}
