"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Circle, Rocket } from "lucide-react";
import type { OnboardingState } from "@/lib/onboarding";

// Trilho de configuração da conta, mostrado em toda página do app enquanto o
// agente não estiver publicado. Não é um wizard paralelo: cada passo leva para a
// tela que já existe. Some sozinho quando o onboarding termina (o layout não
// renderiza mais), então não tem botão de fechar: fechar daria a sensação de
// pronto sem estar.
export default function OnboardingBar({ state }: { state: OnboardingState }) {
  const [aberto, setAberto] = useState(false);
  const { steps, done, total, next } = state;

  return (
    <div className="glass shrink-0 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <Rocket size={17} className="shrink-0 text-accent" />

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            Configurar sua conta
            <span className="ml-2 text-xs font-normal text-ink-muted">
              {done} de {total}
            </span>
          </p>
          {next && (
            <p className="truncate text-xs text-ink-muted">
              Próximo: {next.label.toLowerCase()}. {next.hint}
            </p>
          )}
        </div>

        {/* Barra de progresso: leitura de relance, sem precisar abrir. */}
        <div
          className="ml-auto hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-panel sm:block"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>

        {next && (
          <Link
            href={next.href}
            className="btn-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition"
          >
            {next.cta}
          </Link>
        )}

        <button
          onClick={() => setAberto((v) => !v)}
          className="shrink-0 rounded-lg border border-line px-2 py-1.5 text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          aria-expanded={aberto}
          aria-label={aberto ? "Esconder passos" : "Ver todos os passos"}
          title={aberto ? "Esconder passos" : "Ver todos os passos"}
        >
          {aberto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {aberto && (
        <ol className="mt-3 space-y-1 border-t border-line pt-3">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5 py-1">
              {s.done ? (
                <Check size={15} className="shrink-0 text-ia" />
              ) : (
                <Circle
                  size={15}
                  className={s.enabled ? "shrink-0 text-accent" : "shrink-0 text-ink-dim"}
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm ${
                    s.done ? "text-ink-muted line-through" : "font-medium"
                  }`}
                >
                  {s.label}
                </p>
                {!s.done && (
                  <p className="truncate text-xs text-ink-muted">{s.hint}</p>
                )}
              </div>
              {!s.done && s.enabled && (
                <Link
                  href={s.href}
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs transition-colors hover:border-line-strong"
                >
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
