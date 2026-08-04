"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

// Lista editável de frases curtas (ex.: o que NÃO fazer, quando chamar humano).
export default function AgentBulletList({
  value,
  onChange,
  onDraftChange,
  placeholder = "Adicionar…",
  maxLen = 200,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Avisa o pai do rascunho ainda não adicionado (p/ salvar mesmo sem clicar "Adicionar"). */
  onDraftChange?: (draft: string) => void;
  placeholder?: string;
  maxLen?: number;
}) {
  const [draft, setDraft] = useState("");

  function setDraftBoth(v: string) {
    setDraft(v);
    onDraftChange?.(v);
  }

  function add() {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v.slice(0, maxLen)]);
    setDraftBoth("");
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            >
              <span className="mt-0.5 shrink-0 text-ink-dim">•</span>
              <span className="min-w-0 flex-1 break-words">{item}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remover: ${item}`}
                className="shrink-0 text-ink-dim transition-colors hover:text-danger"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={draft}
          maxLength={maxLen}
          onChange={(e) => setDraftBoth(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink disabled:opacity-50"
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>
    </div>
  );
}
