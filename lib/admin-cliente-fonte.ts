import type { EstadoDoWhatsApp } from "./admin-alertas";
import {
  descricaoDaSelecao,
  leituraDoHistorico,
  usoDoHistorico,
  type AtendimentoPorPeriodo,
  type DiaDeUso,
  type MesDeUso,
  type SelecaoHistorica,
  type UsoDoCliente,
  type UsoHistorico,
} from "./admin-cliente";
import { diaIsoSP } from "./fuso";
import { picosDeHistorico } from "./picos";
import type { Cobranca, FinanceiroDoCliente, PedidoDeAcao } from "./admin-conta";
import type { EmpresaItem } from "./admin-empresas";
import { PAGINA_PEDIDOS_DA_CENTRAL, consultaDoCursor, ordenarPedidos, type PedidoDaCentral } from "./admin-pedidos";

// DE ONDE O DETALHE DE UM CLIENTE LE AS ABAS (central do dono). Dois formatos, o
// mesmo contrato: o navegador chama as rotas do admin (o service_role nunca sai
// do servidor), e o preview `/design/clientes/detalhe` responde da memória, com
// dados falsos, sem rede (as ações validam e não gravam). O componente só conhece
// `FonteDoCliente`.

/** O que a tela recebe depois de uma ação na conta. */
export type RespostaDaAcao =
  | { ok: true; empresa: EmpresaItem; financeiro: FinanceiroDoCliente }
  /** Preview: validou e não gravou. */
  | { ok: true; simulado: true }
  /** Gravou, mas a releitura falhou: a tela pede para recarregar. */
  | { ok: true; recarregue: true }
  | { ok: false; erro: string };

/** O que a tela recebe depois de "Apagar de vez". */
export type RespostaDoApagar =
  | { ok: true; pendencias: string[]; simulado?: true }
  | { ok: false; erro: string; pendencias: string[] };

export interface FonteDoCliente {
  uso(): Promise<UsoDoCliente>;
  /**
   * Um mês civil (por dia), todo o período (por mês) ou um intervalo de datas: o seletor ao lado dos chips
   * da aba Uso de IA. Traz o uso, os picos e a janela dos picos.
   */
  usoHistorico(selecao: SelecaoHistorica): Promise<UsoHistorico>;
  /** Os quatro períodos do painel, numa leitura só. */
  atendimento(): Promise<AtendimentoPorPeriodo>;
  /** Ao vivo na Evolution; falha vira `desconhecido`. */
  whatsapp(): Promise<EstadoDoWhatsApp>;
  /** A página de pedidos abertos depois de `depois` (a primeira vem com o detalhe). */
  pedidos(depois: PedidoDaCentral): Promise<PedidoDaCentral[]>;
  /** As cobranças da assinatura no Asaas; `null` = sem assinatura. */
  cobrancas(): Promise<Cobranca[] | null>;
  /** Uma ação do Financeiro ou das Ações (`PUT .../conta`). */
  mudarConta(pedido: PedidoDeAcao): Promise<RespostaDaAcao>;
  /** Grava o limite de IA do mês (`PUT .../limite`; `null` = o do plano). No preview valida e não grava. */
  mudarLimite(limite: number | null): Promise<{ ok: true } | { ok: false; erro: string }>;
  /** Apagar de vez (`POST .../apagar`), com o nome digitado. */
  apagar(nome: string): Promise<RespostaDoApagar>;
  /** O endereço do ZIP da exportação LGPD; `null` no preview (não há o que baixar). */
  urlDaExportacao: string | null;
}

