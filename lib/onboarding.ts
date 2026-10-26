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

/**
 * Os cinco passos do assistente. Não são os mesmos quatro sinais acima.
 *
 * ⚠️ "avisos" virou passo próprio, o ÚLTIMO, em 23/10/2026 (dono): o destino dos
 * avisos tinha ido para o passo 1, mas o grupo e o "Mandar teste" só existem
 * depois de conectar, e um passo que depende do último não faz sentido.
 */
export type PassoMontagem = "quem" | "sabe" | "testar" | "conectar" | "avisos";

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
  /**
   * clients.notify_group_jid preenchida: existe para onde mandar os avisos
   * (29/09/2026, decisão do dono: obrigatório na PRIMEIRA ativação, porque
   * quem não vive na tela não fica sabendo quando a IA pede ajuda).
   */
  hasNotify: boolean;
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
  /**
   * O passo em uma linha, para o mapa da ABERTURA (23/10/2026, dono): quem chega
   * vê os cinco antes de começar, e o do QR já avisa do computador.
   */
  resumo: string;
}

export const PASSOS_MONTAGEM: PassoDef[] = [
  {
    key: "quem",
    titulo: "Quem atende",
    porque:
      "Sem isto o agente não sabe de qual empresa ele fala, nem que nome dar quando perguntarem com quem estão falando.",
    resumo: "A empresa, o agente e o horário de atendimento.",
  },
  {
    key: "sabe",
    titulo: "O que ele sabe",
    porque:
      "É daqui que sai uma resposta de verdade no lugar de um vou verificar: tudo que você escrever aqui o agente sabe de cor.",
    resumo: "O que ele precisa saber para responder, em texto ou em documentos.",
  },
  {
    // Testar vem ANTES de conectar, de propósito: a bancada não precisa de
    // WhatsApp, e testar depois de conectar só faria sentido pelo número de
    // verdade, com o agente já respondendo, que é o medo que a ordem nova tira.
    key: "testar",
    // Título e frase encurtados em 26/09/2026 (dono): "Testar" sozinho era
    // pobre, e a frase longa empurrava a conversa para baixo da dobra.
    titulo: "Teste o seu agente",
    porque:
      "Escreva ou grave um áudio como um cliente faria. Nada sai daqui.",
    resumo: "Você conversa com ele como um cliente faria. Nada sai daqui.",
  },
  {
    key: "conectar",
    // Era "Conectar e ativar" até 23/10/2026: ativar foi para o passo 5.
    titulo: "Conectar o WhatsApp",
    porque:
      // Uma frase só (26/09/2026, dono): o passo tinha esta, uma caixa dizendo
      // o mesmo e mais três instruções. Os passos de COMO conectar estão na
      // própria área do código, no molde do WhatsApp Web.
      "Conectar não liga o agente: ele só começa a responder quando você ativar.",
    resumo: "Você lê o QR com o celular da empresa. Isso ainda não liga o agente.",
  },
  {
    // O DIFERENCIAL, em passo próprio (23/10/2026, dono). Vem depois de
    // conectar porque o grupo sai da lista do próprio WhatsApp e o teste sai do
    // número conectado; e é o último porque ativar exige o destino salvo.
    key: "avisos",
    titulo: "Quem a IA chama",
    porque:
      "Quando a IA precisa de alguém, ela chama o time e avisa num número ou grupo do WhatsApp, e segue atendendo.",
    resumo: "O número ou o grupo que a IA avisa quando precisa de alguém.",
  },
];

/**
 * O exemplo do passo 5 ("Quem a IA chama"), no bloco do destino dos avisos.
 * Os avisos não são item da revisão: são o próprio passo, logo acima dela.
 */
export const EXEMPLO_DO_PEDIDO_DE_AJUDA =
  "um cliente pede algo que só o time decide: a IA diz que vai verificar, e o aviso chega aqui na hora.";

/**
 * A frase do computador (23/10/2026, dono). Ninguém pode chegar ao passo 4 sem
 * saber que ele pede um computador: até aqui o aviso só aparecia NO passo 4, no
 * celular, depois de a pessoa ter investido tudo. Mora colada no passo 4 do
 * mapa da abertura, por isso não repete o nome do passo.
 */
