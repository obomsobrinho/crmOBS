"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { numeroBR, plural } from "@/lib/format";
import type { PreviaDaPlanilha } from "@/lib/planilha-de-leads";
import type { FonteDeCampanhas } from "./tipos";

// IMPORTAR UMA PLANILHA na campanha (dono, 02/11/2026; dentro do passo Contatos, sem
// janela, desde 04/11/2026): só Excel (.xlsx). A aba mostra o formato e o modelo
// para baixar; escolhido o arquivo, mostra ANTES de gravar as colunas achadas,
// quantos entram, quantos foram pulados e por quê, quantos já estão na base e quem
// pediu para sair, e uma amostra de como os números ficaram (para ver se não está
// errado). Confirmado, vira uma lista ("busca" de fonte planilha) que a campanha
// passa a usar.

const ROTULO_DA_COLUNA = { telefone: "Telefone", nome: "Empresa", cidade: "Cidade", segmento: "Segmento" } as const;

/** O modelo para baixar: só o cabeçalho, para nenhuma linha de exemplo virar contato por engano. */
export const MODELO_DA_PLANILHA = "/modelos/modelo-contatos.xlsx";

/** O formato aceito, como a leitura entende (`CABECALHOS`, lib/planilha-de-leads.ts). */
const FORMATO = [
  { coluna: "Telefone", obrigatoria: "Sim, só celular", aceita: "Celular, WhatsApp, Fone", exemplo: "(35) 9XXXX-XXXX" },
  { coluna: "Empresa", obrigatoria: "Não", aceita: "Nome, Razão social, Fantasia", exemplo: "Clínica Sorriso" },
  { coluna: "Cidade", obrigatoria: "Não", aceita: "Município", exemplo: "Varginha" },
  { coluna: "Segmento", obrigatoria: "Não", aceita: "Categoria, Ramo, Atividade", exemplo: "Odontologia" },
] as const;

export default function ImportarPlanilha({
  fonte,
  aoImportar,
}: {
  fonte: FonteDeCampanhas;
  /** A lista gravada: a campanha passa a usar esta busca. */
  aoImportar: (buscaId: string) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
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
    if (campo.current) campo.current.value = "";
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
      limpar();
      aoImportar(r.buscaId);
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
    <div className="flex flex-col gap-4" data-slot="planilha-aba">
      <p className="text-apoio text-ink-2">
        Uma planilha do Excel (.xlsx). Só a coluna do telefone é obrigatória, e só celular entra: é o que recebe WhatsApp. O título
        da coluna pode ser qualquer um destes.
      </p>
      <table className="w-full text-legenda" data-slot="planilha-formato">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="py-1 pr-3 font-normal">Coluna</th>
            <th className="py-1 pr-3 font-normal">Obrigatória</th>
            <th className="hidden py-1 pr-3 font-normal sm:table-cell">Também aceita</th>
            <th className="py-1 font-normal">Exemplo</th>
          </tr>
        </thead>
        <tbody>
          {FORMATO.map((f) => (
            <tr key={f.coluna} className="border-t border-line-soft">
              <td className="py-1 pr-3 font-semibold text-ink">{f.coluna}</td>
              <td className="py-1 pr-3 text-ink-2">{f.obrigatoria}</td>
              <td className="hidden py-1 pr-3 text-ink-2 sm:table-cell">{f.aceita}</td>
              <td className="py-1 tabular-nums text-ink-2">{f.exemplo}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" size="field" className="px-4" onClick={() => campo.current?.click()} carregando={lendo} data-slot="planilha-escolher">
          <FileSpreadsheet aria-hidden />
          Importar planilha
        </Button>
        <Button asChild variant="link" size="link">
          <a href={MODELO_DA_PLANILHA} download data-slot="planilha-modelo">
            <Download aria-hidden />
            Baixar modelo (.xlsx)
          </a>
        </Button>
        <input
          ref={campo}
          type="file"
          hidden
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Arquivo da planilha"
          onChange={(e) => void escolher(e.target.files?.[0] ?? null)}
          data-slot="planilha-arquivo"
        />
      </div>

      {falha && (
        <Aviso tom="danger" data-bloco="planilha-falha">
          {falha}
        </Aviso>
      )}

      {previa && (
        <div className="flex flex-col gap-4 rounded-lg border border-line p-4" data-slot="planilha-previa">
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

          <label className="flex max-w-sm flex-col gap-1.5">
            <span className="text-rotulo text-ink-3">Nome da lista</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 80))} data-slot="planilha-nome" />
          </label>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="field" className="px-4" onClick={() => {
                limpar();
                campo.current?.click();
              }}
              data-slot="planilha-outro"
            >
              Escolher outro arquivo
            </Button>
            <Button type="button" size="field" className="px-4" disabled={entram === 0} carregando={gravando} onClick={() => void importar()} data-slot="planilha-importar">
              <FileSpreadsheet aria-hidden />
              Importar {numeroBR(entram)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
