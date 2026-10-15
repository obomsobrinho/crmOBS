import type { EstadoDoWhatsApp } from "./admin-alertas";
import type { AtendimentoPorPeriodo, UsoDoCliente } from "./admin-cliente";
import type { Cobranca, FinanceiroDoCliente, PedidoDeAcao } from "./admin-conta";
import type { EmpresaItem } from "./admin-empresas";

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
  /** Os quatro períodos do painel, numa leitura só. */
  atendimento(): Promise<AtendimentoPorPeriodo>;
  /** Ao vivo na Evolution; falha vira `desconhecido`. */
  whatsapp(): Promise<EstadoDoWhatsApp>;
  /** As cobranças da assinatura no Asaas; `null` = sem assinatura. */
  cobrancas(): Promise<Cobranca[] | null>;
  /** Uma ação do Financeiro ou das Ações (`PUT .../conta`). */
  mudarConta(pedido: PedidoDeAcao): Promise<RespostaDaAcao>;
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

/** Navegador: as rotas do admin. */
export function fonteDoClienteDaApi(id: string): FonteDoCliente {
  const base = `/api/admin/empresas/${id}`;
  return {
    uso: () => lerJson<UsoDoCliente>(`${base}/uso`, "uso"),
    atendimento: () => lerJson<AtendimentoPorPeriodo>(`${base}/atendimento`, "atendimento"),
    async whatsapp() {
      try {
        const corpo = await lerJson<{ estado?: EstadoDoWhatsApp }>(`${base}/whatsapp`, "whatsapp");
        return corpo.estado ?? "desconhecido";
      } catch {
        return "desconhecido";
      }
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
  atendimento: AtendimentoPorPeriodo;
  whatsapp: EstadoDoWhatsApp;
  cobrancas: Cobranca[] | null;
}

/** Preview: responde da memória; as ações validam e não gravam. */
export function fonteDoClienteDaMemoria(p: PreviewDoCliente): FonteDoCliente {
  return {
    uso: async () => p.uso,
    atendimento: async () => p.atendimento,
    whatsapp: async () => p.whatsapp,
    cobrancas: async () => p.cobrancas,
    mudarConta: async () => ({ ok: true, simulado: true }),
    apagar: async () => ({ ok: true, pendencias: [], simulado: true }),
    urlDaExportacao: null,
  };
}
