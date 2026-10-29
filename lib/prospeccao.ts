import { normalizar } from "./clientes";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "./fuso";

// CAMPANHAS (29/10/2026, docs/plano-campanhas.md): a prospecção do DONO DO
// PRODUTO, nunca recurso dos clientes. Módulo puro (sem I/O): a pontuação do
// lead, o tipo do telefone, a fila do dia, a saída ("responda SAIR") e os
// números do acompanhamento. Tela e servidor usam as MESMAS funções.
//
// ⚠️ RASCUNHO: os pesos, os segmentos e os limites abaixo são PROVISÓRIOS,
// marcados como tal, até o dono decidir (D6, D7, D17 do plano). Nada aqui é
// número medido.

/** Situação do lead na campanha (a mesma lista da coluna `status` proposta no plano). */
export type SituacaoDoLead =
  | "escolhido"
  | "na_fila"
  | "abordado"
  | "respondeu"
  | "convertido"
  | "descartado"
  | "saiu"
  | "falhou";

export const ROTULO_DA_SITUACAO: Record<SituacaoDoLead, string> = {
  escolhido: "Escolhido",
  na_fila: "Na fila",
  abordado: "Abordado",
  respondeu: "Respondeu",
  convertido: "Cadastrou",
  descartado: "Descartado",
  saiu: "Pediu para sair",
  falhou: "Sem WhatsApp",
};

export type TipoDeTelefone = "celular" | "fixo" | "invalido";

/**
 * Celular, fixo ou inválido, pelos dígitos (com ou sem 55). Celular BR = DDD +
 * 9 dígitos começando por 9; fixo = DDD + 8 dígitos começando de 2 a 5. Só
 * celular pode receber WhatsApp com alguma chance; o fixo fica fora da fila.
 */
export function tipoDoTelefone(telefone: string): TipoDeTelefone {
  let d = telefone.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return "invalido";
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return "invalido";
  const resto = d.slice(2);
  if (resto.length === 9 && resto.startsWith("9")) return "celular";
  if (resto.length === 8 && /^[2-5]/.test(resto)) return "fixo";
  return "invalido";
}

/** O que a busca e o raio-X do atendimento acharam sobre a empresa (entrada da pontuação). */
export interface SinaisDoLead {
  telefone: string;
  segmento: string;
  avaliacoes: number | null;
  nota: number | null;
  /** Fecha antes das 18h em algum dia útil. */
  fechaCedo: boolean;
  /** Fechado no domingo ou no sábado à tarde. */
  fechaNoFimDeSemana: boolean;
  /** O site ou o perfil já leva para o WhatsApp (wa.me, botão). */
  whatsappNoSite: boolean;
  /** O número já é cliente, já foi abordado ou pediu para sair. */
  bloqueado: "cliente" | "abordado" | "saiu" | null;
}

/** ⚠️ PROVISÓRIO (D17): a lista de segmentos do ICP é do dono. */
export const SEGMENTOS_DO_ICP = [
  "clinica",
  "odontologia",
  "estetica",
  "salao",
  "barbearia",
  "otica",
  "advocacia",
  "pet",
  "academia",
] as const;

/** ⚠️ PROVISÓRIO (D17): pesos de exemplo, somam 100. */
export const PESOS_PROVISORIOS = {
  segmento: 30,
  avaliacoes: 25,
  foraDoHorario: 25,
  whatsappNoSite: 20,
} as const;

export interface Pontuacao {
  pontos: number;
  /** Os motivos que deram ponto, na ordem do peso, prontos para a tela. */
  motivos: string[];
  /** Por que o lead não entra na fila; null = pode entrar. */
  impedimento: string | null;
}

const IMPEDIMENTO: Record<NonNullable<SinaisDoLead["bloqueado"]>, string> = {
  cliente: "Já é cliente",
  abordado: "Já foi abordado",
  saiu: "Pediu para sair",
};

/** 0 a 100 com os motivos. Sem celular, ou bloqueado, não entra na fila (impedimento). */
export function pontuarLead(s: SinaisDoLead): Pontuacao {
  const motivos: string[] = [];
  let pontos = 0;
  const seg = normalizar(s.segmento);
  if (SEGMENTOS_DO_ICP.some((p) => seg.includes(p))) {
    pontos += PESOS_PROVISORIOS.segmento;
    motivos.push("Segmento que conversa muito no WhatsApp");
  }
  if (s.avaliacoes !== null && s.avaliacoes >= 50) {
    // Meio peso a partir de 50 avaliações, peso cheio a partir de 200.
    pontos += s.avaliacoes >= 200 ? PESOS_PROVISORIOS.avaliacoes : Math.round(PESOS_PROVISORIOS.avaliacoes / 2);
    motivos.push(`${s.avaliacoes} avaliações no Google: muito movimento`);
  }
  if (s.fechaCedo || s.fechaNoFimDeSemana) {
    pontos += PESOS_PROVISORIOS.foraDoHorario;
    motivos.push(s.fechaNoFimDeSemana ? "Fechado no fim de semana: a IA cobre" : "Fecha cedo: a IA cobre a noite");
  }
  if (s.whatsappNoSite) {
    pontos += PESOS_PROVISORIOS.whatsappNoSite;
    motivos.push("Já vende pelo WhatsApp (link no site)");
  }
  const tipo = tipoDoTelefone(s.telefone);
  const impedimento = s.bloqueado
    ? IMPEDIMENTO[s.bloqueado]
    : tipo === "fixo"
      ? "Telefone fixo, sem WhatsApp"
      : tipo === "invalido"
        ? "Telefone inválido"
        : null;
  return { pontos, motivos, impedimento };
}

