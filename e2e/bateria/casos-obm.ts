// BATERIA DE DIAGNÓSTICO DO ATENDIMENTO (05/10/2026), casos da OBM.
//
// Saiu da rodada de 05/10 (31 casos x 3, cérebro real): contexto, momento,
// interpretação e fidelidade passaram; o que falhava era conta de calendário, e
// virou o `### CALENDÁRIO` (docs/adr/2026-10-05-turn-calendar-computed-in-code.md).
// Os casos ficam aqui para qualquer mudança de prompt ou de modelo ser conferida
// contra eles (`npm run test:e2e:bateria`, pago, só quando pedido pelo nome).
//
// Relógio fixo por caso. Calendário: seg 05/10/2026, qua 07/10, sex 09/10,
// sáb 10/10, dom 11/10. Prompt FIXO: o avançado da OBM como estava em 05/10
// (e2e/fixtures/persona-obm-2026-10-05.txt), seg a sex 8h às 18h, fim de semana
// fechado; o horário vai no corpo, então o resultado não depende do tenant.

export type Turno = { role: "user" | "assistant"; content: string };
export interface Saida {
  messages: string[];
  action: string;
  summary: string;
  preferencia_horario: string;
  pedido_novo: boolean;
}
export interface Caso {
  id: string;
  dim: "periodo" | "contexto" | "momento" | "interpretacao" | "fidelidade";
  titulo: string;
  agora: string;
  history: Turno[];
  message?: string;
  retomada?: string;
  pedidosAbertos?: string[];
  /** O que o caso espera, em português (vai na mensagem de falha). */
  espera: string;
  /** Falhas checáveis por máquina. Vazio = passou. */
  check: (s: Saida, texto: string) => string[];
  /**
   * Falha CONHECIDA cuja correção é decisão do dono: o caso fica registrado e
   * pulado (`test.fixme`), com o motivo, em vez de deixar a suíte vermelha.
   */
  pendente?: string;
  /**
   * O guardrail barrar a resposta também é aceitável (decisão do dono em
   * 05/10/2026: ele não aceita número escrito pelo cliente, de propósito).
   */
  aceitaGuardrail?: boolean;
  /**
   * Quando a IA pede ajuda (pausar), o motivo gravado tem que ser um destes
   * (lib/motivos.ts, 06/10/2026). Ausente = o caso não confere o motivo.
   */
  motivos?: string[];
}

const QUA_21 = "2026-10-07T21:00:00-03:00";
const QUA_10 = "2026-10-07T10:00:00-03:00";
const QUA_16 = "2026-10-07T16:00:00-03:00";
const SEX_19 = "2026-10-09T19:00:00-03:00";
const SAB_11 = "2026-10-10T11:00:00-03:00";
const DOM_20 = "2026-10-11T20:00:00-03:00";
const SEG_2350 = "2026-10-05T23:50:00-03:00";

const HOJE = /\bhoje\b|ainda hoje|\bagora\b/;
const SABADO = /s[áa]bado/;

// Conversa até o convite aceito, sem dia ainda. Base dos casos de período.
const ATE_CONVITE: Turno[] = [
  { role: "user", content: "Boa noite, vocês fazem orçamento?" },
  {
    role: "assistant",
    content:
      "Boa noite! Aqui é o Tony, da OBS. A gente desenvolve sistemas sob medida, automações e agentes inteligentes pra atendimento.\nMe conta um pouco do seu negócio e o que você tá querendo resolver.",
  },
  { role: "user", content: "tenho uma clinica odontologica e a recepção não da conta do whatsapp" },
  {
    role: "assistant",
    content:
      "Entendi, a recepção atendendo paciente no balcão e o WhatsApp acumulando mensagem sem resposta.\nMais ou menos quantas mensagens chegam por dia?",
  },
  { role: "user", content: "umas 80 por dia" },
  {
    role: "assistant",
    content:
      "Esse é um dos cenários que a gente mais resolve: um atendimento que responde na hora, tira as dúvidas e já encaminha pro agendamento.\nQue tal uma conversa rápida pra eu te mostrar como ficaria montado pra sua clínica?",
  },
  { role: "user", content: "pode ser" },
  { role: "assistant", content: "Ótimo! Qual dia e período ficam melhor pra você?" },
];

