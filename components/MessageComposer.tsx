"use client";

import { useRef, useState } from "react";
import { Send, Paperclip, Bot, Hand, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import QuickReplyPicker from "./QuickReplyPicker";

export type OutgoingMedia = {
  bucket: string;
  path: string;
  type: "image" | "audio" | "video" | "document";
  mime: string;
  filename: string;
};

function mediaTypeFromMime(mime: string): OutgoingMedia["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export default function MessageComposer({
  onSend,
  onSendMedia,
  iaAtiva,
  clientId,
}: {
  onSend: (text: string) => void | Promise<void>;
  onSendMedia?: (media: OutgoingMedia) => void | Promise<void>;
  iaAtiva?: boolean;
  clientId: string;
}) {
  const supabase = createClient();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  // Anexo: sobe o arquivo direto pro Storage (URL assinada) e dispara o envio.
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file || !onSendMedia) return;

    setUploading(true);
    setAttachError(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/whatsapp-media/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mime: file.type,
          size: file.size,
        }),
      });
      const d = (await r.json()) as {
        error?: string;
        bucket?: string;
        path?: string;
        token?: string;
      };
      if (!r.ok || !d.bucket || !d.path || !d.token) {
        setAttachError(d.error ?? "Falha ao preparar o envio do arquivo.");
        setUploading(false);
        return;
      }
      const up = await supabase.storage
        .from(d.bucket)
        .uploadToSignedUrl(d.path, d.token, file);
      if (up.error) {
        setAttachError("Falha ao enviar o arquivo.");
        setUploading(false);
        return;
      }
      await onSendMedia({
        bucket: d.bucket,
        path: d.path,
        type: mediaTypeFromMime(file.type),
        mime: file.type || "application/octet-stream",
        filename: file.name,
      });
      setUploading(false);
    } catch {
      setAttachError("Não foi possível enviar o arquivo.");
      setUploading(false);
    }
  }

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

      {attachError && (
        <div className="mb-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-[12.5px] text-danger">
          {attachError}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <input
          ref={fileRef}
          type="file"
          onChange={onPickFile}
          className="hidden"
          aria-hidden
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !onSendMedia}
          title={onSendMedia ? "Anexar arquivo" : "Anexos indisponíveis"}
          aria-label="Anexar"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-[var(--active-bg)] hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Paperclip size={18} />
          )}
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
