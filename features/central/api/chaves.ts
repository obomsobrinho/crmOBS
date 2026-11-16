import type { ParamsEmpresas } from "@/lib/admin-empresas";

/**
 * As chaves da central do dono no cache de dados (docs/plano-dados-e-estado.md, 2.5):
 * `[area, entidade, tipo, params?]`, sempre por aqui. Toda escrita da central (limite,
 * conta, apagar) invalida o prefixo `tudo`: a linha da lista e as abas do detalhe
 * mudam juntas.
 */
export const chavesDaCentral = {
  tudo: ["central"] as const,
  empresas: ["central", "empresas"] as const,
  listas: () => [...chavesDaCentral.empresas, "lista"] as const,
  lista: (p: ParamsEmpresas) => [...chavesDaCentral.listas(), p] as const,
  cliente: (id: string) => ["central", "cliente", id] as const,
  uso: (id: string) => [...chavesDaCentral.cliente(id), "uso"] as const,
  /** Um mês, "Todo o período" ou um intervalo: `consulta` é a de `descricaoDaSelecao`. */
  usoHistorico: (id: string, consulta: string) => [...chavesDaCentral.cliente(id), "uso", consulta] as const,
  atendimento: (id: string) => [...chavesDaCentral.cliente(id), "atendimento"] as const,
  whatsapp: (id: string) => [...chavesDaCentral.cliente(id), "whatsapp"] as const,
  cobrancas: (id: string) => [...chavesDaCentral.cliente(id), "cobrancas"] as const,
};
