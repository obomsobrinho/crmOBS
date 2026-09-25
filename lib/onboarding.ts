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
//
// ⚠️ A ORDEM FOI INVERTIDA EM 24/09/2026 (decisão do dono). Era conectar, quem,
// sabe, testar e ativar; virou quem, sabe, testar, conectar e ativar. Motivo: a
// pessoa tinha medo de ligar o WhatsApp e o agente sair respondendo antes de ela
// terminar de configurar. Isso nunca aconteceu (o `processTurn` fica mudo
// enquanto `agent_published_at` é nulo), mas pedir o número no primeiro passo
// passava exatamente essa impressão. Agora ela investe primeiro no que é fácil,
// vê o agente funcionando na bancada (que não precisa de WhatsApp), e só no fim
// liga o número. E conectar NÃO liga o agente: ativar é um gesto separado.

/** Sinais no banco. Um por coluna de `clients`. */
export type StepKey = "conectar" | "configurar" | "testar" | "publicar";

/** Os quatro passos do assistente. Não são os mesmos quatro sinais acima. */
export type PassoMontagem = "quem" | "sabe" | "testar" | "conectar";

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
    // Testar vem ANTES de conectar, de propósito: a bancada não precisa de
    // WhatsApp, e testar depois de conectar só faria sentido pelo número de
    // verdade, com o agente já respondendo, que é o medo que a ordem nova tira.
    key: "testar",
    titulo: "Testar",
    porque:
      "Converse com ele como se fosse alguém chamando no WhatsApp. Nada sai daqui e ninguém recebe mensagem.",
  },
  {
    key: "conectar",
    titulo: "Conectar e ativar",
    porque:
      "Ligue o número que vai atender, pelo QR code ou pelo próprio número. Depois disso, ativar é com você.",
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

  // Onde retomar. Só o sinal de trabalho IRREVERSÍVEL conta: configurar. "O que
  // ele sabe" e testar são opcionais e não têm sinal que diga "parou aqui",
  // então quem já configurou cai direto em conectar; se parou no meio de um
  // deles, quem sabe disso é o rascunho no navegador, que manda no que vem
  // depois.
  // ⚠️ A instância deixou de ser piso em 24/09/2026: conectar é o ÚLTIMO passo,
  // e ter conectado antes de configurar não pula nada.
  const passo: PassoMontagem = !feito.configurar ? "quem" : "conectar";

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
 * atender pela primeira vez. O assistente continua OFERECENDO o teste, num passo
 * próprio (o 3); ele só não barra mais.
 *
 * ⚠️ `hasInstance` é a instância CRIADA, que nasce ao pedir o QR ou o código, e
 * não ao conectar. Por isso a rota de publicação confere também o estado real
 * na Evolution, na primeira ativação (24/09/2026). Isso fica lá, e não aqui,
 * porque este módulo é puro e não faz rede.
 */
export function publishBlockers(input: OnboardingInput): string[] {
  const faltas: string[] = [];
  if (!input.hasInstance) faltas.push("conectar o WhatsApp");
  if (!input.agentConfigured) faltas.push("configurar o agente");
  return faltas;
}
