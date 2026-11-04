import "server-only";
import { randomUUID } from "node:crypto";
import type { Supa } from "./supabase/tipos";
import type { RecorteDosLeads } from "@/components/admin/campanhas/tipos";
import { concluir, criarBusca, paginaDeLeads } from "./campanhas-servidor";
import { mascaraTelefoneBR } from "./format";
import { itemParaOBanco } from "./fonte-de-leads";
import {
  FONTE_PLANILHA,
  MAXIMO_DE_LINHAS,
  amostraDosNumeros,
  colunasDaPlanilha,
  itemDaPlanilha,
  lerLinhas,
  nomeDaColuna,
  type ColunaDaPlanilha,
  type LeituraDaPlanilha,
  type PreviaDaPlanilha,
} from "./planilha-de-leads";
import { OPCOES_PADRAO, tipoDoTelefone, type TipoDeTelefone } from "./prospeccao";


// A PLANILHA DE LEADS no servidor: ler o .xlsx (exceljs, só servidor), montar a
// prévia (com quantos já estão na base e quantos pediram para sair) e, confirmada,
// gravar como uma busca de fonte "planilha" pelas MESMAS funções SQL de uma busca
// do Google (`prospeccao_criar_busca` com a linha em admin_acoes, e
// `prospeccao_concluir_busca`, que não duplica o lead). As regras são puras, em
// `lib/planilha-de-leads.ts`.

/** A primeira aba do arquivo como linhas de texto (o texto que a célula mostra). */
export async function linhasDoArquivo(buffer: ArrayBuffer): Promise<string[][] | null> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return null;
  }
  const aba = wb.worksheets[0];
  if (!aba) return [];
  const linhas: string[][] = [];
  aba.eachRow({ includeEmpty: false }, (row) => {
    if (linhas.length > MAXIMO_DE_LINHAS) return;
    const valores: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      valores[col - 1] = cell.text ?? "";
    });
    linhas.push(Array.from(valores, (v) => v ?? ""));
  });
  return linhas;
}

export type LeituraDoArquivo =
  | { ok: true; leitura: LeituraDaPlanilha; previaSemBase: Omit<PreviaDaPlanilha, "jaNaBase" | "pediramSair"> }
  | { ok: false; erro: string };

/** O arquivo lido e conferido, ou a frase do que está errado com ele. */
export async function lerPlanilha(buffer: ArrayBuffer): Promise<LeituraDoArquivo> {
  const linhas = await linhasDoArquivo(buffer);
  if (!linhas) return { ok: false, erro: "Não deu para ler o arquivo. Ele precisa ser uma planilha do Excel (.xlsx)." };
  if (linhas.length > MAXIMO_DE_LINHAS + 1) return { ok: false, erro: `A planilha tem mais de ${MAXIMO_DE_LINHAS} linhas. Divida em partes.` };
  const { colunas, temCabecalho } = colunasDaPlanilha(linhas);
  if (colunas.telefone === undefined) return { ok: false, erro: "Não achei a coluna do telefone. Dê a ela o título Telefone, Celular ou WhatsApp." };
  const corpo = temCabecalho ? linhas.slice(1) : linhas;
  const leitura = lerLinhas(corpo, colunas, temCabecalho ? 2 : 1);
  const cabecalho = linhas[0] ?? [];
  const nomes = Object.fromEntries(
    (Object.entries(colunas) as [ColunaDaPlanilha, number][]).map(([c, i]) => [c, nomeDaColuna(cabecalho, temCabecalho, i)]),
  );
  return {
    ok: true,
    leitura,
    previaSemBase: {
      linhas: corpo.length,
      colunas: nomes,
      validas: leitura.validas.length,
      invalidas: leitura.invalidas.length,
      exemplosInvalidos: leitura.invalidas.slice(0, 5),
      vazias: leitura.vazias,
      repetidas: leitura.repetidas,
      amostra: amostraDosNumeros(leitura.validas),
    },
  };
}

