import { describe, expect, it } from "vitest";
import { encaixarAbertosDaConversa, type PedidoAberto } from "../regras";
import { aplicarNaLista, itensDaLista, soPrimeiraPagina, type ListaNoCache } from "./cache";

const aberto = (id: number, phone: string, min: number, posicao = 1, total = 1): PedidoAberto => ({
  id,
  phone,
  openedAt: new Date(Date.UTC(2026, 10, 14, 12, min)).toISOString(),
  summary: `p${id}`,
  motivo: null,
  atualizadoEm: null,
  nome: null,
  fotoPath: null,
  posicao,
  total,
});

const lista = (paginas: PedidoAberto[][], temMais = true): ListaNoCache => ({
  pages: paginas.map((itens, i) => ({ itens, temMais: i < paginas.length - 1 || temMais })),
  pageParams: paginas.map((_, i) => (i === 0 ? null : paginas[i - 1][paginas[i - 1].length - 1])),
});

describe("lista de Pedidos no cache (a ponte do realtime)", () => {
  it("um pedido novo da IA entra no lugar sem reler as páginas: junta tudo numa página, temMais da última", () => {
    const d = lista([[aberto(1, "a", 0), aberto(2, "b", 10)], [aberto(3, "c", 20)]], true);
    const novo = aberto(9, "d", 5);
    const r = aplicarNaLista(d, (itens, temMais) => encaixarAbertosDaConversa(itens, "d", [novo], "", temMais))!;
    expect(itensDaLista(r).map((p) => p.id)).toEqual([1, 9, 2, 3]);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0].temMais).toBe(true);
    expect(r.pageParams).toEqual([null]);
  });
  it("sem mudança devolve o mesmo objeto (ninguém é avisado)", () => {
    const d = lista([[aberto(1, "a", 0)]], false);
    expect(aplicarNaLista(d, (itens) => itens)).toBe(d);
    expect(aplicarNaLista(undefined, (itens) => itens)).toBeUndefined();
  });
  it("a fila de uma conversa é refeita (1 de 2 vira 1 de 1) e o que saiu sai", () => {
    const d = lista([[aberto(1, "a", 0, 1, 2), aberto(2, "a", 30, 2, 2)]], false);
    const r = aplicarNaLista(d, (itens, temMais) => encaixarAbertosDaConversa(itens, "a", [aberto(2, "a", 30, 1, 1)], "", temMais))!;
    expect(itensDaLista(r).map((p) => [p.id, (p as PedidoAberto).total])).toEqual([[2, 1]]);
  });
  it("antes de reler a lista inteira, fica só a primeira página", () => {
    const d = lista([[aberto(1, "a", 0)], [aberto(2, "b", 10)], [aberto(3, "c", 20)]]);
    const r = soPrimeiraPagina(d)!;
    expect(r.pages).toHaveLength(1);
    expect(r.pageParams).toEqual([null]);
    const um = lista([[aberto(1, "a", 0)]]);
    expect(soPrimeiraPagina(um)).toBe(um);
  });
});
