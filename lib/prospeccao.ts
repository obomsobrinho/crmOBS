import { normalizar } from "./clientes";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "./fuso";

// CAMPANHAS v2 (29/10/2026, docs/plano-campanhas.md): a prospecção do DONO DO
// PRODUTO, nunca recurso dos clientes. Módulo puro (sem I/O): o telefone, o site
// pela URL, a pontuação do lead, as situações, a rotação das variantes, a
// agenda de envio (10 por dia, das 8h às 18h, espalhados na janela), o pedido
// para parar e os números do resultado. Tela, rota e cron usam as MESMAS funções.
//
// ⚠️ Os pesos da pontuação e a amostra mínima são PROVISÓRIOS, marcados como
// tal, até o dono decidir (plano, seção 12). Nada aqui é número medido.

// ── Telefone ─────────────────────────────────────────────────────────────

export type TipoDeTelefone = "celular" | "fixo" | "invalido";

/**
 * Celular, fixo ou inválido, pelos dígitos (com ou sem 55). Celular BR = DDD +
 * 9 dígitos começando por 9; fixo = DDD + 8 dígitos começando de 2 a 5. Só
 * celular pode receber WhatsApp com alguma chance; o resto fica fora das campanhas.
 */
export function tipoDoTelefone(telefone: string | null | undefined): TipoDeTelefone {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return "invalido";
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return "invalido";
  const resto = d.slice(2);
  if (resto.length === 9 && resto.startsWith("9")) return "celular";
  if (resto.length === 8 && /^[2-5]/.test(resto)) return "fixo";
  return "invalido";
}

/** A chave de deduplicação do lead: 55 + DDD + número, só dígitos; null quando não é celular BR. */
export function telefoneDoLead(telefone: string | null | undefined): string | null {
  if (tipoDoTelefone(telefone) !== "celular") return null;
  const d = (telefone ?? "").replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

// ── Site (só pela URL que a busca trouxe) ────────────────────────────────

/** Tem site: sim, só rede social, ou não. */
export type SiteDoLead = "sim" | "so_rede_social" | "nao";

export const ROTULO_DO_SITE: Record<SiteDoLead, string> = {
  sim: "Tem site",
  so_rede_social: "Só rede social",
  nao: "Sem site",
};

/** Endereços que são perfil, agregador de links ou atalho de conversa, não site próprio. */
export const DOMINIOS_QUE_NAO_SAO_SITE = [
  "instagram.com",
  "facebook.com",
  "linktr.ee",
  "linkbio.co",
  "bio.link",
  "beacons.ai",
  "wa.me",
  "api.whatsapp.com",
  "forms.gle",
] as const;

/** O que dá para saber só pela URL, sem abrir nada; null = é um site próprio. */
export function classeDaUrl(url: string | null | undefined): "sem_site" | "so_rede_social" | null {
  if (!url || url.trim() === "") return "sem_site";
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.toLowerCase();
  } catch {
    return "sem_site";
  }
  host = host.replace(/^www\./, "");
  return DOMINIOS_QUE_NAO_SAO_SITE.some((d) => host === d || host.endsWith(`.${d}`)) ? "so_rede_social" : null;
}

export function siteDoLead(url: string | null | undefined): SiteDoLead {
  const c = classeDaUrl(url);
  return c === "sem_site" ? "nao" : c === "so_rede_social" ? "so_rede_social" : "sim";
}

// ── Pontuação ────────────────────────────────────────────────────────────

/** O que a busca trouxe sobre a empresa (entrada da pontuação). */
export interface SinaisDoLead {
  telefone: string | null;
  segmento: string;
  site: string | null;
  nota: number | null;
  avaliacoes: number | null;
}

/** ⚠️ PROVISÓRIO: a lista de segmentos do ICP é do dono. */
export const SEGMENTOS_DO_ICP = [
  "clinica",
  "odontologia",
  "dentista",
  "estetica",
  "salao",
  "barbearia",
  "otica",
  "advocacia",
  "pet",
  "academia",
] as const;

