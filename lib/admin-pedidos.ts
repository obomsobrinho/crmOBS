// PEDIDOS EM ABERTO DE UM CLIENTE, na central do dono (27/10/2026, pedido do dono).
//
// Módulo PURO: o servidor (`pedidosDoCliente`, lib/admin.ts), a rota da próxima
// página e o preview `/design/clientes/detalhe` montam a lista pelas mesmas
// funções. Regra do dono: pedido aberto SEMPRE precisa ser resolvido, então o
// bloco ignora o período escolhido e mostra TODOS, do mais antigo ao mais novo.
// A fonte é a mesma do ícone da lista (`handoffs` com `closed_at` nulo).
//
// Para que serve (dono, 27/10/2026): ver o que está acontecendo para chamar o cliente
// com contexto ("você tem pedidos abertos há X dias; estes se repetem e podem virar
// regra"). Por isso o bloco abre por um RESUMO (quantos, o mais antigo), depois os
// REPETIDOS agrupados por motivo, e só então a lista. Agrupa pelo MOTIVO (lib/motivos.ts)
// e não pelo texto do resumo da IA: comparar resumos parecidos pediria similaridade de
// texto no banco ou uma chamada de IA, e nenhum dos dois cabe aqui.

import { nomeDoContato } from "./inbox";
import { rotuloDoMotivo } from "./motivos";
import type { Tables } from "./database.types";

export const PAGINA_PEDIDOS_DA_CENTRAL = 10;

/**
 * Uma linha de `admin_pedidos_do_cliente`: as colunas do pedido e o nome do contato (junção à
 * esquerda, por isso nulo). Pelas tabelas, e não pelo retorno da função: o gerador marca toda
 * coluna de RPC como não nula (data.md).
 */
export type LinhaDoPedidoDaCentral = Pick<Tables<"handoffs">, "id" | "phone" | "opened_at" | "motivo" | "summary"> &
  Pick<Tables<"dados_cliente">, "nomewpp" | "display_name">;

export interface PedidoDaCentral {
  id: number;
  phone: string;
  /** `opened_at`: quando a IA chamou o time. */
  abertoEm: string;
  /** Chave de lib/motivos.ts; null = pedido de antes do motivo existir. */
  motivo: string | null;
  /** O resumo que a IA escreveu do pedido. */
  resumo: string | null;
  /** Nome do contato, ou null (a tela mostra o telefone). */
  nome: string | null;
}

/**
 * As linhas de uma página. O número de avisos já sai no banco (`p_fora` com as grafias de
 * `grafiasDoNumeroDeAvisos`, lib/avisos.ts), na lista e na contagem por motivo, então as duas batem.
 */
export function pedidosDasLinhas(linhas: LinhaDoPedidoDaCentral[]): PedidoDaCentral[] {
  return linhas.map((l) => ({
    id: l.id,
    phone: l.phone,
    abertoEm: l.opened_at,
    motivo: l.motivo,
    resumo: l.summary?.trim() || null,
    nome: nomeDoContato(l),
  }));
}

/** Do mais antigo ao mais novo; o empate no instante decide pelo id (a ordem do banco). */
export function ordenarPedidos(p: PedidoDaCentral[]): PedidoDaCentral[] {
  return [...p].sort((a, b) =>
    a.abertoEm === b.abertoEm ? a.id - b.id : Date.parse(a.abertoEm) - Date.parse(b.abertoEm)
  );
}

/** O cursor da próxima página, na consulta da rota (`?em=...&id=...`). */
export function consultaDoCursor(depois: PedidoDaCentral | null): string {
  if (!depois) return "";
  return new URLSearchParams({ em: depois.abertoEm, id: String(depois.id) }).toString();
}

/**
 * O cursor lido da consulta: `null` = primeira página, `"invalido"` = 400. Os dois
 * vêm juntos ou nenhum; a data precisa ser um instante e o id um inteiro positivo.
 */
export function cursorDaConsulta(
  em: string | null,
  id: string | null
): { em: string; id: number } | null | "invalido" {
  if (em === null && id === null) return null;
  if (!em || !id || !/^\d{1,18}$/.test(id) || !Number.isFinite(Date.parse(em))) return "invalido";
  return { em: new Date(Date.parse(em)).toISOString(), id: Number(id) };
}

/** Quantos abertos de UM motivo (`admin_pedidos_por_motivo`). */
export interface MotivoEmAberto {
  /** Chave de lib/motivos.ts; null = pedidos de antes do motivo existir. */
  motivo: string | null;
  rotulo: string;
  abertos: number;
  /** `opened_at` do mais antigo deste motivo. */
  maisAntigo: string;
}

/**
 * "Repetido" = o mesmo motivo em mais de um pedido aberto (a palavra do dono). Só esses ganham
 * a marca "pode virar regra"; "Sem motivo" nunca, porque não é um assunto (é pedido antigo).
 */
export const REPETIDO_A_PARTIR_DE = 2;

export interface ResumoDosPedidos {
  total: number;
  /** O mais antigo de todos; null sem nenhum aberto. */
  maisAntigo: string | null;
  /** Do motivo com mais pedidos ao com menos; empate, o que espera há mais tempo primeiro. */
  porMotivo: (MotivoEmAberto & { podeVirarRegra: boolean })[];
}

export function resumoDosPedidos(
  linhas: { motivo: string | null; abertos: number; mais_antigo: string | null }[]
): ResumoDosPedidos {
  const porMotivo = linhas
    .filter((l) => l.abertos > 0 && l.mais_antigo)
    .map((l) => ({
      motivo: l.motivo,
      rotulo: rotuloDoMotivo(l.motivo),
      abertos: l.abertos,
      maisAntigo: l.mais_antigo!,
      podeVirarRegra: l.motivo !== null && l.abertos >= REPETIDO_A_PARTIR_DE,
    }))
    .sort((a, b) => b.abertos - a.abertos || Date.parse(a.maisAntigo) - Date.parse(b.maisAntigo));
  const maisAntigo = porMotivo.reduce<string | null>(
    (m, x) => (m === null || Date.parse(x.maisAntigo) < Date.parse(m) ? x.maisAntigo : m),
    null
  );
  return { total: porMotivo.reduce((n, x) => n + x.abertos, 0), maisAntigo, porMotivo };
}

/** "3 pedidos" / "1 pedido". */
export function textoDaContagem(n: number): string {
  return n === 1 ? "1 pedido" : `${n} pedidos`;
}
