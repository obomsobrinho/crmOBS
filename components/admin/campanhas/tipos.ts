import type { JanelaDeEnvio, SinaisDoLead, SituacaoDoLead } from "@/lib/prospeccao";

// Os tipos que as telas de Campanhas recebem. Hoje só o preview (`/design/campanhas`)
// os preenche, com dados de mentira; a tela de verdade vai ler das tabelas
// propostas em docs/plano-campanhas.md (seção 8).

/** Uma empresa achada pela busca (ainda não gravada). */
export interface EmpresaAchada {
  /** O id da fonte (place id do Google, por exemplo): a única coisa da busca que se pode guardar sem limite. */
  fonteId: string;
  nome: string;
  segmento: string;
  bairro: string;
  cidade: string;
  telefone: string;
  site: string | null;
  nota: number | null;
  avaliacoes: number | null;
  /** O horário como a fonte escreve, para a tela. */
  horario: string;
  sinais: SinaisDoLead;
}

/** Um lead escolhido pelo dono (gravado na campanha). */
export interface LeadDaCampanha extends EmpresaAchada {
  id: string;
  situacao: SituacaoDoLead;
  toque: number;
  abordadoEm: number | null;
  respondeuEm: number | null;
  proximoToqueEm: number | null;
  /** A última mensagem que a pessoa mandou, para "Respostas recentes". */
  ultimaResposta: string | null;
}

/** A configuração da campanha (o que a aba Campanha edita). */
export interface ConfigDaCampanha {
  nome: string;
  segmento: string;
  cidade: string;
  /** Um modelo de texto por toque, com campos entre chaves. */
  textos: [string, string, string];
  tetoDiario: number;
  pausaMinutos: [number, number];
  janela: JanelaDeEnvio;
  baseLegalRef: string;
  ativa: boolean;
}

/** O número dedicado da prospecção, como a tela de saúde mostra. */
export interface NumeroDaProspeccao {
  conectado: boolean;
  /** Dias desde que o número conectou; null = desconhecido (vale o degrau mais lento). */
  idadeDias: number | null;
  enviadasHoje: number;
}

export type AbaDeCampanhas = "fila" | "leads" | "resultados" | "campanha";

export const ABAS_DE_CAMPANHAS: AbaDeCampanhas[] = ["fila", "leads", "resultados", "campanha"];
