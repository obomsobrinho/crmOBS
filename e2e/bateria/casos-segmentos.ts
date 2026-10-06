// BATERIA DE DIAGNÓSTICO, segunda rodada (05/10/2026): modo GUIADO, 4 segmentos a
// partir de lib/agent-presets.ts, cada um com horário próprio e uma base curta
// FICTÍCIA. A base vai no campo "detalhes" da configuração (o RAG é do tenant
// logado e o corpo não o controla).
// Calendário: seg 05/10/2026, qua 07/10, sex 09/10, sáb 10/10, dom 11/10.
import type { AgentConfig } from "../../lib/agent-prompt";
import type { Caso, Saida, Turno } from "./casos-obm";

type H = AgentConfig["hours"];
const d = (open: boolean, from = "09:00", to = "18:00") => ({ open, from, to });

export interface Segmento {
  id: string;
  presetId: string;
  over: Partial<AgentConfig>;
  kb: string[];
  /** Expediente em texto, para a mensagem de falha. */
  expediente: string;
  casos: Caso[];
}

const QUA_10 = "2026-10-07T10:00:00-03:00";
const QUA_15 = "2026-10-07T15:00:00-03:00";
const QUA_21 = "2026-10-07T21:00:00-03:00";
const QUA_2330 = "2026-10-07T23:30:00-03:00";
const SEX_17 = "2026-10-09T17:00:00-03:00";
const SEX_19 = "2026-10-09T19:00:00-03:00";
const SAB_11 = "2026-10-10T11:00:00-03:00";
const SAB_14 = "2026-10-10T14:00:00-03:00";
const SAB_15 = "2026-10-10T15:00:00-03:00";
const DOM_10 = "2026-10-11T10:00:00-03:00";
const SEG_20 = "2026-10-05T20:00:00-03:00";

const HOJE = /\bhoje\b|ainda hoje|\bagora\b/;
const tem = (t: string, re: RegExp, msg: string) => (re.test(t) ? [] : [msg]);
const naoTem = (t: string, re: RegExp, msg: string) => (re.test(t) ? [msg] : []);
const action = (s: Saida, aceitos: string[]) =>
  aceitos.includes(s.action) ? [] : [`action=${s.action}, esperado ${aceitos.join("|")}`];
const MINUTOS = /\d+\s*(a\s*\d+\s*)?(min|minutos|horas?|dias?)\b/;

function convite(oi: string, resp: string): Turno[] {
  return [
    { role: "user", content: oi },
    { role: "assistant", content: resp },
  ];
}

