"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { numeroBR, plural } from "@/lib/format";
import type { PreviaDaPlanilha } from "@/lib/planilha-de-leads";
import type { FonteDeCampanhas } from "./tipos";

// IMPORTAR UMA PLANILHA na campanha (dono, 02/11/2026): só Excel (.xlsx). Escolhido
// o arquivo, a tela mostra ANTES de gravar as colunas achadas, quantos entram,
// quantos foram pulados e por quê, quantos já estão na base e quem pediu para sair,
// e uma amostra de como os números ficaram (para ver se não está errado). Confirmado,
// vira uma lista ("busca" de fonte planilha) que a campanha passa a usar.

const ROTULO_DA_COLUNA = { telefone: "Telefone", nome: "Empresa", cidade: "Cidade", segmento: "Segmento" } as const;

export default function ImportarPlanilha({
  fonte,
  aberto,
  aoFechar,
  aoImportar,
}: {
  fonte: FonteDeCampanhas;
  aberto: boolean;
  aoFechar: () => void;
  /** A lista gravada: a campanha passa a usar esta busca. */
  aoImportar: (buscaId: string) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nome, setNome] = useState("");
  const [previa, setPrevia] = useState<PreviaDaPlanilha | null>(null);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  const limpar = () => {
    setArquivo(null);
    setNome("");
    setPrevia(null);
    setFalha(null);
  };

  const escolher = async (f: File | null) => {
    limpar();
    if (!f) return;
    setArquivo(f);
    setNome(f.name.replace(/\.xlsx$/i, ""));
    setLendo(true);
    try {
      const r = await fonte.previaDaPlanilha(f);
      if (r.ok) setPrevia(r.previa);
      else setFalha(r.erro);
    } catch (e) {
      console.error("planilha, prévia:", e);
      setFalha("Não deu para ler a planilha agora. Tente de novo em instantes.");
    } finally {
      setLendo(false);
    }
  };

  const importar = async () => {
    if (!arquivo) return;
    setGravando(true);
    setFalha(null);
    try {
      const r = await fonte.importarPlanilha(arquivo, nome.trim());
      if (!r.ok) return setFalha(r.erro);
      aoImportar(r.buscaId);
      limpar();
    } catch (e) {
      console.error("planilha, importar:", e);
      setFalha("Não deu para importar agora. Tente de novo em instantes.");
    } finally {
      setGravando(false);
    }
  };

  const entram = previa ? previa.validas - previa.pediramSair : 0;
  const pulados = previa ? previa.invalidas + previa.repetidas + previa.vazias : 0;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) {
          limpar();
          aoFechar();
        }
      }}
    >
      <DialogContent className="max-w-lg" data-slot="planilha-dialogo">
        <DialogTitle>Importar planilha</DialogTitle>
        <DialogDescription className="mt-2 mb-4">
          Uma planilha do Excel (.xlsx) com uma coluna de telefone (Telefone, Celular ou WhatsApp). Empresa, Cidade e Segmento são
          opcionais. Só celular entra: é o que recebe WhatsApp.
        </DialogDescription>

        <div className="flex flex-col gap-4">
          <Input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Arquivo da planilha"
            onChange={(e) => void escolher(e.target.files?.[0] ?? null)}
            data-slot="planilha-arquivo"
          />

          {lendo && <p className="text-apoio text-ink-3">Lendo a planilha…</p>}
          {falha && (
            <Aviso tom="danger" data-bloco="planilha-falha">
              {falha}
            </Aviso>
          )}

          {previa && (
            <div className="flex flex-col gap-4" data-slot="planilha-previa">
              <p className="text-apoio text-ink-2">
                <span className="text-numero tabular-nums text-ink">{numeroBR(entram)}</span> {plural(entram, "contato entra", "contatos entram")}{" "}
                de {numeroBR(previa.linhas)} {plural(previa.linhas, "linha", "linhas")}.
              </p>
              <ul className="flex flex-col gap-1 text-legenda text-ink-2">
                <li>
                  Colunas:{" "}
                  {Object.entries(previa.colunas)
                    .map(([c, n]) => `${ROTULO_DA_COLUNA[c as keyof typeof ROTULO_DA_COLUNA]} = ${n}`)
                    .join(", ")}
                </li>
                {pulados > 0 && (
                  <li>
                    Pulados: {[
                      previa.invalidas > 0 ? `${numeroBR(previa.invalidas)} sem celular válido` : null,
                      previa.repetidas > 0 ? `${numeroBR(previa.repetidas)} repetidos na planilha` : null,
                      previa.vazias > 0 ? `${numeroBR(previa.vazias)} sem telefone` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    .
                  </li>
                )}
                {previa.exemplosInvalidos.length > 0 && (
                  <li>Exemplos pulados: {previa.exemplosInvalidos.map((x) => `linha ${x.linha} (${x.valor})`).join(", ")}.</li>
                )}
                {previa.jaNaBase > 0 && (
                  <li>
                    {numeroBR(previa.jaNaBase)} já {plural(previa.jaNaBase, "estava", "estavam")} na base: {plural(previa.jaNaBase, "vira", "viram")} o
                    mesmo lead, sem duplicar.
                  </li>
                )}
                {previa.pediramSair > 0 && (
                  <li>
                    {numeroBR(previa.pediramSair)} {plural(previa.pediramSair, "pediu", "pediram")} para sair antes e {plural(previa.pediramSair, "fica", "ficam")} de
                    fora.
                  </li>
                )}
              </ul>

              <div className="flex flex-col gap-1.5">
                <p className="text-rotulo text-ink-3">Como os números ficaram</p>
                <table className="w-full text-legenda" data-slot="planilha-amostra">
                  <thead>
                    <tr className="text-left text-ink-3">
                      <th className="py-1 font-normal">Na planilha</th>
                      <th className="py-1 font-normal">Como vai ser usado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.amostra.map((a, i) => (
                      <tr key={i} className="border-t border-line-soft">
                        <td className="py-1 tabular-nums text-ink-2">{a.original}</td>
                        <td className="py-1 tabular-nums text-ink">{a.comoFica}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-rotulo text-ink-3">Nome da lista</span>
                <Input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 80))} data-slot="planilha-nome" />
              </label>
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="field" className="px-4">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" size="field" className="px-4" disabled={!previa || entram === 0} carregando={gravando} onClick={() => void importar()} data-slot="planilha-importar">
              <FileSpreadsheet aria-hidden />
              Importar {previa ? numeroBR(entram) : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