/** Faixa da pontuação para o selo da tela (estado, não decoração). */
export function faixaDaPontuacao(pontos: number): "alta" | "media" | "baixa" {
  return pontos >= 70 ? "alta" : pontos >= 40 ? "media" : "baixa";
}

// ── A saída ──────────────────────────────────────────────────────────────

/**
 * A linha de saída, determinística (nunca escrita pela IA): a mesma palavra que
 * `ehPedidoDeSaida` reconhece. Sem ela, a saída que a pessoa usa é "denunciar",
 * que o sistema não vê e que é o gatilho de bloqueio que mais pesa.
 */
export const LINHA_DE_SAIDA = "Se não quiser receber mais mensagens, responda SAIR.";

/** O texto com a linha de saída no fim, sem duplicar se já estiver lá. */
export function comSaida(texto: string): string {
  const corpo = texto.trimEnd();
  return corpo.endsWith(LINHA_DE_SAIDA) ? corpo : `${corpo}\n\n${LINHA_DE_SAIDA}`;
}

/** A mensagem inteira é o pedido de saída (sem acento, sem caixa, sem pontuação em volta). */
export function ehPedidoDeSaida(texto: string): boolean {
  return normalizar(texto).replace(/[^a-z]/g, "") === "sair";
}

// ── O texto de cada toque ────────────────────────────────────────────────

/** Os campos que um modelo de texto pode usar, entre chaves: `{nome}`, `{cidade}`... */
export type CamposDoTexto = Record<string, string | null | undefined>;

/**
 * Preenche o modelo. Campo sem valor fica de fora da mensagem pronta e volta em
 * `faltando`: a tela não deixa aprovar texto com buraco.
 */
export function preencherTexto(modelo: string, campos: CamposDoTexto): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  const texto = modelo.replace(/\{(\w+)\}/g, (inteiro, chave: string) => {
    const v = campos[chave];
    if (v === null || v === undefined || v.trim() === "") {
      if (!faltando.includes(chave)) faltando.push(chave);
      return inteiro;
    }
    return v;
  });
  return { texto, faltando };
}

/**
 * Os campos que os textos podem usar, a partir do lead. `horario_curto` sai do
 * horário da empresa ("fecha no fim de semana"); sem fato, fica sem valor e o
 * texto que o usa não pode ser aprovado como está.
 */
export function camposDoLead(l: { nome: string; cidade: string; segmento: string; sinais: SinaisDoLead }): CamposDoTexto {
  const { fechaCedo, fechaNoFimDeSemana } = l.sinais;
  const horario_curto =
    fechaCedo && fechaNoFimDeSemana
      ? "fecha cedo e no fim de semana"
      : fechaNoFimDeSemana
        ? "fecha no fim de semana"
        : fechaCedo
          ? "fecha cedo durante a semana"
          : null;
  return { nome: l.nome, cidade: l.cidade, segmento: l.segmento.toLowerCase(), horario_curto };
}

/** O texto pronto de um toque: modelo preenchido e, no primeiro toque, a linha de saída (D8). */
export function textoDoToque(
  modelo: string,
  campos: CamposDoTexto,
  toque: number,
): { texto: string; faltando: string[] } {
  const { texto, faltando } = preencherTexto(modelo, campos);
  return { texto: toque === 1 ? comSaida(texto) : texto, faltando };
}

// ── Cadência e fila do dia ───────────────────────────────────────────────

/** Dias depois do primeiro toque em que cada toque sai. ⚠️ PROVISÓRIO (D6): 0, 3 e 7. */
export const CADENCIA_PROVISORIA = [0, 3, 7] as const;

/** ⚠️ PROVISÓRIO (D7): 5 por dia na primeira semana do número, 10 depois; pausa de 4 a 12 minutos. */
export const RITMO_PROVISORIO = {
  tetoPrimeiraSemana: 5,
  tetoDepois: 10,
  pausaMs: [4 * 60_000, 12 * 60_000] as [number, number],
};

const DIA_MS = 86_400_000;

/** Teto de hoje pela idade do número (dias desde que conectou). Desconhecida = o degrau mais lento. */
export function tetoDeHoje(idadeDoNumeroDias: number | null): number {
  if (idadeDoNumeroDias === null || idadeDoNumeroDias < 7) return RITMO_PROVISORIO.tetoPrimeiraSemana;
  return RITMO_PROVISORIO.tetoDepois;
}

/** Quando sai o próximo toque; null = a sequência acabou. */
export function proximoToqueEm(primeiroToqueMs: number, toqueFeito: number): number | null {
  const dias = CADENCIA_PROVISORIA[toqueFeito];
  return dias === undefined ? null : primeiroToqueMs + dias * DIA_MS;
}