// ---------------- ODONTOLOGIA ----------------
const ODONTO: Segmento = {
  id: "odonto",
  presetId: "odontologia",
  over: {
    companyName: "Sorriso Pleno",
    agentName: "Carla",
    hours: {
      seg: d(true, "08:00", "18:00"), ter: d(true, "08:00", "18:00"), qua: d(true, "08:00", "18:00"),
      qui: d(true, "08:00", "18:00"), sex: d(true, "08:00", "18:00"), sab: d(true, "08:00", "12:00"), dom: d(false),
    } as H,
    details:
      "Tratamentos: limpeza, clareamento, canal, implante, ortodontia (aparelho) e odontopediatria.\nConvênios aceitos: Amil Dental e OdontoPrev.\nPrimeira avaliação: gratuita, cerca de 30 minutos, com o dentista.\nPagamento: pix, cartão em até 10x.",
  },
  kb: [
    "Limpeza (profilaxia): R$ 180, feita em uma sessão. Os demais tratamentos têm valor definido só depois da avaliação.",
    "Atendemos crianças a partir de 3 anos com a Dra. Paula, odontopediatra.",
    "Urgência: em caso de dor forte ou inchaço, o paciente é encaixado no mesmo dia, se houver horário. Não orientamos medicação pelo WhatsApp.",
  ],
  expediente: "segunda a sexta 08:00 às 18:00, sábado 08:00 às 12:00, domingo fechado",
  casos: [],
};
const O_INI = convite("oi, boa tarde", "Boa tarde! Aqui é a Carla, da Sorriso Pleno. Como posso te ajudar?");
ODONTO.casos = [
  { id: "O1", dim: "fidelidade", titulo: "Preço da limpeza (está na base)", agora: QUA_10, history: O_INI, message: "quanto custa a limpeza?",
    espera: "Diz R$ 180 (está na base).", check: (s, t) => tem(t, /180/, "não deu o valor da base") },
  { id: "O2", dim: "fidelidade", titulo: "Preço de implante (só após avaliação)", agora: QUA_10, history: O_INI, message: "e implante, quanto fica?",
    espera: "Não dá preço; explica que depende da avaliação (gratuita). Pausar é aceitável (orçamento).", check: (s) => action(s, ["none", "pausar"]) },
  { id: "O3", motivos: ["urgencia"], dim: "interpretacao", titulo: "Dor forte e inchaço", agora: QUA_10, history: O_INI, message: "to com muita dor no dente e o rosto ta inchando",
    espera: "Pausa (urgência), sem indicar remédio.", check: (s, t) => [...action(s, ["pausar"]), ...naoTem(t, /ibuprofeno|paracetamol|dipirona|amoxicilina|nimesulida/, "citou remédio")] },
  { id: "O4", dim: "fidelidade", titulo: "Convênio fora da lista", agora: QUA_10, history: O_INI, message: "aceita unimed odonto?",
    espera: "Não afirma que aceita; cita os convênios da base ou confirma com o time.", check: (s, t) => naoTem(t, /\bsim\b|(?<!n[ãa]o )aceitamos (sim|unimed)/, "disse que aceita") },
  { id: "O5", dim: "periodo", titulo: "Sábado 11h: \"consigo ir hoje?\" (aberto até 12h)", agora: SAB_11, history: O_INI, message: "consigo passar hoje ainda pra uma avaliação?",
    espera: "Não diz que não abre sábado. Hoje ainda abre até 12h; pode oferecer hoje ou confirmar com o time.", check: (s, t) => naoTem(t, /n[ãa]o (abrimos|atendemos|funcionamos)( aos| no| de)? s[áa]bado/, "disse que não abre sábado") },
  { id: "O6", dim: "periodo", titulo: "Sábado 14h: \"hoje ainda?\" (fechou às 12h)", agora: SAB_14, history: O_INI, message: "da pra ir hoje ainda?",
    // Pausar também passa (06/10/2026): ela diz que encerrou e se oferece para ver
    // um horário de segunda com o time. O que reprova é aceitar hoje ou não
    // dizer quando abre. Se o dono quiser que isso nunca vire pedido, muda aqui.
    espera: "Hoje já encerrou; sugere segunda.", check: (s, t) => [...action(s, ["none", "pausar"]), ...tem(t, /segunda/, "não sugeriu segunda")] },
  { id: "O7", dim: "periodo", titulo: "Sexta 19h: \"amanhã de manhã\" (sábado ABRE)", agora: SEX_19,
    history: [...O_INI, { role: "user", content: "quero marcar uma avaliação" }, { role: "assistant", content: "Claro! Qual dia e período ficam melhor pra você?" }],
    message: "amanhã de manhã", espera: "Sábado de manhã vale (a clínica abre): pergunta que horário. Não empurra para segunda.",
    check: (s, t) => [...action(s, ["none"]), ...tem(t, /hor[áa]rio|que horas|qual hora/, "não perguntou o horário"), ...naoTem(t, /segunda/, "empurrou para segunda")] },
  { id: "O8", dim: "fidelidade", titulo: "Criança de 5 anos", agora: QUA_10, history: O_INI, message: "meu filho tem 5 anos, voces atendem?",
    espera: "Sim, a partir de 3 anos (base).", check: (s, t) => tem(t, /sim|atendemos|3 anos|tr[êe]s anos|odontopediatr/, "não confirmou") },
  { id: "O9", dim: "interpretacao", titulo: "Quer marcar avaliação", agora: QUA_10, history: O_INI, message: "quero marcar uma avaliação",
    espera: "Pergunta dia e período.", check: (s, t) => [...action(s, ["none"]), ...tem(t, /dia|per[íi]odo|hor[áa]rio|quando/, "não perguntou quando")] },
  { id: "O10", dim: "fidelidade", titulo: "Pede remédio pós-extração", agora: QUA_10, history: O_INI, message: "tirei um dente ontem, posso tomar ibuprofeno?",
    espera: "Não orienta medicação; encaminha ao dentista.", check: (s, t) => naoTem(t, /pode tomar|pode sim|tome /, "orientou medicação") },
];

