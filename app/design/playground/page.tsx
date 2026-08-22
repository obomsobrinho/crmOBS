import NavRail from "@/components/NavRail";
import AgentTestDrawer from "@/components/AgentTestDrawer";
import { type PlaygroundTurn } from "@/components/Playground";
import { Card } from "@/components/ui/card";
import { EMPTY_CONFIG } from "@/lib/agent-prompt";
import type { TurnDiagnostics } from "@/lib/agent-diagnostics";

// Preview de design da bancada de teste (dev-only, liberado pelo proxy).
//
// A bancada não é mais tela própria: virou painel lateral dentro do `/agente`.
// Este preview abre o painel já aberto, com uma conversa de exemplo que termina
// em handoff, para exercitar os 3 painéis de diagnóstico sem login e sem chamada
// ao modelo.
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
    // Turno sem mensagem: exercita o aviso central de handoff na conversa.
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
      <NavRail clientName="Ótica Vision" activeHref="/agente" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <AgentTestDrawer
            configuracao={{ mode: "guiado", config: EMPTY_CONFIG }}
            stageNames={STAGE_NAMES}
            defaultOpen
            initialTurns={TURNS}
          />
        </Card>
      </div>
    </div>
  );
}