/** A pausa até o próximo envio, sorteada no intervalo. O sorteio só atrasa: nunca abaixo do mínimo. */
export function sortearPausaMs([min, max]: [number, number], sorteio: () => number = Math.random): number {
  return Math.round(min + sorteio() * Math.max(0, max - min));
}

/** A janela de envio, no horário de São Paulo. Dias como `getDay` (0 = domingo). */
export interface JanelaDeEnvio {
  dias: number[];
  inicioHora: number;
  fimHora: number;
}

/** ⚠️ PROVISÓRIO (D7): segunda a sexta, das 9h às 17h. */
export const JANELA_PROVISORIA: JanelaDeEnvio = { dias: [1, 2, 3, 4, 5], inicioHora: 9, fimHora: 17 };

const NOME_DO_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "seg a sex, das 9h às 17h" (dias seguidos viram faixa). */
export function textoDaJanela(j: JanelaDeEnvio): string {
  const dias = [...j.dias].sort((a, b) => a - b);
  const seguidos = dias.length > 2 && dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  const textoDias = seguidos
    ? `${NOME_DO_DIA[dias[0]]} a ${NOME_DO_DIA[dias[dias.length - 1]]}`
    : dias.map((d) => NOME_DO_DIA[d]).join(", ");
  return `${textoDias}, das ${j.inicioHora}h às ${j.fimHora}h`;
}

/**
 * O primeiro instante a partir de `t` que cai dentro da janela (São Paulo).
 * Fora dela, empurra para a abertura do próximo dia de envio. Nunca adianta.
 */
export function encaixarNaJanela(t: number, j: JanelaDeEnvio): number {
  if (j.dias.length === 0 || j.fimHora <= j.inicioHora) return t;
  let dia = diaIsoSP(t);
  for (let i = 0; i < 8; i++) {
    const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
    const abre = inicioDoDiaSP(dia) + j.inicioHora * 3_600_000;
    const fecha = inicioDoDiaSP(dia) + j.fimHora * 3_600_000;
    if (j.dias.includes(semana) && t < fecha) return Math.max(t, abre);
    dia = somarDias(dia, 1);
  }
  return t;
}

export interface LeadParaFila {
  id: string;
  situacao: SituacaoDoLead;
  pontos: number;
  impedimento: string | null;
  /** Toques já enviados (0 = nunca abordado). */
  toque: number;
  proximoToqueEm: number | null;
}

export interface ItemDaFila {
  id: string;
  /** Qual toque sai (1, 2 ou 3). */
  toque: number;
}

/**
 * A fila proposta para hoje: primeiro os toques de acompanhamento vencidos (quem
 * já recebeu e não respondeu), depois os escolhidos novos pela pontuação. Nada
 * com impedimento, nada além do teto. O dono ainda aprova item por item.
 */
export function filaDoDia(leads: LeadParaFila[], teto: number, agora: number): ItemDaFila[] {
  const seguimentos = leads
    .filter((l) => l.situacao === "abordado" && l.proximoToqueEm !== null && l.proximoToqueEm <= agora)
    .sort((a, b) => (a.proximoToqueEm ?? 0) - (b.proximoToqueEm ?? 0))
    .map((l) => ({ id: l.id, toque: l.toque + 1 }));
  const novos = leads
    .filter((l) => l.situacao === "escolhido" && l.impedimento === null)
    .sort((a, b) => b.pontos - a.pontos)
    .map((l) => ({ id: l.id, toque: 1 }));
  return [...seguimentos, ...novos].slice(0, Math.max(0, teto));
}

// ── Acompanhamento ───────────────────────────────────────────────────────

export interface ResumoDaCampanha {
  abordados: number;
  responderam: number;
  sairam: number;
  semWhatsapp: number;
  cadastraram: number;
  /** % sobre os abordados; null sem abordados (a tela mostra "sem dados", nunca 0%). */
  taxaDeResposta: number | null;
  taxaDeSaida: number | null;
}

/**
 * Conta pelo que aconteceu com cada lead, não pela situação de agora: quem
 * respondeu também foi abordado; quem cadastrou também respondeu.
 */
export function resumoDaCampanha(
  leads: { situacao: SituacaoDoLead; abordadoEm: number | null; respondeuEm: number | null }[],
): ResumoDaCampanha {
  const abordados = leads.filter((l) => l.abordadoEm !== null).length;
  const responderam = leads.filter((l) => l.respondeuEm !== null).length;
  const sairam = leads.filter((l) => l.situacao === "saiu").length;
  const semWhatsapp = leads.filter((l) => l.situacao === "falhou").length;
  const cadastraram = leads.filter((l) => l.situacao === "convertido").length;
  const taxa = (n: number) => (abordados === 0 ? null : Math.round((n / abordados) * 100));
  return {
    abordados,
    responderam,
    sairam,
    semWhatsapp,
    cadastraram,
    taxaDeResposta: taxa(responderam),
    taxaDeSaida: taxa(sairam),
  };
}