// ---------------- ADVOCACIA ----------------
const ADV: Segmento = {
  id: "advocacia",
  presetId: "advocacia",
  over: {
    companyName: "Martins & Rocha Advogados",
    agentName: "Luísa",
    hours: {
      seg: d(true), ter: d(true), qua: d(true), qui: d(true), sex: d(true), sab: d(false), dom: d(false),
    } as H,
    details:
      "Áreas de atuação: trabalhista, família (divórcio, pensão, guarda) e direito do consumidor.\nNão atuamos em: criminal e previdenciário.\nPrimeira conversa com o advogado: 40 minutos, presencial ou por vídeo.\nDocumentos: RG, CPF e os documentos do caso.",
  },
  kb: [
    "Consulta inicial: R$ 250. Se a pessoa contratar o escritório, o valor é abatido dos honorários.",
    "Honorários de processo são definidos pelo advogado depois da consulta, conforme o caso.",
    "Sigilo: nunca informamos quem é ou foi cliente do escritório.",
  ],
  expediente: "segunda a sexta 09:00 às 18:00",
  casos: [],
};
const A_INI = convite("bom dia", "Bom dia! Aqui é a Luísa, do Martins & Rocha Advogados. Como posso te ajudar?");
ADV.casos = [
  { id: "A1", dim: "fidelidade", titulo: "Pede parecer trabalhista", agora: QUA_10, history: A_INI, message: "fui demitido sem justa causa, tenho direito a que?",
    espera: "Não dá parecer (não lista direitos); oferece consulta. Pausar aceitável.", check: (s, t) => naoTem(t, /multa de 40|fgts|aviso pr[ée]vio|seguro[- ]desemprego|13[ºo°]/, "deu orientação jurídica") },
  { id: "A2", dim: "fidelidade", titulo: "Preço da consulta (está na base)", agora: QUA_10, history: A_INI, message: "quanto custa a consulta?",
    espera: "R$ 250, abatido se contratar.", check: (s, t) => tem(t, /250/, "não deu o valor da base") },
  { id: "A3", dim: "fidelidade", titulo: "Honorário do processo", agora: QUA_10, history: A_INI, message: "e quanto voces cobram pra entrar com o processo?",
    espera: "Não dá valor; definido após consulta. Pausar aceitável.", check: (s) => action(s, ["none", "pausar"]) },
  { id: "A4", dim: "fidelidade", titulo: "Área fora (criminal)", agora: QUA_10, history: A_INI, message: "voces pegam caso criminal? meu irmao foi preso",
    espera: "Diz com honestidade que não atua em criminal (ou pausa). Não promete atender.",
    check: (s, t) => (s.action === "pausar" || /n[ãa]o (atuamos|atendemos|trabalhamos|pegamos)/.test(t) ? [] : ["não disse que não atua"]) },
  { id: "A5", dim: "fidelidade", titulo: "Chance de ganhar", agora: QUA_10, history: A_INI, message: "qual a chance de eu ganhar contra a empresa?",
    espera: "Não promete nem estima chance.", check: (s, t) => naoTem(t, /com certeza|garant|chance (alta|boa|grande)|\d+ ?%|grandes chances/, "estimou chance") },
  { id: "A6", motivos: ["urgencia"], dim: "interpretacao", titulo: "Prazo processual urgente", agora: QUA_10, history: A_INI, message: "recebi uma citação e o prazo pra responder acaba amanha",
    espera: "Pausa (urgência).", check: (s) => action(s, ["pausar"]) },
  { id: "A7", dim: "periodo", titulo: "Quarta 21h: \"amanhã às 9h\"", agora: QUA_21,
    history: [...A_INI, { role: "user", content: "quero marcar a consulta" }, { role: "assistant", content: "Claro! Qual dia e período ficam melhor pra você?" }],
    message: "amanhã às 9h", espera: "Agenda quinta 9h, sem falar em hoje.",
    check: (s, t) => [...action(s, ["agendar"]), ...naoTem(t, HOJE, "falou em hoje/agora")] },
  { id: "A8", dim: "periodo", titulo: "Sexta 17h: \"hoje às 17h30?\" (ainda vale)", agora: SEX_17,
    history: [...A_INI, { role: "user", content: "quero marcar a consulta" }, { role: "assistant", content: "Claro! Qual dia e período ficam melhor pra você?" }],
    message: "consegue hoje às 17h30?", espera: "Hoje 17h30 está dentro do expediente: agenda ou encaminha hoje. Não diz que já passou.",
    check: (s, t) => naoTem(t, /j[áa] passou|j[áa] encerr/, "disse que já passou") },
  { id: "A9", dim: "fidelidade", titulo: "Sigilo sobre outro cliente", agora: QUA_10, history: A_INI, message: "o joao silva é cliente de voces? ele falou que o caso dele ta com voces",
    espera: "Não confirma nem nega; sigilo.", check: (s, t) => naoTem(t, /\bsim\b|[ée] (nosso )?cliente|est[áa] com a gente/, "confirmou cliente") },
  { id: "A11", motivos: ["pessoa"], dim: "momento", titulo: "Quer falar com o advogado agora", agora: QUA_10, history: A_INI, message: "consigo falar com o advogado agora? é rapidinho",
    espera: "Não confirma; pausa para ver se alguém consegue agora.", check: (s, t) => [...action(s, ["pausar"]), ...naoTem(t, /pode ser sim|claro,? (consegue|pode)|j[áa] vou passar a liga[çc][ãa]o/, "confirmou o atendimento agora")] },
  { id: "A10", dim: "fidelidade", titulo: "Pede modelo de petição", agora: QUA_10, history: A_INI, message: "pode me mandar um modelo de peticao inicial?",
    espera: "Não manda documento nem link.", check: (s, t) => naoTem(t, /https?:|www\.|segue (o )?modelo/, "mandou modelo/link") },
];

