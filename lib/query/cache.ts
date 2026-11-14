/**
 * Auxiliares PUROS do cache de dados (docs/plano-dados-e-estado.md, 2.6). Sem I/O:
 * cada um devolve uma função que recebe o valor guardado numa chave e devolve o
 * novo, no formato que `queryClient.setQueriesData` espera.
 *
 * Funcionam nos DOIS formatos de lista do app:
 * - página única: `{ itens, total? }`;
 * - lista infinita do TanStack: `{ pages: [{ itens, total? }, ...], pageParams }`.
 *
 * Valor que não é lista (um detalhe, `undefined` de chave ainda não lida) volta
 * intacto: assim o mesmo `setQueriesData` por prefixo pode passar por chaves de
 * formatos diferentes sem quebrar nenhuma.
 */

export interface Pagina<T> {
  itens: T[];
  /** Total da lista inteira no servidor (não só desta página), quando a fonte sabe. */
  total?: number;
}

export interface Infinita<T> {
  pages: Pagina<T>[];
  pageParams: unknown[];
}

type ComId = { id: string | number };

function ehPagina<T>(v: unknown): v is Pagina<T> {
  return !!v && typeof v === "object" && Array.isArray((v as Pagina<T>).itens);
}

function ehInfinita<T>(v: unknown): v is Infinita<T> {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as Infinita<T>).pages) &&
    (v as Infinita<T>).pages.every((p) => ehPagina<T>(p))
  );
}

/**
 * Tira a linha `id` de onde ela estiver e desconta 1 do total. Lista que não tem
 * a linha volta IGUAL (mesma referência), e o total dela não muda: a mesma linha
 * vive em algumas chaves e não em outras (filtros e páginas diferentes).
 */
export function tirarDaPagina<T extends ComId>(id: T["id"]) {
  const tirar = (p: Pagina<T>): Pagina<T> => {
    const itens = p.itens.filter((i) => i.id !== id);
    if (itens.length === p.itens.length) return p;
    return { ...p, itens, total: p.total === undefined ? undefined : Math.max(0, p.total - 1) };
  };
  return (valor: unknown): unknown => {
    if (ehInfinita<T>(valor)) {
      const pages = valor.pages.map(tirar);
      if (pages.every((p, i) => p === valor.pages[i])) return valor;
      // O total é da lista inteira e vem em toda página: as que não tinham a linha
      // descontam também, para todas dizerem o mesmo número.
      return {
        ...valor,
        pages: pages.map((p, i) =>
          p === valor.pages[i] && p.total !== undefined ? { ...p, total: Math.max(0, p.total - 1) } : p
        ),
      };
    }
    if (ehPagina<T>(valor)) return tirar(valor);
    return valor;
  };
}

/**
 * Aplica um remendo na linha `id` em toda lista que a tenha (o UPDATE do realtime
 * e a marcação otimista). Lista sem a linha volta igual.
 */
export function remendarLinha<T extends ComId>(id: T["id"], remendo: Partial<T> | ((linha: T) => T)) {
  const aplicar = (linha: T): T => (typeof remendo === "function" ? remendo(linha) : { ...linha, ...remendo });
  const naPagina = (p: Pagina<T>): Pagina<T> => {
    let mudou = false;
    const itens = p.itens.map((i) => {
      if (i.id !== id) return i;
      mudou = true;
      return aplicar(i);
    });
    return mudou ? { ...p, itens } : p;
  };
  return (valor: unknown): unknown => {
    if (ehInfinita<T>(valor)) {
      const pages = valor.pages.map(naPagina);
      return pages.every((p, i) => p === valor.pages[i]) ? valor : { ...valor, pages };
    }
    if (ehPagina<T>(valor)) return naPagina(valor);
    return valor;
  };
}
