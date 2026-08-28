// A montagem da conta: os quatro passos do assistente de `/montagem` e a regra
// de quando dá para ativar o agente.
//
// Módulo PURO (zero imports, como lib/billing.ts e lib/agent-prompt.ts):
// servidor calcula, browser desenha, /design renderiza sem banco.
//
// ⚠️ ESTE ARQUIVO MUDOU DE FORMA EM 28/08/2026. Antes ele descrevia um TRILHO
// por cima do produto (a `OnboardingBar`, que aparecia em toda página com "2 de
// 4" e mandava a pessoa para telas que já existiam). Aquilo virou um assistente
// de tela cheia em rota própria, então o que sobrou aqui é: quais são os quatro
// passos, onde retomar, e o que falta para ativar. A barra e o `onboardingState`
// que a alimentava não existem mais.

/** Sinais no banco. Um por coluna de `clients`. */
export type StepKey = "conectar" | "configurar" | "testar" | "publicar";

/** Os quatro passos do assistente. Não são os mesmos quatro sinais acima. */
export type PassoMontagem = "conectar" | "quem" | "sabe" | "ativar";

export interface OnboardingInput {
  /** clients.evolution_instance preenchida. */
  hasInstance: boolean;
  /** clients.agent_config_updated_at preenchida (salvou o agente em algum modo). */
  agentConfigured: boolean;
  /**
   * clients.onboarding_tested_at preenchida (mandou pelo menos 1 msg na bancada).
   *
   * ⚠️ NÃO é mais pré-requisito de nada (decisão do dono, 28/08/2026): exigir um
   * teste para ativar transformava "corrigir uma frase e religar" num ritual.
   * Continua sendo gravado pelo /api/playground, e continua servindo de dado.
   */
  tested: boolean;
  /** clients.agent_published_at preenchida. */
  published: boolean;
}

export interface PassoDef {
  key: PassoMontagem;
  titulo: string;
  /**
   * Uma frase de por que o passo importa.
   *
   * ⚠️ Escrita para funcionar ao mesmo tempo para advogado, pediatra, barbeiro,
   * engenheiro, clínica e loja. Nenhuma delas pode dizer consulta, paciente,
   * agendamento, procedimento, processo, produto, estoque ou obra. Quem carrega
   * a linguagem do segmento é o preset, nunca o texto fixo da tela.
   */
  porque: string;
}

export const PASSOS_MONTAGEM: PassoDef[] = [
  {
    key: "conectar",
    titulo: "Conectar o WhatsApp",
    porque:
      "O agente responde do seu próprio número, então ele precisa estar ligado aqui antes de qualquer outra coisa.",
  },
  {
    key: "quem",
    titulo: "Quem atende",
    porque:
      "Sem isto o agente não sabe de qual empresa ele fala, nem que nome dar quando perguntarem com quem estão falando.",
  },
  {
    key: "sabe",
    titulo: "O que ele sabe",
    porque:
      "É daqui que sai uma resposta de verdade no lugar de um vou verificar: tudo que você escrever aqui o agente sabe de cor.",
  },
  {
    key: "ativar",
    titulo: "Testar e ativar",
    porque:
      "Fale com ele uma vez antes que qualquer pessoa fale, e depois ligue a chave.",
  },
];

export interface MontagemState {
  /** Onde o assistente retoma. */
  passo: PassoMontagem;
  /** Posição de `passo` em PASSOS_MONTAGEM (0 a 3). */
  indice: number;
  total: number;
  /**
   * Já publicou alguma vez. É o que faz o assistente sumir para sempre e a linha
   * de aviso sair de todas as páginas.
   */
  completo: boolean;
  feito: Record<StepKey, boolean>;
}

export function montagemState(input: OnboardingInput): MontagemState {
  const feito: Record<StepKey, boolean> = {
    conectar: !!input.hasInstance,
    configurar: !!input.agentConfigured,
    testar: !!input.tested,
    publicar: !!input.published,
  };

  // Onde retomar. Só os sinais que representam trabalho IRREVERSÍVEL contam:
  // conectar e configurar. "O que ele sabe" é opcional e não tem sinal próprio,
  // então quem já configurou cai direto em ativar; se ele parou no meio do passo
  // 3, quem sabe disso é o rascunho no navegador, que manda no que vem depois.
  const passo: PassoMontagem = !feito.conectar
    ? "conectar"
    : !feito.configurar
      ? "quem"
      : "ativar";

  return {
    passo,
    indice: PASSOS_MONTAGEM.findIndex((p) => p.key === passo),
    total: PASSOS_MONTAGEM.length,
    completo: feito.publicar,
    feito,
  };
}

/**
 * O que falta para poder ativar. Usado pela rota de publicação (o gate de
 * verdade) e pela UI, para não haver duas opiniões sobre a mesma regra.
 *
 * ⚠️ TESTAR SAIU DAQUI (decisão do dono, 28/08/2026). O gate já valia só na
 * primeira ativação, mas mesmo assim obrigava um teste antes de o agente poder
 * atender pela primeira vez. O assistente continua OFERECENDO o teste no passo
 * 4, com destaque; ele só não barra mais.
 */
export function publishBlockers(input: OnboardingInput): string[] {
  const faltas: string[] = [];
  if (!input.hasInstance) faltas.push("conectar o WhatsApp");
  if (!input.agentConfigured) faltas.push("configurar o agente");
  return faltas;
}