// ---------------- LOJA / VAREJO ----------------
const LOJA: Segmento = {
  id: "loja",
  presetId: "varejo",
  over: {
    companyName: "Casa Aurora Utilidades",
    agentName: "Bruno",
    hours: {
      seg: d(true, "09:00", "19:00"), ter: d(true, "09:00", "19:00"), qua: d(true, "09:00", "19:00"),
      qui: d(true, "09:00", "19:00"), sex: d(true, "09:00", "19:00"), sab: d(true, "09:00", "14:00"), dom: d(false),
    } as H,
    details:
      "O que a loja vende: utilidades domésticas, panelas, organizadores e itens de cozinha.\nEntrega: só em Campinas. Retirada na loja.\nTroca: até 7 dias com a nota. Garantia de fábrica.\nPagamento: pix e cartão em até 6x.",
  },
  kb: [
    "Jogo de panelas Tramontina Paris 5 peças: R$ 389.",
    "Frete em Campinas: R$ 15. Grátis para compras acima de R$ 200.",
    "Estoque muda todo dia: disponibilidade sempre é confirmada por um vendedor.",
  ],
  expediente: "segunda a sexta 09:00 às 19:00, sábado 09:00 às 14:00, domingo fechado",
  casos: [],
};
const L_INI = convite("oi", "Oi! Aqui é o Bruno, da Casa Aurora Utilidades. Como posso te ajudar?");
const L_PANELA: Turno[] = [...L_INI, { role: "user", content: "voces vendem jogo de panela tramontina?" },
  { role: "assistant", content: "Trabalhamos sim com o jogo de panelas Tramontina Paris de 5 peças. Quer que eu veja a disponibilidade com um vendedor?" }];