export const AVISO_COMPUTADOR =
  "Precisa de um computador: você lê o QR com o celular da empresa.";

/**
 * A REVISÃO ANTES DE ATIVAR (23/10/2026, dono): o que faz diferença e costuma
 * passar batido, cada um com o seu porquê e um exemplo. Três deles (regras,
 * horário e a mensagem de quando chama alguém) não têm campo nos passos da
 * montagem (`mostrarOpcionais={false}`): a conta ia ao ar com o padrão sem ver.
 * A revisão mostra o que está valendo e abre o campo ali mesmo.
 *
 * ⚠️ NÃO BLOQUEIA. Só os avisos são obrigatórios na primeira ativação, e quem
 * diz isso é `publishBlockers`, não esta lista.
 *
 * Texto fixo: vale para qualquer segmento (mesma regra de `PassoDef.porque`).
 */
export type ItemDaRevisao = "regras" | "documentos" | "horario" | "mensagem";

/**
 * `padrao` = tem valor, mas é o que veio pronto (a mensagem genérica): vale
 * conferir. `nao_conferido` = o horário sugerido que ninguém conferiu, e que por
 * isso não vale (`hoursConfirmed`). `conferindo` = a contagem ainda não chegou.
 */
export type EstadoDaRevisao = "preenchido" | "vazio" | "padrao" | "nao_conferido" | "conferindo";

/**
 * Na revisão cada item é UMA linha com o título e o valor (26/10/2026, dono:
 * "muito texto, ele já passou lá atrás"). O `porque` só existe onde um passo o
 * mostra num destaque: horário (passo 1) e documentos (passo 2).
 */
export interface ItemDaRevisaoDef {
  key: ItemDaRevisao;
  titulo: string;
  porque?: string;
}

export const ITENS_DA_REVISAO: ItemDaRevisaoDef[] = [
  { key: "regras", titulo: "Regras" },
  {
    key: "documentos",
    titulo: "Documentos",
    porque: "Quanto mais ela sabe, menos ela precisa te chamar.",
  },
  {
    key: "horario",
    titulo: "Horário de atendimento",
    porque:
      "A IA responde a qualquer hora, e é por este horário que ela diz quando a empresa atende e se está aberta agora.",
  },
  { key: "mensagem", titulo: "Mensagem ao chamar o time" },
];

export interface RevisaoInput {
  /** Itens de `dontDo` e de `escalateWhen`. */
  nuncaFaz: number;
  chamaQuando: number;
  /** Documentos na base; null = a contagem ainda não chegou. */
  documentos: number | null;
  /** `agent_config.hoursConfirmed`: alguém conferiu o horário. */
  horarioConferido: boolean;
  /** `handoffNotice` preenchido; vazio = a frase padrão. */
  mensagem: boolean;
}

export function revisaoAntesDeAtivar(
  input: RevisaoInput
): Record<ItemDaRevisao, EstadoDaRevisao> {
  return {
    regras: input.nuncaFaz + input.chamaQuando > 0 ? "preenchido" : "vazio",
    documentos:
      input.documentos === null
        ? "conferindo"
        : input.documentos > 0
          ? "preenchido"
          : "vazio",
    horario: input.horarioConferido ? "preenchido" : "nao_conferido",
    mensagem: input.mensagem ? "preenchido" : "padrao",
  };
}

export interface MontagemState {
  /** Onde o assistente retoma. */
  passo: PassoMontagem;
  /** Posição de `passo` em PASSOS_MONTAGEM (0 a 4). */
  indice: number;
  total: number;
  /**
   * Já publicou alguma vez. É o que faz o assistente sumir para sempre e a linha
   * de aviso sair de todas as páginas.
   */
  completo: boolean;
  feito: Record<StepKey, boolean>;
}

/**
 * A montagem está terminada quando o agente já foi ao ar alguma vez
 * (`agent_published_at` preenchido, que nunca é limpo). A regra mora aqui e
 * `montagemState` e a central do dono a usam; ninguém recalcula.
 */
export function montagemTerminada(publicada: boolean): boolean {
  return !!publicada;
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
    completo: montagemTerminada(feito.publicar),
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
  if (!input.hasNotify) faltas.push("definir para onde vão os avisos");
  return faltas;
}
