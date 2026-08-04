"use client";

import type { BusinessHours, DayKey } from "@/lib/agent-prompt";
import { DAY_ORDER, DAY_LABEL } from "@/lib/agent-prompt";

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
              <label className="flex w-32 shrink-0 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) => setDay(d, { open: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className={day.open ? "" : "text-ink-dim"}>
                  {cap(DAY_LABEL[d])}
                </span>
              </label>
              {day.open ? (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    value={day.from}
                    onChange={(e) => setDay(d, { from: e.target.value })}
                    className="rounded-lg border border-line bg-surface px-2 py-1 outline-none transition-colors focus:border-line-strong"
                  />
                  <span className="text-ink-dim">às</span>
                  <input
                    type="time"
                    value={day.to}
                    onChange={(e) => setDay(d, { to: e.target.value })}
                    className="rounded-lg border border-line bg-surface px-2 py-1 outline-none transition-colors focus:border-line-strong"
                  />
                </div>
              ) : (
                <span className="text-sm text-ink-dim">Fechado</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={copyWeekdays}
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink"
        >
          Copiar seg. para os dias úteis
        </button>
        <button
          type="button"
          onClick={allDay}
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink"
        >
          24h todos os dias
        </button>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