/** ⚠️ PROVISÓRIO: pesos de exemplo, somam 100. */
export const PESOS_PROVISORIOS = {
  semSiteProprio: 30,
  segmento: 25,
  avaliacoes: 25,
  nota: 20,
} as const;

export interface Pontuacao {
  pontos: number;
  /** Os motivos que deram ponto, na ordem do peso, prontos para o balão da tela. */
  motivos: string[];
}

/** 0 a 100 com os motivos. Telefone não pontua: celular inválido é um impedimento, não um peso. */
export function pontuarLead(s: SinaisDoLead): Pontuacao {
  const motivos: string[] = [];
  let pontos = 0;
  const site = siteDoLead(s.site);
  if (site !== "sim") {
    pontos += PESOS_PROVISORIOS.semSiteProprio;
    motivos.push(site === "nao" ? "Sem site" : "Só rede social, sem site próprio");
  }
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
  if (s.nota !== null && s.nota >= 4.5) {
    pontos += PESOS_PROVISORIOS.nota;
    motivos.push(`Nota ${s.nota.toFixed(1).replace(".", ",")}: cuida da reputação`);
  }
  return { pontos, motivos };
}

/** Faixa da pontuação para o selo da tela (estado, não decoração). */
export function faixaDaPontuacao(pontos: number): "alta" | "media" | "baixa" {
  return pontos >= 70 ? "alta" : pontos >= 40 ? "media" : "baixa";
}

// ── Situações ────────────────────────────────────────────────────────────

export type SituacaoDaBusca = "buscando" | "pronta" | "falhou";

export const ROTULO_DA_BUSCA: Record<SituacaoDaBusca, string> = {
  buscando: "Buscando",
  pronta: "Pronta",
  falhou: "Falhou",
};

/** A marcação do dono na base de leads; null = ainda não olhou. */
export type MarcacaoDoLead = "bom" | "descartado" | null;

export type SituacaoDaCampanha = "rascunho" | "agendada" | "rodando" | "pausada" | "concluida";

export const ROTULO_DA_CAMPANHA: Record<SituacaoDaCampanha, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  rodando: "Rodando",
  pausada: "Pausada",
  concluida: "Concluída",
};

/** O lead dentro de uma campanha (a coluna `status` de `prospeccao_campanha_leads`). */
export type SituacaoNaCampanha = "na_fila" | "enviado" | "respondeu" | "falhou" | "parou";

export const ROTULO_NA_CAMPANHA: Record<SituacaoNaCampanha, string> = {
  na_fila: "Na fila",
  enviado: "Enviado",
  respondeu: "Respondeu",
  falhou: "Falhou",
  parou: "Pediu para parar",
};

/**
 * Pode entrar numa campanha nova? Nunca quem pediu para parar, nem sem celular
 * válido, nem descartado. Quem já passou por campanha só entra se o dono o
 * escolher de propósito (`escolhidoDePropósito`), por exemplo em "Nova campanha
 * com quem não respondeu".
 */
export function podeEntrarNaCampanha(
  l: { telefone: string | null; parouEm: number | null; marcacao: MarcacaoDoLead; campanhas: number },
  escolhidoDeProposito = false,
): boolean {
  if (l.parouEm !== null) return false;
  if (telefoneDoLead(l.telefone) === null) return false;
  if (l.marcacao === "descartado") return false;
  return l.campanhas === 0 || escolhidoDeProposito;
}

// ── A mensagem ───────────────────────────────────────────────────────────

/** A única variável da mensagem. */
export const CAMPO_EMPRESA = "{empresa}";

/** Até 3 variantes, que se revezam. */
export const MAXIMO_DE_VARIANTES = 3;

/** O texto pronto para um lead: `{empresa}` vira o nome da empresa. */
export function textoParaLead(modelo: string, empresa: string): string {
  return modelo.replaceAll(CAMPO_EMPRESA, empresa.trim());
}

