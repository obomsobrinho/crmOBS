import type { PeriodoKey } from "@/lib/periodo";
import {
  podeEntrarNaCampanha,
  siteDoLead,
  type DiaDeEnvio,
  type MarcacaoDoLead,
  type ResultadoDaCampanha,
  type ResumoDobrado,
  type OpcoesDaBusca,
  type SituacaoDaBusca,
  type SituacaoDaCampanha,
  type SituacaoNaCampanha,
} from "@/lib/prospeccao";

// Os tipos que as telas de Campanhas recebem e a FONTE de onde as telas leem
// (`FonteDeCampanhas`): a página de verdade lê das rotas `/api/admin/campanhas/*`
// (`lib/campanhas-fonte.ts`, páginas de 10 e contas no servidor); o preview
// (`/design/campanhas`) lê de dados de mentira em memória pela MESMA interface.

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
  /** null enquanto o estado não chegou (o navegador pergunta depois de abrir). */
  conectado: boolean | null;
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

// ── O que a fonte entrega às telas ──────────────────────────────────────

export interface Pagina<T> {
  itens: T[];
  /** O total do recorte (o "de 137" do rodapé), contado no servidor. */
  total: number;
}

/** Os números de uma busca na tabela de buscas. */
export interface ContagemDaBusca {
  total: number;
  comCelular: number;
  bons: number;
  contatados: number;
  responderam: number;
}

export interface BuscaDaTabela extends Busca {
  contagem: ContagemDaBusca;
}

/** Um lead na tabela, com o nome de cada campanha por onde passou e se respondeu a alguma. */
export interface LeadDaTabela extends Lead {
  campanhas: { id: string; nome: string }[];
  respondeu: boolean;
}

/** Os recortes do botão de filtro da tabela de leads. */
export type FiltroDosLeads = "nao_contatados" | "bons" | "sem_site" | "nota";

/** A campanha sem os envios: o que o assistente edita e o topo do detalhe mostra. */
export type CampanhaEditavel = Omit<Campanha, "envios">;

/** Uma linha da tabela de campanhas: os números contados no servidor e os envios dos últimos 14 dias. */
export interface CampanhaDaTabela extends Omit<CampanhaEditavel, "filtro" | "variantes"> {
  total: number;
  enviados: number;
  falharam: number;
  responderam: number;
  serie: DiaDeEnvio[];
}

/** O detalhe aberto: a campanha e quantos leads em cada situação. */
export interface CampanhaAberta {
  campanha: CampanhaEditavel;
  contagens: Record<SituacaoNaCampanha, number>;
}

/** Um lead dentro de uma campanha (a tabela do detalhe). */
export interface LeadNaCampanha {
  leadId: string;
  nome: string;
  bairro: string;
  cidade: string;
  situacao: SituacaoNaCampanha;
  variante: number | null;
  enviadoEm: number | null;
  respondeuEm: number | null;
}

/** O painel de resultados já dobrado (`resultadoDaCampanha`, ou o SQL pelo seu gêmeo). */
export interface Resultados {
  atual: ResultadoDaCampanha;
  /** A janela anterior igual (os selos); null no detalhe de uma campanha. */
  anterior: ResultadoDaCampanha | null;
  espera: { chave: string; rotulo: string; n: number }[];
  /** Os envios por dia (o gráfico do resumo e os mini gráficos da faixa). */
  serie: DiaDeEnvio[];
}

/** Quantos entram pelo recorte do passo Contatos e os primeiros nomes. */
export interface PreviaDoFiltro {
  total: number;
  primeiros: string[];
  /** O nome da campanha de origem em "quem não respondeu". */
  origem: string | null;
}

/** As contagens do topo (as abas) e dos botões de filtro. */
export interface Totais {
  leads: number;
  buscas: Record<SituacaoDaBusca, number>;
  campanhas: Record<SituacaoDaCampanha, number>;
}

export type RespostaDeIniciar = { ok: true; situacao: SituacaoDaCampanha } | { ok: false; erro: string };

/** De onde as telas de Campanhas leem e para onde escrevem. */
export interface FonteDeCampanhas {
  totais(): Promise<Totais>;
  conexoes(): Promise<ConexaoDisponivel[]>;
  buscas(p: { texto: string; situacao: SituacaoDaBusca | null; pagina: number }): Promise<Pagina<BuscaDaTabela>>;
  /** As buscas do seletor do assistente (as mais novas primeiro). */
  buscasParaEscolher(): Promise<Busca[]>;
  busca(id: string): Promise<Busca | null>;
  novaBusca(o: OpcoesDaBusca): Promise<{ ok: true } | { ok: false; erro: string }>;
  leads(p: { buscaId: string | null; texto: string; cidade: string | null; filtros: FiltroDosLeads[]; pagina: number }): Promise<Pagina<LeadDaTabela>>;
  cidades(buscaId: string | null): Promise<string[]>;
  marcar(id: string, marcacao: MarcacaoDoLead): Promise<MarcacaoDoLead>;
  painelDaBase(buscaId: string | null): Promise<ResumoDobrado>;
  campanhas(p: { texto: string; situacao: SituacaoDaCampanha | null; pagina: number }): Promise<Pagina<CampanhaDaTabela>>;
  /** As campanhas que já enviaram algo (o seletor do painel de resultados). */
  campanhasComEnvio(): Promise<{ id: string; nome: string }[]>;
  /** `periodo` null = desde o início (o detalhe de uma campanha). */
  resultados(p: { campanhaId: string | null; periodo: PeriodoKey | null }): Promise<Resultados>;
  campanha(id: string): Promise<CampanhaAberta | null>;
  leadsDaCampanha(id: string, p: { texto: string; situacao: SituacaoNaCampanha | null; pagina: number }): Promise<Pagina<LeadNaCampanha>>;
  previaDoFiltro(f: FiltroDeContatos): Promise<PreviaDoFiltro>;
  /** Salva o rascunho (cria na primeira vez); devolve quando salvou. */
  salvar(c: CampanhaEditavel): Promise<number>;
  iniciar(id: string): Promise<RespostaDeIniciar>;
  pausar(id: string): Promise<SituacaoDaCampanha>;
  retomar(id: string): Promise<SituacaoDaCampanha>;
}
