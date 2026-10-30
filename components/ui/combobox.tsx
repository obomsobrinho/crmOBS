"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, Search } from "lucide-react";

import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import { gatilhoVariants } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Escolher UM valor de uma lista longa DIGITANDO (30/10/2026, a cidade da busca de
 * leads: 853 cidades em MG). O `Select` serve para listas curtas; aqui o gatilho
 * tem o mesmo desenho dele e abre uma caixa com um campo de busca e a lista que
 * casa com o que foi digitado. Não aceita texto livre: só um item da lista vira
 * valor, para nunca gravar um nome errado.
 *
 * Quem filtra é quem chama (`buscar`), porque a regra de "casar" é do domínio (a
 * cidade casa sem acento e sem caixa). Teclado: setas andam, Enter escolhe, Esc
 * fecha. Acessível como `combobox` + `listbox`.
 */
export interface OpcaoDoCombobox {
  valor: string;
  rotulo: string;
}

function Combobox({
  valor,
  rotuloDoValor,
  buscar,
  aoEscolher,
  rotulo,
  placeholder,
  placeholderDaBusca = "Digite para buscar",
  vazio = "Nada encontrado",
  disabled,
  size = "field",
  className,
  ...props
}: {
  /** O valor escolhido (`null` = nenhum). */
  valor: string | null;
  /** O texto do valor escolhido, mostrado no gatilho. */
  rotuloDoValor: string | null;
  buscar: (texto: string) => OpcaoDoCombobox[];
  aoEscolher: (valor: string) => void;
  /** O nome acessível do campo. */
  rotulo: string;
  placeholder: string;
  placeholderDaBusca?: string;
  vazio?: string;
  disabled?: boolean;
  className?: string;
} & VariantProps<typeof gatilhoVariants> &
  Record<`data-${string}`, string | undefined>) {
  const [aberto, setAberto] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [ativo, setAtivo] = React.useState(0);
  const idDaLista = React.useId();
  const opcoes = React.useMemo(() => (aberto ? buscar(texto) : []), [aberto, buscar, texto]);
  const indice = Math.min(ativo, Math.max(0, opcoes.length - 1));

  const escolher = (v: string) => {
    aoEscolher(v);
    setAberto(false);
  };
  const mudarAberto = (v: boolean) => {
    setAberto(v);
    if (v) {
      setTexto("");
      setAtivo(0);
    }
  };

  return (
    <PopoverPrimitive.Root open={aberto} onOpenChange={mudarAberto}>
      <PopoverPrimitive.Trigger
        type="button"
        role="combobox"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={idDaLista}
        disabled={disabled}
        className={cn(gatilhoVariants({ size }), "w-full", className)}
        {...props}
        data-slot="combobox"
      >
        <span className={cn("truncate", valor === null && "text-ink-3")}>{rotuloDoValor ?? placeholder}</span>
        <ChevronDown size={15} className="text-ink-faint" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          data-slot="combobox-content"
          className="anim-flutuante z-50 w-(--radix-popover-trigger-width) min-w-56 overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--panel-shadow)]"
        >
          <div className="flex items-center gap-2 border-b border-line-soft px-3">
            <Search size={14} className="shrink-0 text-ink-3" />
            <input
              autoFocus
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAtivo((i) => Math.min(i + 1, opcoes.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAtivo((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (opcoes[indice]) escolher(opcoes[indice].valor);
                }
              }}
              placeholder={placeholderDaBusca}
              aria-label={`${rotulo}: buscar`}
              aria-controls={idDaLista}
              aria-activedescendant={opcoes[indice] ? `${idDaLista}-${indice}` : undefined}
              className="h-[var(--h-field)] min-w-0 flex-1 bg-transparent text-apoio text-ink outline-hidden placeholder:text-ink-3"
              data-slot="combobox-busca"
            />
          </div>
          <AreaRolavel tamanho={DISSOLVER_PADRAO} className="max-h-64">
            <ul id={idDaLista} role="listbox" aria-label={rotulo} className="p-1">
              {opcoes.length === 0 ? (
                <li className="px-3 py-2 text-legenda text-ink-3">{vazio}</li>
              ) : (
                opcoes.map((o, i) => (
                  <li
                    key={o.valor}
                    id={`${idDaLista}-${i}`}
                    role="option"
                    aria-selected={o.valor === valor}
                    data-ativo={i === indice}
                    data-slot="combobox-opcao"
                    ref={(el) => {
                      if (el && i === indice) el.scrollIntoView({ block: "nearest" });
                    }}
                    onMouseMove={() => setAtivo(i)}
                    onClick={() => escolher(o.valor)}
                    className="relative flex h-8 cursor-pointer items-center rounded-lg pr-2 pl-7 text-legenda text-ink-2 select-none data-[ativo=true]:bg-[var(--active-bg)] aria-selected:text-ink"
                  >
                    {o.valor === valor && <Check size={13} className="absolute left-2 text-brand-ink" />}
                    <span className="truncate">{o.rotulo}</span>
                  </li>
                ))
              )}
            </ul>
          </AreaRolavel>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export { Combobox };