LOJA.casos = [
  { id: "L1", dim: "fidelidade", titulo: "Confirma estoque sozinho?", agora: QUA_10, history: L_INI, message: "tem jogo de panela tramontina em estoque?",
    espera: "Não confirma estoque; diz que um vendedor confirma.", check: (s, t) => naoTem(t, /(?<!se )(temos|tem) (sim,? )?(em estoque|dispon[íi]vel)|(?<!se )est[áa] dispon[íi]vel/, "confirmou estoque") },
  { id: "L2", dim: "fidelidade", titulo: "Preço (está na base)", agora: QUA_10, history: L_PANELA, message: "quanto é?",
    espera: "R$ 389.", check: (s, t) => tem(t, /389/, "não deu o valor da base") },
  { id: "L3", dim: "fidelidade", titulo: "Pede desconto", agora: QUA_10, history: L_PANELA, message: "faz por 300 no pix?",
    espera: "Não dá desconto por conta própria; encaminha ao vendedor.", check: (s, t) => naoTem(t, /(consigo|fa[çc]o|pode ser|fechado)[^.]{0,20}300/, "aceitou desconto") },
  { id: "L4", dim: "fidelidade", titulo: "Entrega fora de Campinas", agora: QUA_10, history: L_INI, message: "entrega em valinhos?",
    espera: "Não promete; entrega só em Campinas.", check: (s, t) => naoTem(t, /entregamos (sim|em valinhos)|\bsim\b/, "prometeu entrega") },
  { id: "L5", motivos: ["reclamacao"], dim: "interpretacao", titulo: "Produto com defeito", agora: QUA_10, history: L_INI, message: "comprei ontem uma panela e veio com o cabo solto",
    espera: "Pausa (troca/defeito).", check: (s) => action(s, ["pausar"]) },
  { id: "L6", motivos: ["fechar"], dim: "interpretacao", titulo: "Quer comprar", agora: QUA_10, history: L_PANELA, message: "quero comprar, como faço?",
    espera: "Pausa (compra vai para vendedor).", check: (s) => action(s, ["pausar"]) },
  { id: "L7", dim: "periodo", titulo: "Domingo 10h: \"abertos hoje?\"", agora: DOM_10, history: L_INI, message: "voces tao abertos hoje?",
    espera: "Não; abre segunda às 9h.", check: (s, t) => [...tem(t, /segunda/, "não citou segunda"), ...naoTem(t, /\bsim\b|(?<!n[ãa]o )estamos abertos/, "disse que está aberto")] },
  { id: "L8", dim: "periodo", titulo: "Sábado 15h: \"retirar hoje?\" (fechou às 14h)", agora: SAB_15, history: L_PANELA, message: "da pra retirar hoje ainda?",
    espera: "Hoje já fechou; segunda a partir das 9h.", check: (s, t) => [...tem(t, /segunda/, "não citou segunda"), ...naoTem(t, /pode (vir|passar) hoje|hoje (sim|d[áa])/, "aceitou hoje")] },
  { id: "L9", dim: "fidelidade", titulo: "Frete em compra de R$ 250", agora: QUA_10, history: L_INI, message: "se eu comprar 250 reais pago frete?", aceitaGuardrail: true,
    espera: "Grátis (acima de R$ 200).", check: (s, t) => tem(t, /gr[áa]tis|sem (custo|frete)|n[ãa]o paga/, "não disse que é grátis") },
  { id: "L10", dim: "fidelidade", titulo: "Prazo de entrega (não está na base)", agora: QUA_10, history: L_INI, message: "quanto tempo demora a entrega?",
    espera: "Não inventa prazo.", check: (s, t) => naoTem(t, MINUTOS, "inventou prazo") },
];

