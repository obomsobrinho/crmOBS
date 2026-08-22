"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Circle, Rocket } from "lucide-react";
import type { OnboardingState } from "@/lib/onboarding";
import { buttonVariants } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Trilho de configuração da conta, mostrado em toda página do app enquanto o
// agente não estiver publicado. Não é um wizard paralelo: cada passo leva para a
// tela que já existe. Some sozinho quando o onboarding termina (o layout não
// renderiza mais), então não tem botão de fechar: fechar daria a sensação de
// pronto sem estar.
export default function OnboardingBar({ state }: { state: OnboardingState }) {
  const [aberto, setAberto] = useState(false);
  const { steps, done, total, next } = state;

  return (
    <div className={cn(cardVariants(), "shrink-0 px-4 py-3")}>
      <div className="flex items-center gap-3">
        <Rocket size={17} className="shrink-0 text-brand-ink" />

        <div className="min-w-0">
          <p className="truncate text-apoio font-medium">
            Configurar sua conta
            <span className="ml-2 text-legenda font-normal tabular-nums text-ink-2">
              {done} de {total}
            </span>
          </p>
          {next && (
            <p className="truncate text-legenda text-ink-2">
              Próximo: {next.label.toLowerCase()}. {next.hint}
            </p>
          )}
        </div>

        {/* Barra de progresso: leitura de relance, sem precisar abrir. */}
        <div
          className="ml-auto hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-[var(--chip-bg)] sm:block"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>

        {next && (
          <Link
            href={next.href}
            className={cn(buttonVariants(), "shrink-0")}
          >
            {next.cta}
          </Link>
        )}

        <button
          onClick={() => setAberto((v) => !v)}
          className={cn(buttonVariants({ variant: "outline", size: "icon-control" }), "shrink-0")}
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
                <Check size={15} className="shrink-0 text-human-ink" />
              ) : (
                <Circle
                  size={15}
                  className={s.enabled ? "shrink-0 text-brand-ink" : "shrink-0 text-ink-faint"}
                />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-apoio ${
                    s.done ? "text-ink-3 line-through" : "font-medium"
                  }`}
                >
                  {s.label}
                </p>
                {!s.done && (
                  <p className="truncate text-legenda text-ink-2">{s.hint}</p>
                )}
              </div>
              {!s.done && s.enabled && (
                <Link
                  href={s.href}
                  className={cn(buttonVariants({ variant: "outline", size: "chrome" }), "shrink-0")}
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
