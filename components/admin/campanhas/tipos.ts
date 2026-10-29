import type {
  JanelaDeEnvio,
  MomentoDaSaida,
  Oferta,
  SinaisDoLead,
  SituacaoDoLead,
  TextosDaCampanha,
  VozDaCampanha,
} from "@/lib/prospeccao";

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
  /** O que a campanha oferece (a OBS vende sites e o Atenda); decide o ângulo de cada lead. */
  ofertas: Oferta[];
  /**
   * A conexão (número de WhatsApp) que envia. Decisão do dono (29/10/2026): um campo simples, ele
   * escolhe qualquer uma; o produto não exige número dedicado. A resposta cai na empresa dessa conexão.
   */
  conexaoId: string | null;
  /** "O que oferecer e como começar": a instrução para a IA que continua a conversa. */
  comoComecar: string;
  /** Quando considerar o lead qualificado (a IA marca e o funil anda). */
  qualificado: string;
  /** Objeções esperadas e a resposta de cada uma (para o dono e para a IA). */
  objecoes: { objecao: string; resposta: string }[];
  /** Em qual mensagem entra a linha "responda SAIR". */
  saida: MomentoDaSaida;
  /** Quem assina e o que diz de si (voz e vocabulário). */
  voz: VozDaCampanha;
  /** Os modelos de texto, com campos entre chaves; a primeira mensagem muda com o ângulo. */
  textos: TextosDaCampanha;
  tetoDiario: number;
  pausaMinutos: [number, number];
  janela: JanelaDeEnvio;
  baseLegalRef: string;
  ativa: boolean;
}

/** Uma conexão de WhatsApp que pode enviar a campanha (uma por empresa no produto de hoje). */
export interface ConexaoDisponivel {
  id: string;
  /** O nome da empresa dona da conexão (onde as respostas caem). */
  nome: string;
  conectado: boolean;
  /** Mensagens desta campanha que já saíram hoje por esta conexão. */
  enviadasHoje: number;
}

export type AbaDeCampanhas = "fila" | "leads" | "resultados" | "campanha";

export const ABAS_DE_CAMPANHAS: AbaDeCampanhas[] = ["fila", "leads", "resultados", "campanha"];