/**
 * Problemas de uma variante antes de iniciar: vazia, sem `{empresa}` (vira
 * mensagem genérica, que é o que mais parece disparo) ou com outra chave
 * desconhecida entre chaves.
 */
export function problemasDaVariante(modelo: string): string[] {
  const p: string[] = [];
  if (modelo.trim() === "") return ["A mensagem está vazia"];
  if (!modelo.includes(CAMPO_EMPRESA)) p.push("Falta {empresa} no texto");
  const outras = [...modelo.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((c) => c !== "empresa");
  if (outras.length > 0) p.push(`Campo desconhecido: {${outras[0]}}`);
  return p;
}

/** Qual variante (0, 1, 2) vai para o lead na posição `ordem` da fila: revezamento simples. */
export function varianteDaOrdem(ordem: number, quantas: number): number {
  return quantas <= 0 ? 0 : ((ordem % quantas) + quantas) % quantas;
}

// ── Pedido para parar ────────────────────────────────────────────────────

/** ⚠️ PROVISÓRIO: as frases que contam como "pare" (o dono revisa a lista). */
export const FRASES_DE_PARADA = ["nao quero", "pare", "parar", "para de mandar", "sair", "remover", "nao tenho interesse"] as const;

/** A resposta pede para parar? Sem acento e sem caixa, por palavra inteira. */
export function ehPedidoParaParar(texto: string): boolean {
  const t = ` ${normalizar(texto).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()} `;
  return FRASES_DE_PARADA.some((f) => t.includes(` ${f} `));
}

// ── Agenda de envio ──────────────────────────────────────────────────────

/** Decisão do dono (29/10/2026): no máximo 10 por dia por campanha. A tabela tem a mesma trava. */
export const TETO_DIARIO = 10;

/** Pausa sorteada entre dois envios, em minutos (o mínimo nunca é encurtado). */
export const PAUSA_MINUTOS: [number, number] = [4, 12];

/** A janela de envio, no horário de São Paulo. `dias` como `getDay` (0 = domingo). */
export interface JanelaDeEnvio {
  dias: number[];
  inicioHora: number;
  fimHora: number;
}

/**
 * Das 8h às 18h (brief do dono, 29/10/2026). Os dias da semana ainda são
 * decisão dele (plano, D4): até lá, todos.
 */
export const JANELA: JanelaDeEnvio = { dias: [0, 1, 2, 3, 4, 5, 6], inicioHora: 8, fimHora: 18 };

const HORA_MS = 3_600_000;
const MINUTO_MS = 60_000;

/** Quantos dias uma lista leva a 10 por dia. */
export function diasParaEnviar(leads: number, teto = TETO_DIARIO): number {
  return leads <= 0 ? 0 : Math.ceil(leads / Math.max(1, teto));
}

/** A hora cheia (0 a 23) do instante em São Paulo. */
export function horaSP(t: number): number {
  return Math.floor((t - inicioDoDiaSP(diaIsoSP(t))) / HORA_MS);
}

/** A abertura da janela no próximo dia de envio a partir do dia `dia` (inclusive). */
function aberturaAPartirDe(dia: string, j: JanelaDeEnvio): number {
  let d = dia;
  for (let i = 0; i < 8; i++) {
    const semana = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (j.dias.includes(semana)) return inicioDoDiaSP(d) + j.inicioHora * HORA_MS;
    d = somarDias(d, 1);
  }
  return inicioDoDiaSP(dia) + j.inicioHora * HORA_MS;
}

/**
 * Quando sai o próximo envio da campanha. ESPALHA de propósito: a janela do dia
 * é cortada em `teto` faixas iguais (10h / 10 = 1h cada) e o envio número N do
 * dia cai num instante sorteado da faixa N, para a métrica "resposta por hora"
 * receber todas as horas. Nunca antes de `agora` + a pausa sorteada (4 a 12
 * min), nunca fora da janela; cota do dia cheia = primeira faixa do próximo dia.
 */
export function proximoEnvioEm(
  agora: number,
  enviadosHoje: number,
  { janela = JANELA, teto = TETO_DIARIO, sorteio = Math.random }: { janela?: JanelaDeEnvio; teto?: number; sorteio?: () => number } = {},
): number {
  const faixa = ((janela.fimHora - janela.inicioHora) * HORA_MS) / Math.max(1, teto);
  // Folga no fim da faixa: o envio seguinte nunca fica a menos da pausa mínima.
  const dentroDaFaixa = (inicio: number) => inicio + sorteio() * Math.max(0, faixa - PAUSA_MINUTOS[0] * MINUTO_MS);
  const hoje = diaIsoSP(agora);
  const amanha = () => {
    const abre = aberturaAPartirDe(somarDias(hoje, 1), janela);
    return Math.round(dentroDaFaixa(abre));
  };
  if (enviadosHoje >= teto) return amanha();
  const abreHoje = aberturaAPartirDe(hoje, janela);
  if (diaIsoSP(abreHoje) !== hoje) return Math.round(dentroDaFaixa(abreHoje));
  const fechaHoje = inicioDoDiaSP(hoje) + janela.fimHora * HORA_MS;
  const pausa = (PAUSA_MINUTOS[0] + sorteio() * (PAUSA_MINUTOS[1] - PAUSA_MINUTOS[0])) * MINUTO_MS;
  const candidato = Math.max(dentroDaFaixa(abreHoje + enviadosHoje * faixa), agora + pausa);
  return candidato < fechaHoje ? Math.round(candidato) : amanha();
}

// ── Resultado ────────────────────────────────────────────────────────────

/** ⚠️ PROVISÓRIO: abaixo disto a tela avisa "ainda pouco para comparar". */
export const AMOSTRA_MINIMA_PROVISORIA = 30;

export interface EnvioParaResultado {
  situacao: SituacaoNaCampanha;
  /** 0, 1 ou 2; null enquanto está na fila. */
  variante: number | null;
  enviadoEm: number | null;
  respondeuEm: number | null;
}

export interface Taxa {
  enviados: number;
  responderam: number;
  /** % sobre os enviados; null sem envio (a tela mostra "sem envios", nunca 0%). */
  taxa: number | null;
}

function taxa(enviados: number, responderam: number): Taxa {
  return { enviados, responderam, taxa: enviados === 0 ? null : Math.round((responderam / enviados) * 100) };
}

export interface ResultadoDaCampanha extends Taxa {
  total: number;
  naFila: number;
  falharam: number;
  pararam: number;
  porVariante: Taxa[];
  /** Por hora do ENVIO (8h a 17h): a taxa de resposta de quem recebeu naquela hora. */
  porHoraDoEnvio: (Taxa & { hora: number })[];
  /** Por dia da semana do ENVIO, de segunda a domingo (`dow` 0 = domingo). */
  porDiaDaSemana: (Taxa & { dow: number })[];
  /** Por hora da RESPOSTA: quantas respostas chegaram em cada hora (0 a 23). */
  porHoraDaResposta: { hora: number; respostas: number }[];
  /** A mediana do tempo entre o envio e a resposta, em minutos; null sem resposta. */
  minutosAteResponder: number | null;
}

/** Segunda a domingo, a ordem dos gráficos por dia da semana (`dow` 0 = domingo). */
export const DIAS_DA_SEMANA = ([1, 2, 3, 4, 5, 6, 0] as const).map((dow) => ({
  dow,
  curto: (["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const)[dow],
  longo: (["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const)[dow],
}));

/** O dia da semana (0 = domingo) de um dia civil AAAA-MM-DD, sem fuso no meio. */
export function diaDaSemanaDoDia(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

/** O dia da semana (0 = domingo) do instante em São Paulo. */
export function diaDaSemanaSP(t: number): number {
  return diaDaSemanaDoDia(diaIsoSP(t));
}

/** "terça, 28/10": o dia de uma coluna, no balão. */
export function textoDoDiaDeEnvio(dia: string): string {
  const dow = diaDaSemanaDoDia(dia);
  return `${DIAS_DA_SEMANA.find((d) => d.dow === dow)!.longo}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

/**
 * Conta pelo que aconteceu, não pela situação de agora: quem pediu para parar
 * também respondeu (a resposta foi o pedido) e também foi enviado.
 */
export function resultadoDaCampanha(
  envios: EnvioParaResultado[],
  quantasVariantes: number,
  janela: JanelaDeEnvio = JANELA,
): ResultadoDaCampanha {
  const enviados = envios.filter((e) => e.enviadoEm !== null);
  const resp = (lista: EnvioParaResultado[]) => lista.filter((e) => e.respondeuEm !== null).length;
  const porVariante = Array.from({ length: Math.max(1, quantasVariantes) }, (_, v) => {
    const da = enviados.filter((e) => e.variante === v);
    return taxa(da.length, resp(da));
  });
  const porHoraDoEnvio = [];
  for (let h = janela.inicioHora; h < janela.fimHora; h++) {
    const na = enviados.filter((e) => horaSP(e.enviadoEm as number) === h);
    porHoraDoEnvio.push({ hora: h, ...taxa(na.length, resp(na)) });
  }
  const porDiaDaSemana = DIAS_DA_SEMANA.map(({ dow }) => {
    const no = enviados.filter((e) => diaDaSemanaSP(e.enviadoEm as number) === dow);
    return { dow, ...taxa(no.length, resp(no)) };
  });
  const horasDeResposta = new Map<number, number>();
  const espera: number[] = [];
  for (const e of enviados) {
    if (e.respondeuEm === null) continue;
    const h = horaSP(e.respondeuEm);
    horasDeResposta.set(h, (horasDeResposta.get(h) ?? 0) + 1);
    espera.push(Math.max(0, Math.round((e.respondeuEm - (e.enviadoEm as number)) / 60_000)));
  }
  return {
    total: envios.length,
    naFila: envios.filter((e) => e.situacao === "na_fila").length,
    falharam: envios.filter((e) => e.situacao === "falhou").length,
    pararam: envios.filter((e) => e.situacao === "parou").length,
    ...taxa(enviados.length, resp(enviados)),
    porVariante,
    porHoraDoEnvio,
    porDiaDaSemana,
    porHoraDaResposta: [...horasDeResposta.entries()].sort((a, b) => a[0] - b[0]).map(([hora, respostas]) => ({ hora, respostas })),
    minutosAteResponder: mediana(espera),
  };
}

/**
 * O índice da MAIOR taxa de uma comparação, ou null quando não há o que
 * comparar (menos de duas linhas com envio, ou todas empatadas). É o destaque
 * dos gráficos "melhor dia", "melhor horário" e "melhor mensagem".
 */
export function indiceDaMelhorTaxa(linhas: Taxa[]): number | null {
  const comEnvio = linhas.map((l, i) => ({ ...l, i })).filter((l) => l.enviados > 0 && l.taxa !== null);
  if (comEnvio.length < 2) return null;
  const melhor = comEnvio.reduce((a, b) => ((b.taxa as number) > (a.taxa as number) ? b : a));
  return comEnvio.every((l) => l.taxa === melhor.taxa) ? null : melhor.i;
}

/** "42 min", "3 h", "2 dias": o tempo até responder, curto. */
export function textoDoTempo(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.round(minutos / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

/** As faixas do tempo até responder, da mais rápida para a mais lenta (minutos, fim exclusivo). */
export const FAIXAS_DE_ESPERA = [
  { chave: "15", rotulo: "Até 15 min", eixo: "15m", ate: 15 },
  { chave: "60", rotulo: "De 15 a 60 min", eixo: "1h", ate: 60 },
  { chave: "180", rotulo: "De 1 a 3 h", eixo: "3h", ate: 180 },
  { chave: "mais", rotulo: "Mais de 3 h", eixo: "3h+", ate: Infinity },
] as const;

/** Quantas respostas caíram em cada faixa de tempo até responder (o mini gráfico do cartão). */
export function respostasPorEspera(envios: EnvioParaResultado[]): { chave: string; rotulo: string; n: number }[] {
  const contas = FAIXAS_DE_ESPERA.map((f) => ({ chave: f.chave, rotulo: f.rotulo, n: 0 }));
  for (const e of envios) {
    if (e.enviadoEm === null || e.respondeuEm === null) continue;
    const min = (e.respondeuEm - e.enviadoEm) / 60_000;
    contas[FAIXAS_DE_ESPERA.findIndex((f) => min < f.ate)].n++;
  }
  return contas;
}

export interface DiaDeEnvio {
  /** AAAA-MM-DD em São Paulo. */
  dia: string;
  enviados: number;
  /** Responderam (pedir para parar também conta: foi uma resposta). */
  responderam: number;
}

/**
 * Os envios por dia civil de São Paulo nos `dias` dias que terminam em `hoje`
 * (inclusive), com zero nos dias sem envio: a coluna de cada dia existe sempre,
 * para o eixo não pular datas. A resposta conta no dia do ENVIO dela.
 */
export function enviosPorDia(envios: EnvioParaResultado[], hoje: string, dias: number): DiaDeEnvio[] {
  const serie = Array.from({ length: dias }, (_, i) => ({ dia: somarDias(hoje, i - dias + 1), enviados: 0, responderam: 0 }));
  const indice = new Map(serie.map((d, i) => [d.dia, i]));
  for (const e of envios) {
    if (e.enviadoEm === null) continue;
    const i = indice.get(diaIsoSP(e.enviadoEm));
    if (i === undefined) continue;
    serie[i].enviados++;
    if (e.respondeuEm !== null) serie[i].responderam++;
  }
  return serie;
}

// ── A busca: as opções que vão para a fonte de leads ────────────────────
//
// O diálogo "Nova busca" (dono, 29/10/2026: "a apify oferece mais
// configurações"). Os nomes aqui são nossos; quem traduz para a fonte é
// `lib/fonte-apify.ts` (backend). Campos do actor `compass/crawler-google-places`
// conferidos no esquema de entrada em 29/10/2026: `searchStringsArray`,
// `locationQuery`, `maxCrawledPlacesPerSearch`, `language`, `placeMinimumStars`,
// `website`, `skipClosedPlaces`, `scrapeContacts`. ⚠️ O esquema não lista os
// valores aceitos de `placeMinimumStars` e `website` (só os exemplos `""` e
// `"allPlaces"`): confirmar numa execução real antes de mapear.

/** As 27 unidades da federação (o estado vai junto da cidade para a fonte não confundir homônimas). */
export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** Quantas empresas por termo (o teto de custo da busca). 50 é a recomendação do plano (D7, em aberto). */
export const QUANTIDADES_POR_TERMO = [50, 100, 200] as const;

/** Preço de tabela do actor no Apify Store em 29/10/2026: "from $1.50 / 1,000 scraped places". */
export const PRECO_POR_MIL_LUGARES_USD = 1.5;

export type NotaMinima = null | 3.5 | 4 | 4.5;
export type FiltroDeSiteDaBusca = "todos" | "sem_site" | "com_site";

export interface OpcoesDaBusca {
  /** Um ou mais segmentos ("clínica de estética", "estética"). */
  termos: string[];
  cidade: string;
  uf: string;
  porTermo: number;
  notaMinima: NotaMinima;
  site: FiltroDeSiteDaBusca;
  ignorarFechados: boolean;
  /** E-mail e redes sociais tirados do site da empresa (custa a mais por empresa na fonte). */
  buscarContatos: boolean;
}

export const OPCOES_PADRAO: OpcoesDaBusca = {
  termos: [],
  cidade: "",
  uf: "",
  porTermo: QUANTIDADES_POR_TERMO[0],
  notaMinima: null,
  site: "todos",
  ignorarFechados: true,
  buscarContatos: false,
};

/** O que falta para buscar (vazio = pode buscar). */
export function problemasDaBusca(o: OpcoesDaBusca): string[] {
  const p: string[] = [];
  if (o.termos.filter((t) => t.trim().length >= 3).length === 0) p.push("Falta o segmento");
  if (o.cidade.trim().length < 2) p.push("Falta a cidade");
  if (!UFS.includes(o.uf as (typeof UFS)[number])) p.push("Falta o estado");
  return p;
}

/** O máximo de empresas que a busca pode trazer (antes de tirar as repetidas). */
export function maximoDaBusca(o: OpcoesDaBusca): number {
  return o.termos.length * o.porTermo;
}

/** O custo mínimo em dólar pelo preço de tabela (contatos e detalhes custam a mais). */
export function custoMinimoDaBuscaUsd(o: OpcoesDaBusca): number {
  return (maximoDaBusca(o) * PRECO_POR_MIL_LUGARES_USD) / 1000;
}

/** As opções em pílulas curtas, para a tela da busca ("50 por termo", "Nota 4 ou mais"). */
export function resumoDasOpcoes(o: OpcoesDaBusca): string[] {
  const r = [`${o.porTermo} por termo`];
  if (o.notaMinima !== null) r.push(`Nota ${String(o.notaMinima).replace(".", ",")} ou mais`);
  if (o.site === "sem_site") r.push("Só sem site");
  if (o.site === "com_site") r.push("Só com site");
  if (o.ignorarFechados) r.push("Sem fechadas");
  if (o.buscarContatos) r.push("Com e-mail e redes");
  return r;
}

// ── A base de leads (o painel da aba Leads) ─────────────────────────────

export interface LeadParaResumo extends SinaisDoLead {
  cidade: string;
  bairro?: string;
  marcacao: MarcacaoDoLead;
  parouEm: number | null;
  /** Por quantas campanhas passou. */
  campanhas: number;
  /** Respondeu a alguma campanha. */
  respondeu: boolean;
}

/** Um grupo da base (uma cidade, um segmento): quantos, quantos contatados e quantos responderam. */
export interface GrupoDaBase {
  nome: string;
  total: number;
  /** Prontos para a próxima campanha (a mesma regra do passo Contatos). */
  aContatar: number;
  contatados: number;
  responderam: number;
}

export type FaixaDaPontuacao = ReturnType<typeof faixaDaPontuacao>;

/** As faixas de nota no Google, da pior para a melhor. */
export const FAIXAS_DE_NOTA = [
  { chave: "sem", rotulo: "Sem nota", eixo: "Sem nota" },
  { chave: "ate4", rotulo: "Abaixo de 4", eixo: "Abaixo de 4" },
  { chave: "4", rotulo: "De 4 a 4,4", eixo: "4 a 4,4" },
  { chave: "45", rotulo: "De 4,5 a 4,7", eixo: "4,5 a 4,7" },
  { chave: "48", rotulo: "4,8 ou mais", eixo: "4,8 ou mais" },
] as const;
export type FaixaDeNota = (typeof FAIXAS_DE_NOTA)[number]["chave"];

export function faixaDaNota(nota: number | null): FaixaDeNota {
  if (nota === null) return "sem";
  return nota < 4 ? "ate4" : nota < 4.5 ? "4" : nota < 4.8 ? "45" : "48";
}

export interface ResumoDaBase {
  total: number;
  /** Com celular válido (os únicos que podem entrar numa campanha). */
  comCelular: number;
  bons: number;
  contatados: number;
  responderam: number;
  aContatar: number;
  porCidade: GrupoDaBase[];
  porSegmento: GrupoDaBase[];
  porBairro: GrupoDaBase[];
  /** Celular válido, fixo, ou sem telefone (inclui inválido). */
  porTelefone: { celular: number; fixo: number; sem: number };
  /** A média das notas no Google de quem tem nota; null sem nenhuma. */
  notaMedia: number | null;
  porSite: Record<SiteDoLead, number>;
  porFaixa: Record<FaixaDaPontuacao, number>;
  porNota: Record<FaixaDeNota, number>;
}

function somarNoGrupo(m: Map<string, GrupoDaBase>, nome: string, l: LeadParaResumo, pode: boolean) {
  const g = m.get(nome) ?? { nome, total: 0, aContatar: 0, contatados: 0, responderam: 0 };
  g.total++;
  if (pode) g.aContatar++;
  if (l.campanhas > 0) g.contatados++;
  if (l.respondeu) g.responderam++;
  m.set(nome, g);
}

const porTamanho = (m: Map<string, GrupoDaBase>) =>
  [...m.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));

/**
 * Os números da base inteira, para o painel da aba Leads. De verdade é uma
 * função SQL que agrega (nunca as linhas no navegador); esta é a MESMA conta em
 * memória, para o preview e os testes. As duas ficam iguais.
 */
export function resumoDaBase(leads: LeadParaResumo[]): ResumoDaBase {
  const cidades = new Map<string, GrupoDaBase>();
  const segmentos = new Map<string, GrupoDaBase>();
  const bairros = new Map<string, GrupoDaBase>();
  const porTelefone = { celular: 0, fixo: 0, sem: 0 };
  let somaDasNotas = 0;
  let comNota = 0;
  const porSite: Record<SiteDoLead, number> = { sim: 0, so_rede_social: 0, nao: 0 };
  const porFaixa: Record<FaixaDaPontuacao, number> = { alta: 0, media: 0, baixa: 0 };
  const porNota: Record<FaixaDeNota, number> = { sem: 0, ate4: 0, "4": 0, "45": 0, "48": 0 };
  let comCelular = 0;
  let bons = 0;
  let contatados = 0;
  let responderam = 0;
  let aContatar = 0;
  for (const l of leads) {
    const pode = podeEntrarNaCampanha(l);
    somarNoGrupo(cidades, l.cidade, l, pode);
    somarNoGrupo(segmentos, l.segmento || "Sem segmento", l, pode);
    somarNoGrupo(bairros, l.bairro || "Sem bairro", l, pode);
    const tipo = tipoDoTelefone(l.telefone);
    porTelefone[l.telefone && tipo !== "invalido" ? tipo : "sem"]++;
    if (l.nota !== null) {
      somaDasNotas += l.nota;
      comNota++;
    }
    if (pode) aContatar++;
    if (l.campanhas > 0) contatados++;
    if (telefoneDoLead(l.telefone)) comCelular++;
    if (l.marcacao === "bom") bons++;
    if (l.respondeu) responderam++;
    porSite[siteDoLead(l.site)]++;
    porFaixa[faixaDaPontuacao(pontuarLead(l).pontos)]++;
    porNota[faixaDaNota(l.nota)]++;
  }
  return {
    total: leads.length,
    comCelular,
    bons,
    contatados,
    responderam,
    aContatar,
    porCidade: porTamanho(cidades),
    porSegmento: porTamanho(segmentos),
    porBairro: porTamanho(bairros),
    porTelefone,
    notaMedia: comNota === 0 ? null : Math.round((somaDasNotas / comNota) * 10) / 10,
    porSite,
    porFaixa,
    porNota,
  };
}

/**
 * Quantos instantes caem em cada semana (as `semanas` semanas que terminam hoje,
 * em São Paulo): leads novos na base, envios, respostas. As tendências da faixa.
 */
export function contagemPorSemana(datas: number[], agora: number, semanas: number): { inicio: string; n: number }[] {
  const hoje = diaIsoSP(agora);
  const serie = Array.from({ length: semanas }, (_, i) => ({ inicio: somarDias(hoje, -7 * (semanas - i) + 1), n: 0 }));
  for (const t of datas) {
    const dias = Math.round((inicioDoDiaSP(hoje) - inicioDoDiaSP(diaIsoSP(t))) / 86_400_000);
    const i = semanas - 1 - Math.floor(dias / 7);
    if (i >= 0 && i < semanas) serie[i].n++;
  }
  return serie;
}
