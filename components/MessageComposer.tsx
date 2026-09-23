"use client";

import { useRef, useState } from "react";
import {
  Send,
  Loader2,
  Lock,
  StickyNote,
  Sparkles,
  X,
  Plus,
  ChevronUp,
  ArrowUp,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  clientId,
  readOnly,
  atende,
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
  clientId: string;
  /** Conta bloqueada por assinatura: some com a caixa de texto. */
  readOnly?: boolean;
  /**
   * Quem atende agora, só para a frase de contexto do CELULAR ("Você assume no
   * lugar de Ana"). O desktop segue com o aviso de sempre.
   */
  atende?: { quem: "ia" | "ninguem" | "voce" | "outro"; nome?: string };
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
      .then(() => {
        setText("");
        // Depois de uma nota ou orientação o modo VOLTA para Responder (desenho
        // do mobile, e desde 23/09/2026 também no desktop): o modo mora numa
        // pílula, e a próxima coisa escrita quase sempre é para o cliente.
        setMode("responder");
      })
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
      <div className="shrink-0 bg-msg px-5 pb-[18px] pt-2">
        <div className="mx-auto flex w-full max-w-[960px] items-center gap-2 rounded-lg border-l-[3px] border-l-danger bg-danger-surface px-3 py-2.5 text-apoio text-ink">
          <Lock size={14} className="shrink-0 text-danger-ink" />
          <span>
            Envio pausado enquanto a conta não está em dia. Você continua vendo
            as mensagens que chegam.
          </span>
        </div>
      </div>
    );
  }

  const skin = SKIN[mode];
  const ActionIcon = skin.Icon;
  // A FRASE DE CONTEXTO (AJUSTES-2 do desenho do mobile, e desde 23/09/2026
  // também no desktop, a pedido do dono): UMA frase dizendo a consequência de
  // enviar, que muda com o modo e com quem atende. Substituiu duas coisas que
  // diziam quase o mesmo em dois lugares: a faixa tingida de aviso ("A IA
  // reativa e usa sua orientação...") e o destino escrito ao lado dos modos
  // ("vai para a IA, não para o cliente"). O dono leu as duas como excesso.
  const contexto =
    mode === "nota"
      ? "Só o time vê. O cliente não recebe."
      : mode === "orientar"
        ? "Instrução para a IA. O cliente não vê."
        : atende?.quem === "voce"
          ? "Vai para o WhatsApp do cliente."
          : atende?.quem === "outro" && atende.nome
            ? `Vai para o WhatsApp do cliente. Você assume no lugar de ${atende.nome}.`
            : atende?.quem === "ia" || (!atende && iaAtiva)
              ? "Vai para o WhatsApp do cliente. A IA pausa e você assume."
              : "Vai para o WhatsApp do cliente. Ao responder, você assume a conversa.";
  const modosDisponiveis = (["responder", "nota", "orientar"] as Mode[]).filter(
    (m) =>
      m === "responder" ||
      (m === "nota" && !!onAddNote) ||
      (m === "orientar" && !!onInstruct),
  );

  return (
    // ⚠️ `pt-3` e não `pt-0` (19/09/2026). Sem respiro, a caixa branca nascia
    // encostada no ponto exato onde a conversa é cortada, e as duas coisas
    // viravam uma linha só. Com 12px de superfície lisa entre elas, a mensagem
    // termina de se dissolver antes de a caixa começar, e a caixa passa a ler
    // como algo que FLUTUA sobre a conversa, que é o que ela é.
    <div className="shrink-0 bg-msg px-5 pb-[18px] pt-3 max-md:px-2 max-md:pb-[max(8px,env(safe-area-inset-bottom))] max-md:pt-2">
      {attachError && (
        <div className="mx-auto mb-2 w-full max-w-[960px] rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink">
          {attachError}
        </div>
      )}

      {/* A CAIXA NO ESTILO DA DO CLAUDE, nos dois tamanhos de tela (23/09/2026:
          nasceu no celular, e o dono pediu no desktop também, "fica bem mais
          clean"). Um bloco só, em três partes: a frase de contexto em cima, o
          campo no meio e, embaixo, "+", a pílula do modo e o enviar.
          ⚠️ Os três modos como botões lado a lado SAÍRAM (eram as abas de
          18/09): o modo agora mora na pílula, com a cor dele na moldura, na
          pílula e no enviar, que é o que impede escrever nota achando que é
          resposta ao cliente.
          A coluna continua a de 960px da conversa, e o raio de 16px é o do
          balão: as duas superfícies grandes da conversa são da mesma família. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`mx-auto w-full max-w-[960px] overflow-hidden rounded-[16px] bg-raised shadow-[var(--panel-shadow)] transition-colors ${skin.frame}`}
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

        {/* A frase de contexto, numa faixa interna arredondada e SEM cor de
            estado no fundo: quem carrega a cor do modo é a moldura e a pílula. */}
        <p
          data-slot="composer-contexto"
          className="mx-2 mt-2 rounded-[10px] bg-bloco px-3 py-2 text-apoio text-ink-2"
        >
          {contexto}
        </p>

        {/* Campo na largura toda e, embaixo, a linha de botões. O campo cresce
            com o texto (`field-sizing: content`) até o teto, e rola a partir
            dali; onde a propriedade não existe (Firefox hoje) o `rows` manda. */}
        <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
          <input
            ref={fileRef}
            type="file"
            onChange={onPickFile}
            className="hidden"
            aria-hidden
          />
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
            rows={1}
            aria-label={skin.placeholder}
            placeholder={skin.placeholder}
            className="min-h-[var(--h-primary)] max-h-[180px] min-w-0 basis-full px-2 py-2 text-corpo [field-sizing:content] max-md:max-h-[132px]"
          />

          {/* Anexo só existe no modo Responder: nota e orientação não vão ao
              WhatsApp, então não há o que anexar. */}
          {mode === "responder" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="none"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || !onSendMedia}
                  aria-label="Anexar"
                  className="size-9 justify-center rounded-full text-ink-2 max-md:size-10"
                >
                  {uploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={18} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {onSendMedia ? "Anexar arquivo" : "Anexos indisponíveis"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* A PÍLULA DO MODO: tocar abre, para cima, os modos com uma linha
              curta de destino cada. */}
          {modosDisponiveis.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="none"
                  data-slot="composer-modo"
                  className={cn(
                    "h-9 gap-1.5 rounded-full px-3 text-apoio font-semibold max-md:h-10",
                    skin.hint,
                    skin.frame,
                    skin.aviso,
                  )}
                >
                  <ActionIcon size={15} />
                  {MODO_ROTULO[mode]}
                  <ChevronUp size={14} className="opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-64">
                {modosDisponiveis.map((m) => {
                  const Icone = SKIN[m].Icon;
                  return (
                    <DropdownMenuItem
                      key={m}
                      onSelect={() => setMode(m)}
                      className="min-h-11 items-start py-2"
                    >
                      <Icone size={16} className={cn("mt-0.5 shrink-0", SKIN[m].hint)} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold text-ink">{MODO_ROTULO[m]}</span>
                        <span className="text-legenda text-ink-3">{SKIN[m].destino}</span>
                      </span>
                      {m === mode && <Check size={14} className="mt-0.5 shrink-0 text-brand-ink" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="flex-1" aria-hidden />

          {/* A ação principal SEM RÓTULO (pedido do dono, 21/09/2026): a seta e a
              cor do modo já dizem o que ela faz. O atalho mora no tooltip. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                variant={skin.variant}
                size="none"
                disabled={!canSend}
                // ⚠️ O nome acessível vem do `aria-label`: sem ele o botão
                // ficaria sem nome para leitor de tela e para teste.
                aria-label={skin.action}
                className={cn(
                  // `disabled:opacity-100` e não `opacity-100`: com modificador
                  // diferente o tailwind-merge não considera as duas classes
                  // conflitantes, e a da base venceria. Este botão desabilitado
                  // não desbota, ele troca de cor.
                  "size-9 shrink-0 justify-center rounded-full transition max-md:size-10",
                  !canSend &&
                  "cursor-not-allowed bg-[var(--chip-bg)] text-ink-3 disabled:opacity-100",
                )}
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowUp size={18} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{skin.action} (Enter)</TooltipContent>
          </Tooltip>
        </div>
      </form>

    </div>
  );
}

// Cada modo pinta a moldura, a pílula e o enviar com o seu matiz, porque a cor
// é o que diz para onde o texto vai antes de a pessoa ler. Verde é ação humana
// no WhatsApp, âmbar é interno do time, roxo é a IA.
const SKIN: Record<
  Mode,
  {
    frame: string;
    /** Tinta do matiz: pílula e ícones. Sempre `ink`, nunca `fill`. */
    hint: string;
    /** Fundo tingido da pílula do modo. */
    aviso: string;
    /** Uma linha curta no menu de modos: para onde vai o que está escrito. */
    destino: string;
    variant: React.ComponentProps<typeof Button>["variant"];
    placeholder: string;
    action: string;
    Icon: LucideIcon;
  }
> = {
  responder: {
    frame: "border border-[var(--human-line)]",
    hint: "text-human-ink",
    aviso: "bg-human-surface",
    variant: "send",
    placeholder: "Escreva uma mensagem",
    action: "Enviar mensagem",
    destino: "Vai para o cliente",
    Icon: Send,
  },
  nota: {
    frame: "border border-[var(--warn-line)]",
    hint: "text-warn-ink",
    aviso: "bg-warn-surface",
    variant: "warn",
    placeholder: "Anotar algo sobre este contato",
    action: "Salvar nota interna",
    destino: "Só o time vê",
    Icon: StickyNote,
  },
  orientar: {
    frame: "border border-[var(--brand-line)]",
    hint: "text-brand-ink",
    aviso: "bg-brand-surface",
    variant: "brand",
    placeholder: "Diga o que a IA deve responder",
    action: "Orientar e reativar a IA",
    destino: "Só a IA vê",
    Icon: Sparkles,
  },
};

/** Rótulo curto da pílula do modo. */
const MODO_ROTULO: Record<Mode, string> = {
  responder: "Responder",
  nota: "Nota interna",
  orientar: "Orientar a IA",
};

