"use client";

import { useState } from "react";
import { Send, Paperclip, Bot, Hand } from "lucide-react";
import QuickReplyPicker from "./QuickReplyPicker";

export default function MessageComposer({
  onSend,
  iaAtiva,
  clientId,
}: {
  onSend: (text: string) => void | Promise<void>;
  iaAtiva?: boolean;
  clientId: string;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const canSend = !!text.trim();

  function insertReply(body: string) {
    setText((t) => (t.trim() ? `${t}\n${body}` : body));
  }

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    void onSend(t);
    setText("");
  };

  return (
    <div className="border-t border-line bg-surface px-3 pb-3 pt-2.5">
      {/* Estado do atendimento — é o aviso mais importante da tela, então tem
          peso de banner (não rodapé cinza). */}
      {iaAtiva === true && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-[3px] border-l-[var(--accent)] bg-[var(--input-bg)] px-3 py-2 text-[12.5px] text-ink">
          <Bot size={14} className="shrink-0 text-accent" />
          <span>
            A IA está atendendo — ao enviar, <strong className="font-semibold">você assume</strong> a conversa.
          </span>
        </div>
      )}
      {iaAtiva === false && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-[3px] border-l-[var(--ia)] bg-[var(--ia-bg)] px-3 py-2 text-[12.5px] text-ink">
          <Hand size={14} className="shrink-0 text-ia" />
          <span>Você está atendendo — a IA não responde nesta conversa.</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <button
          type="button"
          disabled
          title="Anexos em breve"
          aria-label="Anexar"
          className="flex h-[34px] w-[34px] shrink-0 cursor-not-allowed items-center justify-center rounded-lg text-ink-dim/60"
        >
          <Paperclip size={18} />
        </button>
        <QuickReplyPicker clientId={clientId} onPick={insertReply} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Escreva uma mensagem"
          className="flex-1 resize-none rounded-xl border border-line bg-[var(--input-bg)] px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-line-strong"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
            canSend
              ? "btn-send"
              : "cursor-not-allowed bg-panel text-ink-dim"
          }`}
        >
          <Send size={19} />
        </button>
      </form>

      {/* A dica só aparece em foco — não ocupa o campo inteiro. */}
      <div
        className={`mt-1 pr-12 text-right text-[11px] text-ink-dim transition-opacity ${
          focused ? "opacity-100" : "opacity-0"
        }`}
      >
        Enter envia · Shift+Enter quebra linha
      </div>
    </div>
  );
}
