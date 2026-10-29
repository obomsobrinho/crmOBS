"use client";

import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { MOLDURA_LISTA } from "@/components/agente/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { problemaDosServicos, type ServicoDaAgenda } from "@/lib/agenda";
import { cn } from "@/lib/utils";

// Os campos da agenda que aparecem em DOIS lugares (decisão do dono,
// 28/10/2026): o item "Agenda" com a caixa de ativar e a lista de serviços,
// nas Configurações da agenda e na montagem. Um componente só, para as duas
// telas nunca divergirem.

export type ServicoEditavel = { id: number | null; chave: string; nome: string; duracao: string };

export function paraEditar(s: ServicoDaAgenda): ServicoEditavel {
  return { id: s.id, chave: `s${s.id}`, nome: s.nome, duracao: String(s.duracaoMin) };
}

export function paraSalvar(lista: ServicoEditavel[]): { id: number | null; nome: string; duracaoMin: number }[] {
  return lista.map((s) => ({ id: s.id, nome: s.nome.trim(), duracaoMin: Number(s.duracao) }));
}

/** O item "Agenda": a caixa de ativar e o texto curto. Marcado, `children` abre embaixo. */
export function ItemAgenda({
  ativa,
  onAtivar,
  children,
}: {
  ativa: boolean;
  onAtivar: (ativa: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-bloco p-4" data-agenda="item-agenda">
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox checked={ativa} onCheckedChange={(v) => onAtivar(v === true)} className="mt-1" aria-label="Agenda ativa" />
        <span>
          <span className="flex items-center gap-1.5 font-display text-cartao">
            <CalendarDays size={16} className="text-brand-ink" />
            Agenda
          </span>
          <span className="mt-0.5 block text-apoio text-ink-3">
            Para quem atende com horário marcado. Ative para a IA marcar, remarcar e cancelar horários pela conversa.
          </span>
        </span>
      </label>
      {ativa && children}
    </section>
  );
}

/** A lista de serviços, cada um com nome e duração em minutos. */
export function ListaDeServicos({
  servicos,
  onChange,
  comErro = false,
}: {
  servicos: ServicoEditavel[];
  onChange: (lista: ServicoEditavel[]) => void;
  /**
   * O salvar recusou a lista (29/10/2026, dono: o erro do serviço não ficava
   * claro): a moldura fica vermelha e cada campo errado é marcado.
   */
  comErro?: boolean;
}) {
  const trocar = (i: number, p: Partial<ServicoEditavel>) => onChange(servicos.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const [nomeRuim, duracaoRuim] = [
    (s: ServicoEditavel) => comErro && !s.nome.trim(),
    (s: ServicoEditavel) => comErro && !!problemaDosServicos(false, [{ nome: "x", duracaoMin: Number(s.duracao) }]),
  ];
  return (
    <>
      <div className={cn(MOLDURA_LISTA, comErro && "border-danger-line")} data-agenda="servicos" data-erro={comErro ? "" : undefined}>
        {servicos.length === 0 && <p className="px-3 py-2.5 text-legenda text-ink-3">Nenhum serviço ainda.</p>}
        {servicos.map((s, i) => (
          <div key={s.chave} className="flex items-center gap-2 px-3 py-2" data-agenda="servico">
            <Input
              variant="sutil"
              value={s.nome}
              placeholder="Nome do serviço"
              onChange={(e) => trocar(i, { nome: e.target.value })}
              aria-label={`Nome do serviço ${i + 1}`}
              aria-invalid={nomeRuim(s) || undefined}
              className={cn("min-w-0 flex-1", nomeRuim(s) && "border-danger-line")}
              maxLength={80}
            />
            <div className="flex items-center gap-1.5">
              <Input
                variant="sutil"
                inputMode="numeric"
                value={s.duracao}
                onChange={(e) => trocar(i, { duracao: e.target.value.replace(/\D/g, "") })}
                aria-label={`Duração em minutos do serviço ${i + 1}`}
                aria-invalid={duracaoRuim(s) || undefined}
                className={cn("w-16 text-right tabular-nums", duracaoRuim(s) && "border-danger-line")}
                maxLength={3}
              />
              <span className="text-legenda text-ink-3">min</span>
            </div>
            <Button
              variant="danger-ghost"
              size="icon-control"
              aria-label={`Remover serviço ${i + 1}`}
              onClick={() => onChange(servicos.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="link"
        size="link"
        className="mt-2"
        onClick={() => onChange([...servicos, { id: null, chave: `n${servicos.length}-${Math.random()}`, nome: "", duracao: "30" }])}
      >
        <Plus size={14} />
        Adicionar serviço
      </Button>
    </>
  );
}
