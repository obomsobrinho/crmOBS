"use client";

import { useState } from "react";

import type { BusinessHours, DayKey } from "@/lib/agent-prompt";
import { DAY_ORDER, DAY_LABEL } from "@/lib/agent-prompt";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const UTEIS: DayKey[] = ["seg", "ter", "qua", "qui", "sex"];

/**
 * "Segunda a sexta no mesmo horário, fim de semana fechado" é a forma que o
 * dono descreveu como a normal, e é a que o editor passou a abrir (22/09/2026:
 * "poderia ter algo assim, seg a sexta e coloca o horário, se eu quiser
 * personalizar clico em outro botão e aí sim eu ajusto dia por dia").
 *
 * ⚠️ ISTO NÃO É CAMPO NOVO NO `agent_config`. O banco continua guardando os 7
 * dias (`BusinessHours`), e o modo simples é só um jeito de escrever os 7 de
 * uma vez. Guardar "é simples" como dado criaria uma segunda verdade sobre o
 * mesmo horário, e a primeira divergência apareceria no prompt do agente, que
 * lê só os 7 dias.
 */
export function ehHorarioSimples(v: BusinessHours): boolean {
  const ref = v.seg;
  if (!ref?.open) return false;
  if (!UTEIS.every((d) => v[d]?.open && v[d].from === ref.from && v[d].to === ref.to))
    return false;
  return !v.sab?.open && !v.dom?.open;
}

// Editor de horário de atendimento, em dois modos: o simples (uma linha) e o
// dia a dia (as 7 linhas de sempre).
export default function AgentHoursEditor({
  value,
  onChange,
}: {
  value: BusinessHours;
  onChange: (next: BusinessHours) => void;
}) {
  /**
   * ⚠️ O modo NASCE do valor, e um horário irregular abre direto no dia a dia.
   * Abrir no simples achataria na tela o que a pessoa configurou (o sábado de
   * manhã sumiria da vista continuando gravado), e ela só descobriria pelo que
   * o agente respondesse ao cliente.
   *
   * Só o estado INICIAL: valor que chega depois (aplicar um modelo, por
   * exemplo) não arrasta a pessoa para outro modo no meio da edição.
   */
  const [modo, setModo] = useState<"simples" | "dias">(() =>
    ehHorarioSimples(value) ? "simples" : "dias",
  );

  function setDay(day: DayKey, patch: Partial<BusinessHours[DayKey]>) {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  }

  /** Escreve os 5 dias úteis de uma vez e fecha o fim de semana. */
  function setSemana(patch: { from?: string; to?: string }) {
    const next = { ...value } as BusinessHours;
    const from = patch.from ?? value.seg.from;
    const to = patch.to ?? value.seg.to;
    UTEIS.forEach((d) => {
      next[d] = { open: true, from, to };
    });
    next.sab = { ...next.sab, open: false };
    next.dom = { ...next.dom, open: false };
    onChange(next);
  }

  function copyWeekdays() {
    const ref = value.seg;
    const next = { ...value };
    UTEIS.forEach((d) => {
      next[d] = { open: true, from: ref.from, to: ref.to };
    });
    onChange(next);
  }

  function allDay() {
    const next = { ...value } as BusinessHours;
    DAY_ORDER.forEach((d) => {
      next[d] = { ...next[d], from: "00:00", to: "23:59" };
    });
    onChange(next);
  }

  if (modo === "simples") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-apoio">Segunda a sexta, das</span>
          <Input
            type="time"
            aria-label="Abre às"
            value={value.seg.from}
            onChange={(e) => setSemana({ from: e.target.value })}
            className="h-[var(--h-control)] w-auto px-2"
          />
          <span className="text-apoio text-ink-3">às</span>
          <Input
            type="time"
            aria-label="Fecha às"
            value={value.seg.to}
            onChange={(e) => setSemana({ to: e.target.value })}
            className="h-[var(--h-control)] w-auto px-2"
          />
        </div>
        <p className="text-legenda text-ink-3">
          Sábado e domingo ficam fechados. Para abrir no fim de semana, ou para
          ter horário diferente em algum dia, personalize por dia.
        </p>
        <Button variant="outline" onClick={() => setModo("dias")}>
          Personalizar por dia
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {DAY_ORDER.map((d) => {
          const day = value[d];
          return (
            <div key={d} className="flex items-center gap-3">
              <label className="flex w-32 shrink-0 items-center gap-2 text-apoio">
                <Checkbox
                  checked={day.open}
                  onCheckedChange={(v) => setDay(d, { open: v === true })}
                />
                <span className={day.open ? "" : "text-ink-3"}>
                  {cap(DAY_LABEL[d])}
                </span>
              </label>
              {day.open ? (
                <div className="flex items-center gap-2">
                  {/* Degrau de controle (32px) e não o de campo (40px): sete
                      destas linhas empilhadas com 40px viram uma parede. */}
                  <Input
                    type="time"
                    value={day.from}
                    onChange={(e) => setDay(d, { from: e.target.value })}
                    className="h-[var(--h-control)] w-auto px-2"
                  />
                  <span className="text-apoio text-ink-3">às</span>
                  <Input
                    type="time"
                    value={day.to}
                    onChange={(e) => setDay(d, { to: e.target.value })}
                    className="h-[var(--h-control)] w-auto px-2"
                  />
                </div>
              ) : (
                <span className="text-apoio text-ink-3">Fechado</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {/* ⚠️ Volta achatando de propósito, e o rótulo é a advertência: quem
            clica em "segunda a sexta" está pedindo segunda a sexta. O que não
            pode existir é o achatamento SILENCIOSO, e por isso o modo nunca
            nasce simples quando o valor é irregular. */}
        <Button variant="outline" onClick={() => { setSemana({}); setModo("simples"); }}>
          Voltar para segunda a sexta
        </Button>
        <Button variant="outline" onClick={copyWeekdays}>
          Copiar seg. para os dias úteis
        </Button>
        <Button variant="outline" onClick={allDay}>
          24h todos os dias
        </Button>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