/** Dos celulares, quantos já estão na base e quantos desses pediram para sair (leitura em lotes de 500). */
export async function situacaoNaBase(svc: Supa, telefones: string[]): Promise<{ jaNaBase: number; pediramSair: number }> {
  let jaNaBase = 0;
  let pediramSair = 0;
  for (let i = 0; i < telefones.length; i += 500) {
    const { data, error } = await svc.from("prospeccao_leads").select("telefone, parou_em").in("telefone", telefones.slice(i, i + 500));
    if (error) throw error;
    jaNaBase += data?.length ?? 0;
    pediramSair += (data ?? []).filter((l) => l.parou_em !== null).length;
  }
  return { jaNaBase, pediramSair };
}

/** O teto de linhas de uma exportação (40 leituras de 50). */
export const MAXIMO_DA_EXPORTACAO = 2000;
const LOTE_DA_EXPORTACAO = 50;

/** Os leads do recorte num .xlsx, na ordem da tabela (a pontuação), até o teto. */
export async function planilhaDosLeads(svc: Supa, recorte: RecorteDosLeads): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const aba = wb.addWorksheet("Leads");
  aba.columns = [
    { header: "Empresa", key: "nome", width: 36 },
    { header: "Telefone", key: "telefone", width: 18 },
    { header: "Tipo do telefone", key: "tipo", width: 16 },
    { header: "Categorias", key: "categorias", width: 36 },
    { header: "Cidade", key: "cidade", width: 20 },
    { header: "Bairro", key: "bairro", width: 20 },
    { header: "Endereço", key: "endereco", width: 40 },
    { header: "Site", key: "site", width: 30 },
    { header: "Nota", key: "nota", width: 8 },
    { header: "Avaliações", key: "avaliacoes", width: 12 },
    { header: "Pontos", key: "pontos", width: 8 },
    { header: "Marcação", key: "marcacao", width: 12 },
    { header: "Campanhas", key: "campanhas", width: 30 },
  ];
  aba.getRow(1).font = { bold: true };
  for (let pagina = 1; (pagina - 1) * LOTE_DA_EXPORTACAO < MAXIMO_DA_EXPORTACAO; pagina++) {
    const { itens } = await paginaDeLeads(svc, { ...recorte, pagina, porPagina: LOTE_DA_EXPORTACAO });
    for (const l of itens) {
      aba.addRow({
        nome: l.nome,
        telefone: l.telefone ? mascaraTelefoneBR(l.telefone) : "",
        tipo: l.telefone ? ROTULO_DO_TIPO[tipoDoTelefone(l.telefone)] : "Sem telefone",
        categorias: (l.detalhes?.categorias.length ? l.detalhes.categorias : [l.segmento]).filter(Boolean).join(", "),
        cidade: l.cidade,
        bairro: l.bairro,
        endereco: l.detalhes?.endereco ?? "",
        site: l.site ?? "",
        nota: l.nota,
        avaliacoes: l.avaliacoes,
        pontos: l.pontuacao ?? null,
        marcacao: l.marcacao === "bom" ? "Bom" : l.marcacao === "descartado" ? "Descartado" : "",
        campanhas: l.campanhas.map((c) => c.nome).join(", "),
      });
    }
    if (itens.length < LOTE_DA_EXPORTACAO) break;
  }
  return wb.xlsx.writeBuffer();
}

const ROTULO_DO_TIPO: Record<TipoDeTelefone, string> = { celular: "Celular", fixo: "Fixo", invalido: "Inválido" };

/** Grava a planilha como uma busca de fonte "planilha" (já pronta) e devolve o id dela. */
export async function gravarPlanilha(svc: Supa, a: { admin: string; nome: string; leitura: LeituraDaPlanilha }): Promise<string> {
  const id = randomUUID();
  const cidades = new Map<string, number>();
  for (const v of a.leitura.validas) if (v.cidade) cidades.set(v.cidade, (cidades.get(v.cidade) ?? 0) + 1);
  // A cidade da lista: a que mais aparece na planilha, ou vazia (planilha sem a coluna Cidade; o banco
  // aceita cidade vazia só para a fonte "planilha", migration 20261104040309).
  const cidade = [...cidades].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
  await criarBusca(svc, {
    admin: a.admin,
    id,
    opcoes: { ...OPCOES_PADRAO, nome: a.nome, cidade, ignorarFechados: false },
    fonte: FONTE_PLANILHA,
    execucao: FONTE_PLANILHA,
  });
  await concluir(svc, id, a.leitura.validas.map((v) => itemParaOBanco(itemDaPlanilha(v))), null);
  return id;
}