async function lerJson<T>(url: string, o: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${o}: ${res.status}`);
  return (await res.json()) as T;
}

/** Uma escrita na rota; falha de rede vira `{ ok: false }` sem corpo (quem chama diz o texto). */
async function enviar(url: string, metodo: "PUT" | "POST", corpo: unknown): Promise<{ ok: boolean; corpo: unknown }> {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return { ok: res.ok, corpo: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, corpo: {} };
  }
}

const FALHA = "Não deu para concluir agora. Tente de novo.";

/**
 * Lembra a leitura que deu certo (uma falha NÃO fica lembrada, para o "tentar de novo" ler de
 * verdade). É o que deixa o detalhe adiantar a leitura de uma aba em segundo plano
 * (`aquecer`): quando a aba abre, a resposta já está aqui e a troca não espera a rede.
 */
function lembrar<T>(ler: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    if (!p) {
      p = ler().catch((e) => {
        p = null;
        throw e;
      });
    }
    return p;
  };
}

/** Navegador: as rotas do admin. */
export function fonteDoClienteDaApi(id: string): FonteDoCliente {
  const base = `/api/admin/empresas/${id}`;
  const historico = new Map<string, () => Promise<UsoHistorico>>();
  return {
    uso: lembrar(() => lerJson<UsoDoCliente>(`${base}/uso`, "uso")),
    usoHistorico(selecao) {
      const { consulta } = descricaoDaSelecao(selecao);
      let ler = historico.get(consulta);
      if (!ler) {
        ler = lembrar(() => lerJson<UsoHistorico>(`${base}/uso?${consulta}`, "uso"));
        historico.set(consulta, ler);
      }
      return ler();
    },
    atendimento: lembrar(() => lerJson<AtendimentoPorPeriodo>(`${base}/atendimento`, "atendimento")),
    async whatsapp() {
      try {
        const corpo = await lerJson<{ estado?: EstadoDoWhatsApp }>(`${base}/whatsapp`, "whatsapp");
        return corpo.estado ?? "desconhecido";
      } catch {
        return "desconhecido";
      }
    },
    async pedidos(depois) {
      const corpo = await lerJson<{ pedidos?: PedidoDaCentral[] }>(`${base}/pedidos?${consultaDoCursor(depois)}`, "pedidos");
      return corpo.pedidos ?? [];
    },
    async cobrancas() {
      const corpo = await lerJson<{ cobrancas?: Cobranca[] | null }>(`${base}/cobrancas`, "cobranças");
      return corpo.cobrancas ?? null;
    },
    async mudarConta(pedido) {
      const r = await enviar(`${base}/conta`, "PUT", pedido);
      const c = r.corpo as { error?: string; empresa?: EmpresaItem; financeiro?: FinanceiroDoCliente };
      if (r.ok && c.empresa && c.financeiro) return { ok: true, empresa: c.empresa, financeiro: c.financeiro };
      if (r.ok) return { ok: true, recarregue: true };
      return { ok: false, erro: c.error ?? FALHA };
    },
    async mudarLimite(limite) {
      const r = await enviar(`${base}/limite`, "PUT", { limite });
      if (r.ok) return { ok: true };
      return { ok: false, erro: (r.corpo as { error?: string }).error ?? FALHA };
    },
    async apagar(nome) {
      const r = await enviar(`${base}/apagar`, "POST", { nome });
      const c = r.corpo as { error?: string; pendencias?: string[] };
      if (r.ok) return { ok: true, pendencias: c.pendencias ?? [] };
      return { ok: false, erro: c.error ?? FALHA, pendencias: c.pendencias ?? [] };
    },
    urlDaExportacao: `${base}/exportar`,
  };
}

/** Os dados falsos do preview. */
export interface PreviewDoCliente {
  uso: UsoDoCliente;
  /**
   * O histórico falso de cada dia (turnos por hora), do qual o preview tira um mês, todo o período ou um
   * intervalo pelas MESMAS contas do servidor (`usoDoMes`, `usoDeTodoOPeriodo`, `usoDoIntervalo`,
   * `resumoDePicos`). Dados, e não função: o preview nasce num Server Component e atravessa para o navegador.
   */
  memoria: MemoriaDoPreview;
  atendimento: AtendimentoPorPeriodo;
  whatsapp: EstadoDoWhatsApp;
  cobrancas: Cobranca[] | null;
  /** TODOS os pedidos abertos falsos; o preview pagina pela mesma ordem do banco. */
  pedidos: PedidoDaCentral[];
}

/** Preview: responde da memória; as ações validam e não gravam. */
export function fonteDoClienteDaMemoria(p: PreviewDoCliente): FonteDoCliente {
  return {
    uso: async () => p.uso,
    usoHistorico: async (selecao) => usoHistoricoDeMemoria(p.memoria, selecao),
    atendimento: async () => p.atendimento,
    whatsapp: async () => p.whatsapp,
    cobrancas: async () => p.cobrancas,
    async pedidos(depois) {
      const todos = ordenarPedidos(p.pedidos);
      const i = todos.findIndex((x) => x.id === depois.id);
      return todos.slice(i + 1, i + 1 + PAGINA_PEDIDOS_DA_CENTRAL);
    },
    mudarConta: async () => ({ ok: true, simulado: true }),
    mudarLimite: async () => ({ ok: true }),
    apagar: async () => ({ ok: true, pendencias: [], simulado: true }),
    urlDaExportacao: null,
  };
}

/** O histórico falso do preview: dias com tokens, turnos por hora de cada dia e o primeiro dia. */
export interface MemoriaDoPreview {
  dias: DiaDeUso[];
  hist: { dia: string; horas: number[] }[];
  primeira: string | null;
  agora: number;
  modelo: string | null;
}

/** O mesmo que `usoHistoricoDoCliente` (servidor) faz no banco, feito sobre o histórico falso. */
export function usoHistoricoDeMemoria(m: MemoriaDoPreview, selecao: SelecaoHistorica): UsoHistorico {
  const hoje = diaIsoSP(m.agora);
  const entre = (de: string, ate: string) => m.dias.filter((d) => d.dia >= de && d.dia <= ate);
  const mesesDe = (dias: DiaDeUso[]): MesDeUso[] => {
    const porMes = new Map<string, MesDeUso>();
    for (const d of dias) {
      const mes = d.dia.slice(0, 7);
      const x = porMes.get(mes) ?? { mes, turnos: 0, tokens: { entrada: 0, cache: 0, saida: 0 } };
      x.turnos += d.turnos;
      x.tokens.entrada += d.tokens.entrada;
      x.tokens.cache += d.tokens.cache;
      x.tokens.saida += d.tokens.saida;
      porMes.set(mes, x);
    }
    return [...porMes.values()];
  };
  // O QUE ler é a regra pura do servidor (`leituraDoHistorico`); aqui as janelas filtram o histórico falso.
  const primeira = selecao.tipo === "tudo" ? m.primeira : null;
  const l = leituraDoHistorico(selecao, hoje, primeira);
  const uso = usoDoHistorico(
    selecao,
    {
      dias: l.dias ? entre(l.dias.de, l.dias.ate) : [],
      anteriores: l.anteriores ? entre(l.anteriores.de, l.anteriores.ate) : null,
      meses: l.meses ? mesesDe(entre(l.meses.de, l.meses.ate)) : [],
    },
    { janela: l.janela, agora: m.agora, modelo: m.modelo, primeira }
  );
  return { uso, picos: picosDeHistorico(m.hist, l.janela), janela: l.janela };
}
