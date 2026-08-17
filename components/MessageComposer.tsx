"use client";

import { useRef, useState } from "react";
import {
  Send,
  Paperclip,
  Bot,
  Hand,
  Loader2,
  Lock,
  StickyNote,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export type OutgoingMedia = {
  bucket: string;
  path: string;
  type: "image" | "audio" | "video" | "document";
  mime: string;
  filename: string;
};

/** Os três modos da caixa. Um está SEMPRE selecionado: não existe estado
 *  neutro em que a pessoa digita sem saber para onde o texto vai. */
type Mode = "responder" | "nota" | "orientar";

function mediaTypeFromMime(mime: string): OutgoingMedia["type"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

export default function MessageComposer({
  onSend,
  onSendMedia,
  onAddNote,
  onInstruct,
  pendingInstruction,
  onCancelInstruction,
  iaAtiva,
  contactName,
  clientId,
  readOnly,
}: {
  onSend: (text: string) => void | Promise<void>;
  onSendMedia?: (media: OutgoingMedia) => void | Promise<void>;
  /** Grava a nota interna. Ausente = a aba não aparece. */
  onAddNote?: (body: string) => void | Promise<void>;
  /** Grava a orientação e reativa a IA. Ausente = a aba não aparece. */
  onInstruct?: (text: string) => void | Promise<void>;
  /** Orientação já dada e ainda não consumida pela IA. */
  pendingInstruction?: string | null;
  onCancelInstruction?: () => void | Promise<void>;
  iaAtiva?: boolean;
  /** Nome já resolvido do contato, só para o aviso dizer para onde o texto vai. */
  contactName?: string;
  clientId: string;
  /** Conta bloqueada por assinatura: some com a caixa de texto. */
  readOnly?: boolean;
}) {
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("responder");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = !!text.trim() && !saving;

  const submit = () => {
    const t = text.trim();
    if (!t || saving) return;
    if (mode === "responder") {
      void onSend(t);
      setText("");
      return;
    }
    const action = mode === "nota" ? onAddNote : onInstruct;
    if (!action) return;
    // Nota e orientação gravam no banco antes de limpar: se falhar, o que a
    // pessoa escreveu continua no campo em vez de sumir sem aviso.
    setSaving(true);
    void Promise.resolve(action(t))
      .then(() => setText(""))
      .finally(() => setSaving(false));
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

  // Conta bloqueada: a conversa continua visível (as mensagens seguem chegando),
  // mas não existe caixa de texto. Melhor tirar o campo do que deixar a pessoa
  // escrever e levar erro do servidor depois de ter escrito.
  if (readOnly) {
    return (
      <div className="shrink-0 bg-msg px-3 pb-3 pt-2">
        <div className="flex items-center gap-2 rounded-lg border-l-[3px] border-l-[var(--danger)] bg-[var(--danger-bg)] px-3 py-2.5 text-apoio text-ink">
          <Lock size={14} className="shrink-0 text-danger" />
          <span>
            Envio pausado enquanto a conta não está em dia. Você continua vendo
            as mensagens que chegam.
          </span>
        </div>
      </div>
    );
  }

  const skin = SKIN[mode];
  const hint =
    mode === "nota"
      ? "Só o time vê. Nunca vai para o WhatsApp."
      : mode === "orientar"
        ? "A IA reativa e usa sua orientação na próxima mensagem do cliente."
        : iaAtiva === true
          ? "A IA está atendendo. Ao enviar, você assume a conversa."
          : iaAtiva === false
            ? contactName
              ? `Você está atendendo. Vai para o WhatsApp de ${contactName}.`
              : "Você está atendendo. A IA não responde nesta conversa."
            : null;
  const HintIcon: LucideIcon =
    mode === "nota"
      ? StickyNote
      : mode === "orientar"
        ? Sparkles
        : iaAtiva === false
          ? Hand
          : Bot;
  const ActionIcon = skin.Icon;

  return (
    <div className="shrink-0 bg-msg px-3 pb-3 pt-0">
      {attachError && (
        <div className="mb-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-apoio text-danger">
          {attachError}
        </div>
      )}

      {/* Bloco único: abas, aviso e campo dividem uma borda só. Antes o aviso
          flutuava acima como faixa solta e parecia de outra tela. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`overflow-hidden rounded-xl bg-campo transition-colors ${skin.frame}`}
      >
        {/* Orientação pendente colada no topo da casa. Ela vivia como cartão na
            coluna da direita, a duas colunas de distância do lugar onde a
            pessoa decide o que fazer com ela. */}
        {pendingInstruction && (
          <div className="flex items-start gap-2.5 border-b border-line bg-brand-surface px-3.5 py-2.5">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-ink" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-legenda font-semibold text-brand-ink">
                Orientação pendente
              </span>
              <span
                className="text-apoio text-ink-2"
                style={{ textWrap: "pretty" }}
              >
                {pendingInstruction}
              </span>
              <span className="text-legenda text-ink-3">
                A IA vai usar isto na próxima mensagem do cliente.
              </span>
            </span>
            {onCancelInstruction && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-chrome"
                    onClick={() => void onCancelInstruction()}
                    aria-label="Cancelar orientação"
                    className="text-ink-3"
                  >
                    <X size={15} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Cancelar orientação</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* Abas DENTRO da casa, no topo. A versão anterior tinha a moldura das
            abas por fora da moldura do campo, o que empilhava duas bordas e
            fazia o conjunto parecer duas peças aparafusadas. */}
        {/* `contents` no Root: o Radix precisa de um elemento para segurar o
            contexto das abas, mas ele não pode participar do layout, senão a
            fila de abas passaria a viver dentro de uma caixa que a moldura do
            composer não previa. Com display:contents o Root some do fluxo e a
            lista continua sendo filha direta da moldura, como sempre foi. */}
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          className="contents"
        >
          <TabsList className="gap-1 px-2 pt-1.5">
            <TabsTrigger value="responder" barra="var(--human-fill)">
              Responder
            </TabsTrigger>
            {onAddNote && (
              <TabsTrigger value="nota" barra="var(--warn-fill)">
                Nota interna
              </TabsTrigger>
            )}
            {onInstruct && (
              <TabsTrigger value="orientar" barra="var(--brand-fill)">
                Orientar
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* Área de escrita alta: é um lugar para escrever, não um campo de uma
            linha que cresce. Três linhas de partida cobrem a mensagem típica
            sem obrigar a pessoa a redimensionar nada. */}
        <Textarea
          variant="limpo"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          aria-label={skin.placeholder}
          placeholder={skin.placeholder}
          className="block px-3 pt-2.5 text-corpo"
        />

        {/* A dica mora dentro da casa, junto do texto, e não como faixa colada
            por fora. É informação sobre o que você está escrevendo. */}
        {hint && (
          <div
            className={`flex items-center gap-1.5 px-3 pt-1 text-legenda ${skin.hint}`}
          >
            <HintIcon size={12} className="shrink-0" />
            <span className="min-w-0 truncate">{hint}</span>
          </div>
        )}

        <div className="flex items-center gap-1 px-2 pb-2 pt-1.5">
          <input
            ref={fileRef}
            type="file"
            onChange={onPickFile}
            className="hidden"
            aria-hidden
          />
          {/* Anexo só existe no modo Responder: nota e orientação não vão ao
              WhatsApp, então não há o que anexar. */}
          {mode === "responder" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-chrome"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || !onSendMedia}
                  aria-label="Anexar"
                  className="text-ink-3"
                >
                  {uploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Paperclip size={16} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {onSendMedia ? "Anexar arquivo" : "Anexos indisponíveis"}
              </TooltipContent>
            </Tooltip>
          )}
          {/* Ação principal à direita, com rótulo e o atalho no próprio botão.
              A dica de teclado vivia solta embaixo do campo, aparecendo e
              sumindo no foco; no rótulo ela está onde é usada. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                variant={skin.variant}
                size="control"
                disabled={!canSend}
                className={cn(
                  // `disabled:opacity-100` e não `opacity-100`: com modificador
                  // diferente o tailwind-merge não considera as duas classes
                  // conflitantes, e a da base venceria. Este botão desabilitado
                  // não desbota, ele troca de cor.
                  "ml-auto px-3 transition",
                  !canSend &&
                  "cursor-not-allowed bg-[var(--chip-bg)] text-ink-3 disabled:opacity-100",
                )}
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ActionIcon size={15} />
                )}
                {skin.action}
                <span aria-hidden className="opacity-70">
                  ⏎
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{skin.action}</TooltipContent>
          </Tooltip>
        </div>
      </form>

    </div>
  );
}

// Cada modo pinta o bloco inteiro (moldura, aviso, aba e botão) com o seu
// matiz, porque a cor é o que diz para onde o texto vai antes de a pessoa ler.
// Verde é ação humana no WhatsApp, âmbar é interno do time, roxo é a IA.
// `button` (a classe do botão) virou `variant` (o nome da variante do Button),
// e `tab` sumiu: era "font-semibold text-ink" nos três modos, ou seja, não
// variava, e quem pinta a aba ativa agora é o `data-[state=active]` da base.
const SKIN: Record<
  Mode,
  {
    frame: string;
    hint: string;
    variant: React.ComponentProps<typeof Button>["variant"];
    placeholder: string;
    action: string;
    Icon: LucideIcon;
  }
> = {
  responder: {
    frame: "border border-[var(--human-line)]",
    hint: "text-human-ink",
    variant: "send",
    placeholder: "Escreva uma mensagem",
    action: "Enviar mensagem",
    Icon: Send,
  },
  nota: {
    frame: "border border-[var(--warn-line)]",
    hint: "text-warn-ink",
    variant: "warn",
    placeholder: "Anotar algo sobre este contato",
    action: "Salvar nota interna",
    Icon: StickyNote,
  },
  orientar: {
    frame: "border border-[var(--brand-line)]",
    hint: "text-brand-ink",
    variant: "brand",
    placeholder: "Diga o que a IA deve responder",
    action: "Orientar e reativar a IA",
    Icon: Sparkles,
  },
};

// O componente `Tab` local morava aqui. Ele virou `TabsTrigger`
// (components/ui/tabs.tsx), que desenha a mesma barra de 3px e ainda traz o
// `role="tablist"` que faltava, navegação por seta e foco itinerante.
