"use client";

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
 * DENTRO dela, e por isso usa `bg-bloco`, a superfície de quem mora dentro.
 * Com a superfície de cartão ele nascia com a MESMA cor do pai no tema escuro,
 * e só a borda o separava.
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
 * Sub-bloco que NÃO recolhe: um filete de cima separando do anterior, o título
 * e o conteúdo. É o vocabulário de bloco DENTRO de uma aba do formulário, e
 * existe para que não haja três jeitos de encabeçar a mesma coisa.
 *
 * Existe desde 22/09/2026, quando o dono tirou o recolher de "Horário de
 * atendimento" e de "Limites e quando chamar o time" ("não faz sentido deixar
 * colapsado, tem espaço abaixo"). Recolher paga por si quando a aba não cabe na
 * tela; depois que o formulário virou três abas, o espaço existe, e o que
 * sobrava era um clique entre a pessoa e o campo.
 *
 * ⚠️ O TÍTULO É `text-cartao` EM CAIXA NORMAL, e não `text-rotulo` em caixa
 * alta. A primeira versão disto copiou o cabeçalho do `Recolhivel`, e o dono
 * pegou na hora: "título do horário de atendimento tá diferente dos outros,
 * título de documento por exemplo". A regra é a da hierarquia de três níveis
 * (docs/design-system/fundamentos-tipografia.md): `text-cartao` encabeça um
 * bloco COM ESTRUTURA PRÓPRIA, e `text-rotulo` em caixa alta é o rótulo de um
 * VALOR ou de um sub-bloco RECOLHÍVEL. Sem o recolher, estes blocos são do
 * primeiro tipo, e é por isso que "Documentos" sempre foi assim.
 *
 * `titulo` é opcional porque o bloco de documentos monta o próprio cabeçalho
 * (com o MESMO `CabecalhoBloco`) dentro do `KnowledgeManager`; o que ele
 * precisa daqui é só o filete e o respiro.
 * `primeiro` tira o filete de quem abre a aba, que não tem nada acima para se
 * separar.
 */
export function SubBloco({
  titulo,
  icone,
  descricao,
  primeiro = false,
  required,
  error,
  className,
  children,
}: {
  /** Para o bloco que precisa esticar numa grade (`flex h-full flex-col`). */
  className?: string;
  titulo?: string;
  /** Ícone do cabeçalho. Ver `CabecalhoBloco`. */
  icone?: LucideIcon;
  /** Uma frase curta: o que se configura aqui. */
  descricao?: string;
  primeiro?: boolean;
  /** Mesma marca do `Field`: o bloco inteiro é obrigatório (Objetivos). */
  required?: boolean;
  /** Erro por campo, como o `PUT /agent-config` devolve em `fields`. */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!primeiro && "border-t border-line pt-4", className)}>
      {titulo && (
        <CabecalhoBloco
          icone={icone}
          titulo={titulo}
          descricao={descricao}
          required={required}
          className="mb-4"
        />
      )}
      {children}
      {error && <p className="mt-1.5 text-legenda text-danger-ink">{error}</p>}
    </div>
  );
}

/**
 * Moldura de cartão-lista (linhas separadas por filete): horário e documentos,
 * lado a lado na mesma aba, com a MESMA moldura.
 */
export const MOLDURA_LISTA = "divide-y divide-line rounded-xl border border-line";

/**
 * Cabeçalho de bloco do construtor: ícone num quadrado tingido, o título e uma
 * frase curta dizendo o que se configura ali (22/09/2026, pedido do dono).
 *
 * Exportado à parte porque o bloco de documentos mora em outro componente
 * (`KnowledgeManager`) e precisa do MESMO desenho: dois jeitos
 * de encabeçar bloco na mesma aba foi exatamente o erro de ff00ffc.
 *
 * O quadrado usa o par `brand-surface`/`brand-ink` (ícone é `ink`, nunca
 * `fill`). O título continua `h3` em `text-cartao`, que é o que o teste de
 * vocabulário único confere.
 */
export function CabecalhoBloco({
  icone: Icone,
  titulo,
  descricao,
  required,
  className,
}: {
  /** Todo bloco do construtor tem; opcional só para não haver um segundo `h3`. */
  icone?: LucideIcon;
  titulo: string;
  descricao?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {Icone && (
        <span
          data-slot="bloco-icone"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-surface text-brand-ink"
        >
          <Icone size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1 font-display text-cartao text-ink">
          {titulo}
          {required && <span className="text-danger-ink">*</span>}
        </h3>
        {descricao && (
          <p className="mt-0.5 text-apoio text-ink-3">{descricao}</p>
        )}
      </div>
    </div>
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
