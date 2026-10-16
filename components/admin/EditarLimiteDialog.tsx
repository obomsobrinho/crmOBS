"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { numeroBR } from "@/lib/format";
import { limiteDaEmpresa, tokensCurto } from "@/lib/custo-ia";
import { limiteDigitado, type EmpresaItem } from "@/lib/admin-empresas";
import type { FonteDoCliente } from "@/lib/admin-cliente-fonte";

// EDITAR O LIMITE DE IA DE UM CLIENTE (aba "Ações" da central, "Valor personalizado"). O campo é SEMPRE em
// milhões de tokens ("10", "2,5" ou "2.5"); embaixo dele, os tokens que vão ser
// gravados, para não haver dúvida. Vazio ou "Usar o limite do plano" volta ao limite do plano (ou ao padrão de quem não tem plano).
// Grava por `fonte.mudarLimite` (`PUT /api/admin/empresas/[id]/limite`: uma transação, com o
// registro em `admin_acoes`; o preview valida e não grava). Subir acima do uso reativa a IA na próxima
// mensagem.
//
// O detalhe monta este diálogo com `key` = id do cliente: abrir outro cliente é
// outro diálogo, com o campo já começando no teto dela.
export default function EditarLimiteDialog({
  empresa,
  sugestao,
  fonte,
  onFechar,
  onSalvo,
}: {
  empresa: EmpresaItem | null;
  /** O valor (em tokens) com que a caixa abre preenchida, quando o dono parte do valor de um plano; senão, o limite gravado. */
  sugestao?: number | null;
  fonte: FonteDoCliente;
  onFechar: () => void;
  onSalvo: (id: string, limite: number | null) => void;
}) {
  const [texto, setTexto] = useState(() => {
    const inicial = sugestao ?? empresa?.limiteGravado ?? null;
    return inicial == null ? "" : numeroBR(inicial / 1_000_000).replace(/\./g, "");
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const valor = limiteDigitado(texto);
  // O "vazio" é o limite do PLANO da empresa (ou o padrão de quem não tem plano).
  const padrao = limiteDaEmpresa(null, empresa?.planoChave);
  const quemDefine = empresa?.planoChave ? "do plano" : "sem plano";

  async function gravar(limite: number | null) {
    if (!empresa) return;
    setErro(null);
    setSalvando(true);
    try {
      const r = await fonte.mudarLimite(limite);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      onSalvo(empresa.id, limite);
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  function salvar() {
    if (valor === undefined) {
      setErro("Digite um número maior que zero, em milhões de tokens (até 1.000). Ex.: 10 ou 2,5.");
      return;
    }
    void gravar(valor);
  }

  return (
    <Dialog open={empresa != null} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-md" data-slot="admin-limite-dialogo">
        <DialogTitle>Limite de IA do mês</DialogTitle>
        <DialogDescription className="mt-2 mb-4">
          {empresa?.nome}: usou {tokensCurto(empresa?.usados ?? 0)} tokens este mês. Ao chegar no
          limite a IA para até o mês virar ou o limite subir.
        </DialogDescription>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-legenda font-semibold text-ink-2">Limite em milhões de tokens</span>
            <Input
              data-campo="limite"
              inputMode="decimal"
              autoFocus
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setErro(null);
              }}
              placeholder={`Vazio = ${quemDefine} (${tokensCurto(padrao)})`}
            />
            <span data-slot="admin-limite-tokens" className="text-legenda text-ink-3">
              {valor === null
                ? `Limite ${quemDefine}: ${numeroBR(padrao)} tokens`
                : valor === undefined
                  ? "Ex.: 10 (10 milhões) ou 2,5 (2,5 milhões)"
                  : `${numeroBR(valor)} tokens`}
            </span>
          </label>
          {erro && (
            <p data-slot="admin-limite-erro" className="text-apoio text-danger-ink" role="alert">
              {erro}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="link-discreto"
              size="link"
              className="mr-auto"
              data-slot="admin-limite-padrao"
              onClick={() => void gravar(null)}
            >
              {empresa?.planoChave ? "Usar o limite do plano" : "Usar o padrão"}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="field" className="px-4">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              size="field"
              className="px-4"
              data-slot="admin-limite-salvar"
              carregando={salvando}
            >
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
