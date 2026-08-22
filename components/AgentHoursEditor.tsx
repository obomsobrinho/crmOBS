"use client";

import type { BusinessHours, DayKey } from "@/lib/agent-prompt";
import { DAY_ORDER, DAY_LABEL } from "@/lib/agent-prompt";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

// Editor de horário de atendimento: 7 linhas (checkbox + dois horários).
export default function AgentHoursEditor({
  value,
  onChange,
}: {
  value: BusinessHours;
  onChange: (next: BusinessHours) => void;
}) {
  function setDay(day: DayKey, patch: Partial<BusinessHours[DayKey]>) {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  }

  function copyWeekdays() {
    const ref = value.seg;
    const next = { ...value };
    (["seg", "ter", "qua", "qui", "sex"] as DayKey[]).forEach((d) => {
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
