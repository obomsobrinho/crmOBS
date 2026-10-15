import type { EstadoDoWhatsApp } from "./admin-alertas";
import type { AtendimentoPorPeriodo, UsoDoCliente } from "./admin-cliente";

// DE ONDE O DETALHE DE UM CLIENTE LE AS ABAS (central do dono). Dois formatos, o
// mesmo contrato: o navegador chama as rotas do admin (o service_role nunca sai
// do servidor), e o preview `/design/clientes/detalhe` responde da memória, com
// dados falsos, sem rede. O componente só conhece `FonteDoCliente`.

export interface FonteDoCliente {
  uso(): Promise<UsoDoCliente>;
  /** Os quatro períodos do painel, numa leitura só. */
  atendimento(): Promise<AtendimentoPorPeriodo>;
  /** Ao vivo na Evolution; falha vira `desconhecido`. */
  whatsapp(): Promise<EstadoDoWhatsApp>;
}

async function lerJson<T>(url: string, o: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${o}: ${res.status}`);
  return (await res.json()) as T;
}

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
  };
}

/** Os dados falsos do preview. */
export interface PreviewDoCliente {
  uso: UsoDoCliente;
  atendimento: AtendimentoPorPeriodo;
  whatsapp: EstadoDoWhatsApp;
}

/** Preview: responde da memória. */
export function fonteDoClienteDaMemoria(p: PreviewDoCliente): FonteDoCliente {
  return {
    uso: async () => p.uso,
    atendimento: async () => p.atendimento,
    whatsapp: async () => p.whatsapp,
  };
}