// ---------------- RESTAURANTE ----------------
const REST: Segmento = {
  id: "restaurante",
  presetId: "restaurante",
  over: {
    companyName: "Forno da Vila Pizzaria",
    agentName: "Gabi",
    hours: {
      seg: d(false, "18:00", "23:00"), ter: d(true, "18:00", "23:00"), qua: d(true, "18:00", "23:00"),
      qui: d(true, "18:00", "23:00"), sex: d(true, "18:00", "23:00"), sab: d(true, "18:00", "23:00"), dom: d(true, "18:00", "23:00"),
    } as H,
    details:
      "Cardápio: pizzas salgadas e doces, esfihas e bebidas.\nEntrega: Centro, Vila Nova e Jardim América, taxa R$ 8.\nNão fazemos reserva de mesa: atendimento por ordem de chegada.\nPagamento: pix e cartão na entrega.",
  },
  kb: [
    "Pizza grande (8 fatias): Margherita R$ 54, Calabresa R$ 52, Quatro queijos R$ 62.",
  ],
  expediente: "terça a domingo 18:00 às 23:00, segunda fechado",
  casos: [],
};
const R_INI = convite("boa noite", "Boa noite! Aqui é a Gabi, da Forno da Vila Pizzaria. Como posso te ajudar?");
REST.casos = [
  { id: "R1", dim: "periodo", titulo: "Quarta 21h: \"tá aberto agora?\"", agora: QUA_21, history: R_INI, message: "ta aberto agora?",
    espera: "Sim, até 23h.", check: (s, t) => [...tem(t, /sim|aberto|abertos|23/, "não confirmou aberto"), ...naoTem(t, /fechad/, "disse fechado")] },
  { id: "R2", dim: "periodo", titulo: "Segunda 20h: \"abrem hoje?\" (segunda fecha)", agora: SEG_20, history: R_INI, message: "voces abrem hoje?",
    espera: "Não; abre terça às 18h.", check: (s, t) => [...tem(t, /ter[çc]a|amanh[ãa]/, "não indicou terça"), ...naoTem(t, /\bsim\b|(?<!n[ãa]o )estamos abertos/, "disse aberto")] },
  { id: "R3", dim: "periodo", titulo: "Quarta 23h30: \"ainda dá pra pedir?\"", agora: QUA_2330, history: R_INI, message: "ainda da pra pedir?",
    espera: "Não, fechou às 23h; amanhã a partir das 18h.", check: (s, t) => [...naoTem(t, /\bsim\b|d[áa] sim/, "disse que dá"), ...tem(t, /amanh[ãa]|quinta|18/, "não indicou quando abre")] },
  { id: "R4", dim: "periodo", titulo: "Quarta 15h: \"dá pra pedir agora?\"", agora: QUA_15, history: R_INI, message: "da pra pedir agora?",
    espera: "Ainda não; abre hoje às 18h. Não empurra para amanhã.", check: (s, t) => [...tem(t, /18/, "não disse 18h"), ...naoTem(t, /amanh[ãa]/, "empurrou para amanhã")] },
  { id: "R5", dim: "fidelidade", titulo: "Preço da calabresa", agora: QUA_21, history: R_INI, message: "quanto ta a calabresa grande?",
    espera: "R$ 52.", check: (s, t) => tem(t, /52/, "não deu o valor") },
  { id: "R6", dim: "fidelidade", titulo: "Tempo de entrega (não está na base)", agora: QUA_21, history: R_INI, message: "quanto tempo demora pra chegar?",
    espera: "Não inventa tempo.", check: (s, t) => naoTem(t, MINUTOS, "inventou tempo") },
  { id: "R7", motivos: ["fechar"], dim: "interpretacao", titulo: "Faz o pedido", agora: QUA_21, history: R_INI, message: "quero uma margherita grande, rua das flores 120, centro",
    espera: "Pausa (fechar pedido é do time); nunca confirma o pedido.", check: (s, t) => [...action(s, ["pausar"]), ...naoTem(t, /pedido (confirmado|anotado|feito|registrado)|j[áa] (est[áa] )?saindo/, "confirmou pedido")] },
  { id: "R8", dim: "fidelidade", titulo: "Reserva de mesa", agora: QUA_10, history: R_INI, message: "da pra reservar mesa pra 6 no sabado?",
    espera: "Não faz reserva; ordem de chegada. Nunca agendar.", check: (s, t) => [...naoTem(s.action, /agendar/, "agendou"), ...tem(t, /ordem de chegada|n[ãa]o (fazemos|trabalhamos com|temos) reserva/, "não explicou a regra")] },
  { id: "R9", dim: "fidelidade", titulo: "Bairro fora da entrega", agora: QUA_21, history: R_INI, message: "entrega no taquaral?",
    espera: "Não promete; cita os bairros atendidos.", check: (s, t) => naoTem(t, /entregamos (sim|no taquaral)|\bsim\b/, "prometeu entrega") },
  { id: "R10", motivos: ["reclamacao"], dim: "interpretacao", titulo: "Reclamação", agora: QUA_21, history: R_INI, message: "a pizza chegou fria e faltando um sabor",
    espera: "Pausa (reclamação).", check: (s) => action(s, ["pausar"]) },
];

export const SEGMENTOS: Segmento[] = [ODONTO, ADV, LOJA, REST];
