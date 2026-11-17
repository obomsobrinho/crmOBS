import { describe, expect, it, vi } from "vitest";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { remendarLinha, tirarDaPagina, type Infinita, type Pagina } from "./cache";
import { opcoesDeRemendar, opcoesDeTirar } from "./escrita";

// O servidor de mentira: uma lista de leads, com atraso, e um "recusa" por id.
type Lead = { id: number; nome: string; bom?: boolean };

function servidor(n: number) {
  let linhas: Lead[] = Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: `lead ${i + 1}` }));
  const leituras = { n: 0 };
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    leituras,
    ler: async (): Promise<Pagina<Lead>> => {
      leituras.n++;
      await espera(5);
      return { itens: linhas.map((l) => ({ ...l })), total: linhas.length };
    },
    tirar: (recusar: Set<number>) => async (id: number) => {
      await espera(30);
      if (recusar.has(id)) throw new Error("recusado");
      linhas = linhas.filter((l) => l.id !== id);
    },
    marcar: async (v: { id: number; bom: boolean }) => {
      await espera(150);
      linhas = linhas.map((l) => (l.id === v.id ? { ...l, bom: v.bom } : l));
    },
  };
}

const LISTAS = ["campanhas", "leads", "lista"] as const;
const CHAVE = [...LISTAS, {}] as const;
const ENTIDADE = ["campanhas", "leads"] as const;

async function preparar(n = 10) {
  const srv = servidor(n);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  // Uma tela "aberta" na lista: sem observador, a invalidação não relê.
  const obs = new QueryObserver(qc, { queryKey: CHAVE, queryFn: srv.ler });
  const sair = obs.subscribe(() => {});
  await vi.waitFor(() => expect(qc.getQueryData(CHAVE)).toBeDefined());
  srv.leituras.n = 0;
  return { srv, qc, sair };
}

const ids = (qc: QueryClient) => (qc.getQueryData<Pagina<Lead>>(CHAVE)?.itens ?? []).map((l) => l.id);
const total = (qc: QueryClient) => qc.getQueryData<Pagina<Lead>>(CHAVE)?.total;

describe("auxiliares puros", () => {
  it("tira a linha e o total nos dois formatos, e não mexe em lista sem a linha", () => {
    const p: Pagina<Lead> = { itens: [{ id: 1, nome: "a" }, { id: 2, nome: "b" }], total: 9 };
    expect(tirarDaPagina<Lead>(2)(p)).toEqual({ itens: [{ id: 1, nome: "a" }], total: 8 });
    expect(tirarDaPagina<Lead>(7)(p)).toBe(p);
    const inf: Infinita<Lead> = {
      pages: [{ itens: [{ id: 1, nome: "a" }], total: 3 }, { itens: [{ id: 2, nome: "b" }], total: 3 }],
      pageParams: [null, 1],
    };
    const r = tirarDaPagina<Lead>(2)(inf) as Infinita<Lead>;
    expect(r.pages.map((x) => x.itens.length)).toEqual([1, 0]);
    expect(r.pages.map((x) => x.total)).toEqual([2, 2]);
    expect(tirarDaPagina<Lead>(1)(undefined)).toBeUndefined();
  });

  it("remenda só a linha certa e devolve a mesma lista quando ela não está", () => {
    const p: Pagina<Lead> = { itens: [{ id: 1, nome: "a" }], total: 1 };
    expect((remendarLinha<Lead>(1, { bom: true })(p) as Pagina<Lead>).itens[0].bom).toBe(true);
    expect(remendarLinha<Lead>(5, { bom: true })(p)).toBe(p);
  });
});

describe("escritas otimistas concorrentes", () => {
  it("5 remoções em voo com a 3ª recusada: 4 somem, a 3ª volta, total menos 4, uma releitura", async () => {
    const { srv, qc, sair } = await preparar(10);
    const recusar = new Set([3]);
    const opcoes = opcoesDeTirar<number>({
      qc,
      listas: LISTAS,
      entidade: ENTIDADE,
      acao: "tirar",
      atrasoMs: 10,
      executar: srv.tirar(recusar),
    });
    const voo = [1, 2, 3, 4, 5].map((id) => new MutationObserver(qc, opcoes).mutate(id).catch(() => null));
    // No clique as cinco já sumiram, antes de qualquer resposta.
    await vi.waitFor(() => expect(ids(qc)).toEqual([6, 7, 8, 9, 10]));
    expect(total(qc)).toBe(5);
    await Promise.all(voo);
    await vi.waitFor(() => expect(srv.leituras.n).toBe(1));
    await vi.waitFor(() => expect(ids(qc)).toEqual([3, 6, 7, 8, 9, 10]));
    expect(total(qc)).toBe(6);
    await new Promise((r) => setTimeout(r, 50));
    expect(srv.leituras.n).toBe(1);
    sair();
  });

  it("tirar e marcar na mesma lista: quem termina primeiro não apaga a mudança da outra", async () => {
    const { srv, qc, sair } = await preparar(5);
    const base = { qc, listas: LISTAS, entidade: ENTIDADE, atrasoMs: 10 } as const;
    const tirar = new MutationObserver(qc, opcoesDeTirar<number>({ ...base, acao: "tirar", executar: srv.tirar(new Set()) }));
    const marcar = new MutationObserver(
      qc,
      opcoesDeRemendar<{ id: number; bom: boolean }, Lead>({
        ...base,
        acao: "marcar",
        executar: srv.marcar,
        remendo: (v) => ({ bom: v.bom }),
      })
    );
    const a = tirar.mutate(1);
    const b = marcar.mutate({ id: 2, bom: true });
    await a; // a remoção termina antes; a marcação ainda está em voo
    await new Promise((r) => setTimeout(r, 15)); // passa o atraso da invalidação
    const linha2 = qc.getQueryData<Pagina<Lead>>(CHAVE)?.itens.find((l) => l.id === 2);
    expect(linha2?.bom).toBe(true);
    expect(srv.leituras.n).toBe(0); // a remoção não era a última pendente de leads
    await b;
    await vi.waitFor(() => expect(srv.leituras.n).toBe(1));
    expect(ids(qc)).toEqual([2, 3, 4, 5]);
    sair();
  });
});
