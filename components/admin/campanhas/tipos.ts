import {
  podeEntrarNaCampanha,
  siteDoLead,
  type MarcacaoDoLead,
  type OpcoesDaBusca,
  type SituacaoDaBusca,
  type SituacaoDaCampanha,
  type SituacaoNaCampanha,
} from "@/lib/prospeccao";

// Os tipos que as telas de Campanhas recebem. Hoje só o preview (`/design/campanhas`)
// os preenche, com dados de mentira; a tela de verdade vai ler das tabelas
// propostas em docs/plano-campanhas.md (seção 7).

/** Uma busca na fonte de leads (termo e cidade), que roda em segundo plano. */
export interface Busca {
  id: string;
  termo: string;
  cidade: string;
  criadaEm: number;
  situacao: SituacaoDaBusca;
  /** Empresas achadas (0 enquanto busca). */
  total: number;
  /** Por que falhou, em uma frase para a tela. */
  erro: string | null;
  /** O que foi pedido à fonte (termos, estado, quantidade, filtros). `termo` acima é os termos juntos, para a tela. */
  opcoes: OpcoesDaBusca;
}

/** Uma empresa na base de leads, deduplicada pelo telefone. */
export interface Lead {
  id: string;
  /** A busca que a trouxe primeiro. */
  buscaId: string;
  nome: string;
  segmento: string;
  bairro: string;
  cidade: string;
  telefone: string | null;
  site: string | null;
  nota: number | null;
  avaliacoes: number | null;
  marcacao: MarcacaoDoLead;
  /** Pediu para parar: fora de toda lista futura, para sempre. */
  parouEm: number | null;
  /** As campanhas por onde passou (a marca fica para sempre). */
  campanhaIds: string[];
}

/** O recorte de leads que a campanha usa (passo Contatos). */
export interface FiltroDeContatos {
  /** Uma busca, ou todas. */
  buscaId: string | "todas";
  soMarcadosComoBons: boolean;
  soSemSiteProprio: boolean;
  /** "Nova campanha com quem não respondeu": os leads vêm desta campanha, escolhidos de propósito. */
  quemNaoRespondeuDe: string | null;
}

export interface EnvioDaCampanha {
  leadId: string;
  situacao: SituacaoNaCampanha;
  /** 0, 1 ou 2; null enquanto está na fila. */
  variante: number | null;
  enviadoEm: number | null;
  respondeuEm: number | null;
}

export interface Campanha {
  id: string;
  nome: string;
  situacao: SituacaoDaCampanha;
  /** null = começa assim que iniciar. */
  agendadaPara: number | null;
  conexaoId: string | null;
  filtro: FiltroDeContatos;
  /** As variantes da mensagem (1 a 3). */
  variantes: string[];
  /** Os leads da campanha, na ordem da fila (vazio no rascunho: a lista sai do filtro ao iniciar). */
  envios: EnvioDaCampanha[];
  criadaEm: number;
  salvaEm: number;
  /** O passo onde o rascunho parou (1 a 4). */
  passo: number;
}

/** Uma conexão de WhatsApp que pode enviar (o campo "Número que envia"). */
export interface ConexaoDisponivel {
  id: string;
  /** A empresa dona da conexão (onde as respostas caem). */
  nome: string;
  numero: string;
  conectado: boolean;
}

/** Onde a central está (as duas abas e as telas de cada uma). */
export type Tela =
  | { aba: "leads"; busca: string | null }
  | { aba: "campanhas"; vista: "lista" }
  | { aba: "campanhas"; vista: "detalhe" | "editar"; id: string };

/**
 * Os leads que um filtro põe na campanha. No preview roda em memória; de
 * verdade é a consulta da rota (paginada no servidor), com a MESMA regra
 * (`podeEntrarNaCampanha`).
 */
export function leadsDoFiltro(leads: Lead[], filtro: FiltroDeContatos, campanhas: Campanha[]): Lead[] {
  if (filtro.quemNaoRespondeuDe) {
    const origem = campanhas.find((c) => c.id === filtro.quemNaoRespondeuDe);
    const ids = new Set(origem?.envios.filter((e) => e.situacao === "enviado").map((e) => e.leadId));
    return leads.filter((l) => ids.has(l.id) && podeEntrarNaCampanha({ ...l, campanhas: l.campanhaIds.length }, true));
  }
  return leads.filter(
    (l) =>
      (filtro.buscaId === "todas" || l.buscaId === filtro.buscaId) &&
      (!filtro.soMarcadosComoBons || l.marcacao === "bom") &&
      (!filtro.soSemSiteProprio || siteDoLead(l.site) !== "sim") &&
      podeEntrarNaCampanha({ ...l, campanhas: l.campanhaIds.length }),
  );
}