const AGENDADO_TERCA: Turno[] = [
  ...ATE_CONVITE,
  { role: "user", content: "terça a tarde" },
  {
    role: "assistant",
    content:
      "Perfeito, deixei reservado pra terça à tarde. Vou te chamar por aqui um pouco antes pra confirmar o horário certinho.\nSe surgir algum imprevisto, é só me avisar que a gente remarca. Obrigado e até terça!",
  },
];

const tem = (t: string, re: RegExp, msg: string) => (re.test(t) ? [] : [msg]);
const naoTem = (t: string, re: RegExp, msg: string) => (re.test(t) ? [msg] : []);
const action = (s: Saida, aceitos: string[]) =>
  aceitos.includes(s.action) ? [] : [`action=${s.action}, esperado ${aceitos.join("|")}`];
const RE_PRECO = /r\$\s?\d|\d+\s*(mil|reais)\b/;
const RE_PRAZO = /\d+\s*(dias?|semanas?|mes(es)?)\b/;

export const CASOS: Caso[] = [
  // ---------------- PERÍODO E HORÁRIO ----------------
  {
    id: "P1",
    dim: "periodo",
    titulo: "BRECHA REAL: \"amanhã\" dito às 21h",
    agora: QUA_21,
    history: ATE_CONVITE,
    message: "amanhã",
    espera: "Entende amanhã = quinta. Pergunta o período (só veio o dia). Nunca fala em hoje nem em 18h de hoje.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...naoTem(t, HOJE, "falou em hoje/agora"),
      ...tem(t, /manh[ãa]|tarde|per[íi]odo|hor[áa]rio/, "não perguntou o período"),
    ],
  },
  {
    id: "P2",
    dim: "periodo",
    titulo: "\"amanhã às 10h\" dito às 21h",
    agora: QUA_21,
    history: ATE_CONVITE,
    message: "pode ser amanhã às 10h",
    espera: "Agenda quinta (amanhã) às 10h, sem falar em hoje.",
    check: (s, t) => [
      ...action(s, ["agendar"]),
      ...naoTem(t, HOJE, "falou em hoje/agora"),
      ...tem(`${t} ${s.preferencia_horario.toLowerCase()}`, /amanh[ãa]|quinta/, "não ancorou em amanhã/quinta"),
    ],
  },
  {
    id: "P3",
    dim: "periodo",
    titulo: "\"ainda hoje?\" às 21h (fora do expediente)",
    agora: QUA_21,
    history: ATE_CONVITE,
    message: "consegue ainda hoje?",
    espera: "Não confirma hoje (expediente acabou às 18h). Sugere o próximo dia útil (amanhã/quinta).",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /amanh[ãa]|quinta/, "não sugeriu amanhã/quinta"),
    ],
  },
  {
    id: "P4",
    dim: "periodo",
    titulo: "Controle: \"hoje à tarde\" às 10h",
    agora: QUA_10,
    history: ATE_CONVITE,
    message: "hoje a tarde pode ser",
    espera: "Hoje à tarde ainda vale: pergunta que horário (só período não agenda, decisão de 06/10). Não empurra para amanhã.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /hor[áa]rio|que horas|qual hora/, "não perguntou o horário"),
      ...naoTem(t, /amanh[ãa]/, "empurrou para amanhã"),
    ],
  },
  {
    id: "P5",
    dim: "periodo",
    titulo: "\"amanhã de manhã\" na sexta 19h (amanhã é sábado, fechado)",
    agora: SEX_19,
    history: ATE_CONVITE,
    message: "amanhã de manhã",
    espera: "Não agenda sábado. Diz que não atende fim de semana e sugere segunda.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /segunda/, "não sugeriu segunda"),
      ...(s.action === "agendar" && SABADO.test(`${t} ${s.preferencia_horario.toLowerCase()}`) ? ["agendou sábado"] : []),
    ],
  },
  {
    id: "P6",
    dim: "periodo",
    titulo: "Sábado 11h, primeiro contato pedindo hoje",
    agora: SAB_11,
    history: [],
    message: "oi, queria marcar uma conversa hoje com vocês",
    espera: "Abertura (apresentação). Não promete hoje (sábado fechado); segunda é o próximo dia útil, ou pergunta o negócio antes.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...(s.action === "agendar" ? ["agendou no sábado"] : []),
      ...naoTem(t, /hoje (consigo|d[áa]|pode|fica)|pode ser hoje/, "aceitou hoje (sábado)"),
    ],
  },
  {
    id: "P7",
    dim: "periodo",
    titulo: "Controle: \"às 17h\" dito às 16h",
    agora: QUA_16,
    history: ATE_CONVITE,
    message: "da pra ser hoje as 17h?",
    espera: "Hoje às 17h ainda está dentro do expediente: agenda hoje. Não empurra para amanhã.",
    check: (s, t) => [
      ...action(s, ["agendar"]),
      ...naoTem(t, /amanh[ãa]/, "empurrou para amanhã"),
      ...tem(`${t} ${s.preferencia_horario}`, /17/, "perdeu o 17h"),
    ],
  },
  {
    id: "P12",
    dim: "periodo",
    titulo: "Decisão do dono (06/10): \"agora à tarde\" às 13h oferece 14h a 17h",
    agora: "2026-10-07T13:00:00-03:00",
    history: ATE_CONVITE,
    message: "pode ser agora a tarde",
    espera: "Pergunta o horário oferecendo 14h, 15h, 16h ou 17h (13h já chegou). Não abre pedido.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /14/, "não ofereceu 14h"),
      ...naoTem(t, /13 ?h|13:00/, "ofereceu 13h, que já chegou"),
    ],
  },
  {
    id: "P8",
    dim: "periodo",
    titulo: "\"amanhã cedo\" na segunda 23h50",
    agora: SEG_2350,
    history: ATE_CONVITE,
    message: "amanhã cedo",
    espera: "Entende terça (amanhã) de manhã: agenda ou só confirma. Nunca diz que já passou.",
    check: (s, t) => [
      ...action(s, ["agendar", "none"]),
      ...naoTem(t, /j[áa] passou/, "disse que já passou"),
      ...naoTem(t, HOJE, "falou em hoje/agora"),
      ...tem(`${t} ${s.preferencia_horario.toLowerCase()}`, /ter[çc]a|amanh[ãa]/, "não ancorou em terça/amanhã"),
    ],
  },
  {
    id: "P9",
    dim: "periodo",
    titulo: "\"amanhã à tarde\" no domingo 20h",
    agora: DOM_20,
    history: ATE_CONVITE,
    message: "amanhã a tarde",
    espera: "Segunda à tarde vale: pergunta que horário. Não diz que não atende (segunda é dia útil).",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /hor[áa]rio|que horas|qual hora/, "não perguntou o horário"),
      ...naoTem(t, HOJE, "falou em hoje/agora"),
    ],
  },
  {
    id: "P11",
    dim: "periodo",
    titulo: "BRECHA REAL: \"pode ser\" às 21h não vira \"hoje às 18h\"",
    agora: QUA_21,
    history: ATE_CONVITE,
    message: "pode ser",
    retomada: undefined,
    espera: "Cliente disse só \"pode ser\" sem dia: pergunta dia e período. Nunca sugere hoje às 18h.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...naoTem(t, /hoje [àa]s 18|18h de hoje/, "sugeriu hoje às 18h"),
      ...naoTem(t, HOJE, "falou em hoje/agora"),
    ],
  },

  // ---------------- CONTEXTO DA CONVERSA ----------------
  {
    id: "C1",
    dim: "contexto",
    titulo: "Prazo pedido depois da descoberta",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 6),
    message: "e quanto tempo leva pra ficar pronto isso?",
    espera: "Não promete prazo; reancora na conversa (pergunta dia ou período).",
    check: (s, t) => [
      ...action(s, ["none", "pausar"]),
      ...naoTem(t, RE_PRAZO, "citou prazo"),
    ],
  },
  {
    id: "C2",
    dim: "contexto",
    titulo: "Não pergunta de novo o que o cliente já disse",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 6),
    message: "como funcionaria isso na pratica?",
    espera: "Explica usando a clínica e o WhatsApp da recepção; não pergunta o segmento de novo.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...naoTem(t, /qual (é )?(o )?seu (neg[óo]cio|segmento)|me conta (um pouco )?(do|sobre o) seu neg[óo]cio/, "perguntou o negócio de novo"),
      ...tem(t, /cl[íi]nica|paciente|recep[çc][ãa]o|consult/, "não usou o contexto da clínica"),
    ],
  },
  {
    id: "C3",
    dim: "contexto",
    titulo: "Cliente muda de ideia depois de agendado",
    agora: QUA_10,
    history: AGENDADO_TERCA,
    message: "na verdade melhor quinta de manhã",
    espera: "Aceita trocar para quinta de manhã e pergunta que horário, sem manter terça.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /quinta/, "não trocou para quinta"),
      ...tem(t, /hor[áa]rio|que horas|qual hora/, "não perguntou o horário"),
    ],
  },
  {
    id: "C4",
    dim: "contexto",
    titulo: "\"obrigado\" depois de agendado",
    agora: QUA_10,
    history: AGENDADO_TERCA,
    message: "obrigado!",
    espera: "Responde curto. Sem pedido de ajuda (nada de pausar) e sem reagendar.",
    check: (s) => action(s, ["none"]),
  },
  {
    id: "C5",
    dim: "contexto",
    titulo: "Pronome: \"e esse aí\" referente à automação citada",
    agora: QUA_10,
    history: [
      ...ATE_CONVITE.slice(0, 4),
      { role: "user", content: "tambem perco muito tempo mandando lembrete de consulta um por um" },
      {
        role: "assistant",
        content:
          "Isso dá pra resolver com uma automação que manda o lembrete sozinha no dia anterior, e o agente de atendimento cuida das mensagens que chegam.",
      },
    ],
    message: "e esse do lembrete, o paciente consegue confirmar respondendo?",
    espera: "Entende que \"esse\" é a automação de lembrete. Não inventa garantia; mostra na conversa.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /lembrete|confirm/, "perdeu a referência ao lembrete"),
    ],
  },

  // ---------------- MOMENTO DA CONVERSA ----------------
  {
    id: "M1",
    dim: "momento",
    titulo: "Primeira mensagem \"oi\"",
    agora: QUA_10,
    history: [],
    message: "oi",
    espera: "Abertura: apresenta e convida a contar o que precisa. Nada de pausar.",
    check: (s, t) => [...action(s, ["none"]), ...tem(t, /tony/, "não se apresentou")],
  },
  {
    id: "M2",
    dim: "momento",
    titulo: "BRECHA REAL: retomada (sem mensagem do cliente) às 21h",
    agora: QUA_21,
    history: [
      ...ATE_CONVITE.slice(0, 6),
      { role: "user", content: "quero falar com alguem sobre valores" },
      { role: "assistant", content: "Claro, vou verificar os valores com o time e já te retorno por aqui." },
    ],
    retomada: "fala pra ele que o dono pode explicar os valores numa call amanha as 15h",
    pedidosAbertos: ["Cliente quer falar com alguém sobre valores."],
    espera: "Dá o retorno: amanhã (quinta) às 15h. Não abre pedido novo (retomada nunca abre pedido).",
    check: (s, t) => [
      ...(s.action === "pausar" && s.pedido_novo ? ["abriu pedido NOVO na retomada"] : []),
      ...tem(t, /15/, "perdeu o 15h"),
      ...tem(t, /amanh[ãa]|quinta/, "sem o dia"),
      ...naoTem(t, HOJE, "falou em hoje/agora"),
    ],
  },
  {
    id: "M3",
    dim: "momento",
    titulo: "BRECHA REAL: \"?\" com pedido de ajuda aberto",
    agora: QUA_10,
    history: [
      ...ATE_CONVITE.slice(0, 6),
      { role: "user", content: "quero falar com alguem sobre valores" },
      { role: "assistant", content: "Claro, vou verificar os valores com o time e já te retorno por aqui." },
    ],
    message: "?",
    pedidosAbertos: ["Cliente quer falar com alguém sobre valores."],
    espera: "Cobrança do mesmo pedido: no máximo repete o pausar com pedido_novo=false. Nunca pedido novo.",
    check: (s) => (s.action !== "none" && s.pedido_novo ? ["abriu pedido NOVO para cobrança"] : []),
  },
  {
    id: "M4",
    dim: "momento",
    titulo: "Cliente volta dias depois",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 6),
    message: "oi, voltei. ainda da pra marcar aquela conversa?",
    espera: "Não se reapresenta; pergunta dia e período.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...naoTem(t, /aqui [ée] o tony/, "se reapresentou"),
      ...tem(t, /dia|per[íi]odo|hor[áa]rio/, "não pediu dia/período"),
    ],
  },
  {
    id: "M5",
    dim: "momento",
    titulo: "\"ok\" quando a IA pediu dia e período",
    agora: QUA_10,
    history: ATE_CONVITE,
    message: "ok",
    espera: "Pede o dia e o período de novo. Sem pausar, sem agendar.",
    check: (s) => action(s, ["none"]),
  },
  {
    id: "M7",
    motivos: ["pessoa"],
    dim: "momento",
    titulo: "BRECHA REAL (06/10): \"consigo conversar agora\" depois de marcado",
    agora: "2026-10-06T11:41:00-03:00",
    history: AGENDADO_TERCA,
    message: "Ok, surgiu uma brecha aqui e eu consigo conversar agora, pode ser ?",
    espera: "Não confirma (não sabe se alguém do time está livre): pausa dizendo que vai ver se alguém consegue agora.",
    check: (s, t) => [
      ...action(s, ["pausar"]),
      ...naoTem(t, /pode ser sim|claro,? pode ser|bora|vamos sim/, "confirmou a conversa agora"),
    ],
  },
  {
    id: "M8",
    motivos: ["pessoa"],
    dim: "momento",
    titulo: "BRECHA REAL (06/10): o resumo conta o que foi combinado e não aconteceu",
    agora: "2026-10-06T14:31:00-03:00",
    history: [
      ...AGENDADO_TERCA,
      { role: "user", content: "Ok, surgiu uma brecha aqui e eu consigo conversar agora, pode ser ?" },
      { role: "assistant", content: "Claro, pode ser sim." },
    ],
    message: "Na verdade não consegui entrar, vamos marcar para agora",
    espera: "Pausa (quer alguém agora). O resumo diz que a conversa imediata combinada antes não aconteceu.",
    check: (s) => [
      ...action(s, ["pausar"]),
      ...tem(s.summary.toLowerCase(), /n[ãa]o (conseguiu|aconteceu|deu certo)|n[ãa]o entrou|falhou/, "o resumo não diz que a conversa combinada não aconteceu"),
      ...tem(s.summary.toLowerCase(), /agora/, "o resumo não diz que quer agora"),
    ],
  },
  {
    id: "M6",
    dim: "momento",
    titulo: "Retomada com orientação que não é horário",
    agora: QUA_10,
    history: [
      ...ATE_CONVITE.slice(0, 4),
      { role: "user", content: "vcs fazem app pra delivery?" },
      { role: "assistant", content: "Vou confirmar isso com o time e já te retorno por aqui." },
    ],
    retomada: "diz que app de delivery a gente nao faz, mas o atendimento no whatsapp sim",
    pedidosAbertos: ["Cliente perguntou se fazemos app de delivery."],
    espera: "Retoma dizendo que app de delivery não, WhatsApp sim. Sem pedido novo.",
    check: (s, t) => [
      ...(s.action === "pausar" && s.pedido_novo ? ["abriu pedido NOVO na retomada"] : []),
      ...tem(t, /delivery|app/, "não deu o retorno"),
    ],
  },

  // ---------------- INTERPRETAÇÃO DO PEDIDO ----------------
  {
    id: "I1",
    dim: "interpretacao",
    titulo: "Pedido vago \"quero um sistema\"",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "quero um sistema",
    espera: "Pergunta o que o sistema resolveria. Não chuta.",
    check: (s, t) => [...action(s, ["none"]), ...tem(t, /\?/, "não perguntou nada")],
  },
  {
    id: "I2",
    dim: "interpretacao",
    titulo: "Dois pedidos: preço e app",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "quanto custa e voces fazem aplicativo?",
    espera: "Não dá preço. Trata os dois assuntos.",
    check: (s, t) => [
      ...action(s, ["none", "pausar"]),
      ...naoTem(t, RE_PRECO, "deu preço"),
      ...tem(t, /app|aplicativo/, "ignorou o aplicativo"),
    ],
  },
  {
    id: "I3",
    dim: "interpretacao",
    titulo: "Fora do escopo: conserto de computador",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "voces consertam computador?",
    espera: "Diz com honestidade que não é o que a OBS faz (ou pausa). Não inventa que faz.",
    check: (s, t) => [
      ...action(s, ["none", "pausar"]),
      ...naoTem(t, /consertamos|fazemos (o )?conserto|sim, (a gente )?conserta/, "disse que conserta"),
    ],
  },
  {
    id: "I4",
    motivos: ["pessoa"],
    dim: "interpretacao",
    titulo: "Pede humano",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "prefiro falar com uma pessoa",
    espera: "pausar.",
    check: (s) => action(s, ["pausar"]),
  },
  {
    id: "I5",
    dim: "interpretacao",
    titulo: "Só o dia: \"pode ser terça\"",
    agora: QUA_10,
    history: ATE_CONVITE,
    message: "pode ser terça",
    espera: "Pergunta o período. Não agenda com informação incompleta.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /manh[ãa]|tarde|per[íi]odo|hor[áa]rio/, "não perguntou o período"),
    ],
  },
  {
    id: "I6",
    dim: "interpretacao",
    titulo: "Só o período: \"de tarde\"",
    agora: QUA_10,
    history: ATE_CONVITE,
    message: "de tarde",
    // Decisão de 06/10: ela pode oferecer os horários de hoje à tarde, desde que
    // DIGA o dia (o cliente corrige se não for). O que reprova é horário sem dia
    // ou agendar sem o horário.
    espera: "Pergunta o dia, ou oferece os horários dizendo o dia (hoje/amanhã). Nunca agenda.",
    check: (s, t) => [
      ...action(s, ["none"]),
      ...tem(t, /dia|quando|hoje|amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta/, "não perguntou nem disse o dia"),
    ],
  },

  // ---------------- FIDELIDADE À BASE ----------------
  {
    id: "F1",
    dim: "fidelidade",
    titulo: "Preço de um CRM",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "qual o preço de um crm?",
    espera: "Não dá preço; reancora com pergunta.",
    check: (s, t) => [...action(s, ["none", "pausar"]), ...naoTem(t, RE_PRECO, "deu preço")],
  },
  {
    id: "F2",
    dim: "fidelidade",
    titulo: "Pede case e link",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 4),
    message: "ja fizeram pra alguma clinica? me manda o link de um case",
    espera: "Não inventa cliente nem link; diz que mostra na conversa.",
    check: (s, t) => [
      ...action(s, ["none", "pausar"]),
      ...naoTem(t, /https?:|www\.|\.com/, "mandou link"),
    ],
  },
  {
    id: "F3",
    dim: "fidelidade",
    titulo: "Endereço (não está no prompt)",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "qual o endereço de voces?",
    espera: "Não inventa endereço.",
    check: (s, t) => [...naoTem(t, /\b(rua|avenida|av\.)\s+[a-z]/, "inventou endereço")],
  },
  {
    id: "F4",
    dim: "fidelidade",
    titulo: "Atendem sábado?",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "voces atendem sabado?",
    espera: "Diz que não (seg a sex).",
    check: (s, t) => [
      ...tem(t, /\bn[ãa]o\b|segunda a sexta/, "não disse que não atende"),
      ...naoTem(t, /\bsim\b[^.]*s[áa]bado|(?<!n[ãa]o )atendemos (aos? )?s[áa]bado/, "disse que atende sábado"),
    ],
  },
  {
    id: "F5",
    dim: "fidelidade",
    titulo: "Horário de atendimento",
    agora: QUA_10,
    history: ATE_CONVITE.slice(0, 2),
    message: "qual o horario de atendimento?",
    espera: "Segunda a sexta, 8h às 18h.",
    check: (s, t) => [...tem(t, /\b0?8(h|:00)|oito/, "sem o 8h"), ...tem(t, /18|seis/, "sem o 18h")],
  },
];
