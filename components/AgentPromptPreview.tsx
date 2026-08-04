"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { LIMITS } from "@/lib/agent-prompt";

// Preview do prompt final (o texto exato que o n8n usa). Só texto — nunca HTML.
export default function AgentPromptPreview({ persona }: { persona: string }) {
  const [copied, setCopied] = useState(false);
  const chars = persona.length;
  const tokens = Math.round(chars / 3.7);
  const warn = chars > LIMITS.personaWarn;

  async function copy() {
    try {
      await navigator.clipboard.writeText(persona);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sem clipboard; ignora
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-dim">
          Prompt gerado
        </div>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>

      <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-[var(--input-bg)] p-3.5 font-sans text-[12.5px] leading-[19px] text-ink-muted">
        {persona || "Preencha os campos para gerar o prompt."}
      </pre>

      <div
        className={`mt-2 text-[11px] ${warn ? "text-warn" : "text-ink-dim"}`}
      >
        {chars.toLocaleString("pt-BR")} caracteres · ~{tokens.toLocaleString("pt-BR")} tokens · enviado em toda mensagem
        {warn && " · prompt longo, considere encurtar os detalhes"}
      </div>
    </div>
  );
}
