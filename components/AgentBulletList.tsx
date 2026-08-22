"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
              className="flex items-start gap-2 rounded-lg border border-line bg-bloco px-3 py-2 text-apoio"
            >
              {/* `ink-faint` e não `ink-3`: o marcador é ornamento de lista, e
                  a regra dos quatro níveis reserva o faint para ícone e
                  divisor, que é exatamente o papel dele aqui. */}
              <span className="mt-0.5 shrink-0 text-ink-faint">•</span>
              <span className="min-w-0 flex-1 break-words">{item}</span>
              <Button
                variant="danger-ghost"
                size="none"
                onClick={() => remove(i)}
                aria-label={`Remover: ${item}`}
                className="rounded"
              >
                <X size={15} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
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
        />
        <Button
          variant="outline"
          size="field"
          onClick={add}
          disabled={!draft.trim()}
        >
          <Plus size={14} /> Adicionar
        </Button>
      </div>
    </div>
  );
}
