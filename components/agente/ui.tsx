"use client";

import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CACHE_SAFE_TOKENS } from "@/lib/agent-prompt";

// Helpers de layout do formulário do agente. Moravam no rodapé do
// `AgentConfigForm.tsx`; saíram de lá quando o formulário passou a ter DUAS
// superfícies (o assistente de `/montagem` e a tela de abas de `/agente`), e um
// helper que vive dentro de uma delas não serve à outra.
//
// Não são camada base: `components/ui/` é a base do sistema, ajustada uma vez;
// isto aqui é vocabulário de UMA tela e não deve virar variante de `Card` nem de
// `Button` só porque tem duas chamadas.

/**
 * Bloco com título. Chamava-se `Card`, e o nome foi trocado quando a base ganhou
 * o seu: são coisas diferentes. `Card` é a moldura da PÁGINA; este é um bloco
 * DENTRO dela, e por isso usa `bg-bloco`, a superfície de quem mora dentro. Com
 * `bg-surface` ele tinha a mesma cor do pai no tema escuro.
 *
 * ⚠️ PERDEU `numero` e `continuarPara` em 28/08/2026. Os dois eram um wizard
 * improvisado dentro de uma página de rolagem única, e agora existe um wizard de
 * verdade em rota própria. Manter os dois produziria "passo 2 de 3" dentro de
 * "passo 2 de 4".
 */
export function Secao({
  id,
  title,
  children,
}: {
  id?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    // `scroll-mt-2` para o título não encostar na borda de cima do cartão, que é
    // o container de rolagem.
    <section
      id={id}
      className="scroll-mt-2 rounded-xl border border-line bg-bloco p-4"
    >
      {title && <h2 className="mb-3 text-corpo font-semibold">{title}</h2>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * Sub-bloco que recolhe, mostrando o VALOR na linha do cabeçalho quando fechado.
 * É a regra que torna o recolhimento um ganho e não uma escondida: quem volta
 * para conferir o horário lê "Segunda a sexta: 08:00 às 18:00" sem abrir nada.
 *
 * Sem `<details>` e sem accordion novo na base: `<button aria-expanded>` mais
 * render condicional já é o padrão da casa. Sem transição no ícone, porque
 * animação aqui é CSS da casa e um `rotate` em transição é exatamente a
 * armadilha do Tailwind v4 documentada no CLAUDE.md.
 */
export function Recolhivel({
  titulo,
  resumo,
  aberto,
  onToggle,
  manterMontado = false,
  children,
}: {
  titulo: string;
  resumo: string;
  aberto: boolean;
  onToggle: () => void;
  /**
   * Esconde por CSS em vez de desmontar. Existe para bloco que tem estado
   * interno não salvo (ver o aviso no bloco de limites).
   */
  manterMontado?: boolean;
  children: React.ReactNode;
}) {
  const Icone = aberto ? ChevronDown : ChevronRight;
  return (
    <div className="border-t border-line pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 text-left"
      >
        <Icone size={14} className="shrink-0 text-ink-faint" />
        <h3 className="shrink-0 text-rotulo uppercase text-ink-3">{titulo}</h3>
        {!aberto && (
          <span className="min-w-0 truncate text-legenda text-ink-2">
            {resumo}
          </span>
        )}
        <span className="ml-auto shrink-0 text-legenda text-ink-3">
          {aberto ? "fechar" : "abrir"}
        </span>
      </button>
      {manterMontado ? (
        <div className={aberto ? "mt-3" : "hidden"}>{children}</div>
      ) : (
        aberto && <div className="mt-3">{children}</div>
      )}
    </div>
  );
}

/**
 * Dois campos lado a lado, empilhando em tela estreita. Só para campo CURTO:
 * textarea e lista continuam inteiros.
 *
 * ⚠️ O prefixo é breakpoint de VIEWPORT, não de container. Este helper só é
 * seguro dentro de uma seção de largura cheia; foi por estar dentro de uma
 * coluna de 348px que o campo das regras colapsou para 34px em 1024px.
 *
 * Divide a partir de `lg` (1024px), e não de `sm`: medido em 768px, duas colunas
 * dão 210px por campo, que é estreito demais para um nome de empresa.
 */
export function Par({ children }: { children: React.ReactNode }) {
  return <div className="grid items-start gap-4 lg:grid-cols-2">{children}</div>;
}

/**
 * Três campos curtos por linha, mas só a partir de `xl` (1280px). Em 1024px três
 * colunas dão 217px cada, então ali ele vira duas de 336px. Mesma ressalva do
 * `Par` sobre o prefixo ser de viewport.
 */
export function Trio({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

export function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-apoio font-medium">
        {label}
        {required && <span className="text-danger-ink">*</span>}
      </label>
      {children}
      {error && <p className="text-legenda text-danger-ink">{error}</p>}
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-legenda text-ink-3">{children}</p>;
}

/**
 * Aviso de que a persona é curta demais para o cache de prompt pegar. Fica
 * colado no campo que o resolve, e por isso existe nos dois modos: no guiado é
 * "Detalhes do negócio", no avançado é a própria textarea.
 *
 * O limiar é `CACHE_SAFE_TOKENS` (2.048) e não o piso de 1.024 de propósito:
 * `gpt-5.4-mini` cai na faixa em que a OpenAI diz que o mínimo varia de 1.024 a
 * 2.048 e o cache é inconsistente pouco acima do piso. Prometer economia que não
 * vem é pior que avisar de um risco que não se concretizou.
 */
export function AvisoCache({
  tokens,
  children,
}: {
  tokens: number;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-1.5 text-legenda text-warn-ink">
      <AlertTriangle size={14} className="mt-px shrink-0" />
      <span>
        O prompt tem cerca de {tokens.toLocaleString("pt-BR")} tokens, abaixo dos{" "}
        {CACHE_SAFE_TOKENS.toLocaleString("pt-BR")} que a OpenAI pede para
        reaproveitar o prompt entre mensagens, então cada resposta paga o preço
        cheio de entrada. {children}
      </span>
    </p>
  );
}

export function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ConfirmModal({
  aberto,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  aberto: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent tamanho="confirmacao">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={18} className="text-warn-ink" />
          <DialogTitle>{title}</DialogTitle>
        </div>
        <DialogDescription className="mb-5">{body}</DialogDescription>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="field" className="px-4">
              Cancelar
            </Button>
          </DialogClose>
          <Button size="field" className="px-4" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
