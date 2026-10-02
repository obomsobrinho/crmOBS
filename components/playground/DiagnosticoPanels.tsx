"use client";

import type { TurnDiagnostics } from "@/lib/agent-diagnostics";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bloco p-4">
      <div className="mb-2.5 text-rotulo uppercase text-ink-3">{title}</div>
      {children}
    </div>
  );
}

function actionLabel(action: string): string {
  if (action === "agendar") return "Marcar conversa com o time";
  if (action === "pausar") return "Pediu uma pessoa do time";
  return "Segue a conversa";
}

// Só leitura (29/09/2026): orientar mora na CONVERSA de teste, no molde da
// caixa da tela de Conversas. Aqui fica o que a IA decidiu e por quê.
export function HandoffPanel({ diag }: { diag: TurnDiagnostics | null }) {
  const open = !!diag?.handoffOpened;
  return (
    <Panel title="Handoff">
      <div className="space-y-2.5">
        {open ? (
          <div className="rounded-lg bg-warn-surface px-3 py-2.5">
            <div className="text-legenda font-semibold text-warn-ink">
              {diag!.guardrail.blocked
                ? "O guardrail segurou a resposta"
                : "A IA abriu handoff"}
            </div>
            <p className="mt-1 text-apoio leading-snug text-ink">
              {diag!.guardrail.blocked
                ? diag!.guardrail.reason
                : diag!.summary || actionLabel(diag!.action)}
            </p>
            {diag!.guardrail.blocked && diag!.guardrail.draft && (
              <p className="mt-1.5 text-legenda leading-snug italic text-ink-2">
                Ia dizer: {diag!.guardrail.draft}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-raised px-3 py-2.5 text-apoio text-ink-2">
            {diag
              ? "Nenhum handoff neste turno. A IA seguiu sozinha."
              : "Nenhum pedido de ajuda. Quando a IA precisar do time, o pedido aparece na conversa para você orientar."}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function ClassificationPanel({
  diag,
  simStage,
  stageNames,
}: {
  diag: TurnDiagnostics | null;
  simStage: string | null;
  stageNames: Record<string, string>;
}) {
  const P = "aguardando";
  const stageLabel = (key: string | null) =>
    key ? stageNames[key] ?? key : null;
  return (
    <Panel title="Classificação">
      <div className="space-y-3 text-apoio">
        <Field label="Ação" value={diag ? actionLabel(diag.action) : P} />
        <Field
          label="Guardrail"
          value={
            !diag
              ? P
              : diag.guardrail.blocked
                ? `Segurou: ${diag.guardrail.reason}`
                : "Passou sem bloqueio"
          }
        />
        <Field
          label="Estágio que moveria"
          value={diag ? stageLabel(diag.stageWouldMove) ?? "não move o card" : P}
        />
        <Field
          label="Estágio atual (simulado)"
          value={stageLabel(simStage) ?? "inicial"}
        />
        <div>
          <div className="text-rotulo uppercase text-ink-3">
            Base de conhecimento
          </div>
          {!diag ? (
            <div className="text-apoio text-ink-2">aguardando o 1º turno</div>
          ) : !diag.ragSearched ? (
            <div className="text-apoio text-ink-2">
              Sem base cadastrada neste tenant.
            </div>
          ) : diag.ragMatches.length === 0 ? (
            <div className="text-apoio text-ink-2">
              Buscou, nada relevante voltou.
            </div>
          ) : (
            <ul className="mt-1 space-y-1">
              {diag.ragMatches.map((m, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-2 rounded-lg bg-raised px-2.5 py-1.5"
                  title={m.preview}
                >
                  <span className="shrink-0 text-legenda font-semibold tabular-nums text-human-ink">
                    {(m.similarity * 100).toFixed(0)}%
                  </span>
                  <span className="line-clamp-1 text-legenda leading-snug text-ink-2">
                    {m.preview}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function SummaryPanel({ diag }: { diag: TurnDiagnostics | null }) {
  return (
    <Panel title="Resumo">
      <div className="space-y-3 text-apoio">
        <Field
          label="Resumo do caso"
          value={diag ? diag.summary || "sem resumo" : "aguardando"}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field
            label="Preferência de horário"
            value={
              !diag ? "aguardando" : diag.preferenciaHorario || "não informado"
            }
          />
          <Field
            label="Latência"
            value={
              !diag
                ? "aguardando"
                : diag.latencyMs < 1000
                  ? `${diag.latencyMs} ms`
                  : `${(diag.latencyMs / 1000).toFixed(1)} s`
            }
          />
        </div>
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-rotulo uppercase text-ink-3">{label}</div>
      <div className="text-apoio font-medium text-ink">{value}</div>
    </div>
  );
}
