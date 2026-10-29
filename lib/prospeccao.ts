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
  /** Por hora da RESPOSTA: quantas respostas chegaram em cada hora (0 a 23). */
  porHoraDaResposta: { hora: number; respostas: number }[];
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
  const horasDeResposta = new Map<number, number>();
  for (const e of enviados) {
    if (e.respondeuEm === null) continue;
    const h = horaSP(e.respondeuEm);
    horasDeResposta.set(h, (horasDeResposta.get(h) ?? 0) + 1);
  }
  return {
    total: envios.length,
    naFila: envios.filter((e) => e.situacao === "na_fila").length,
    falharam: envios.filter((e) => e.situacao === "falhou").length,
    pararam: envios.filter((e) => e.situacao === "parou").length,
    ...taxa(enviados.length, resp(enviados)),
    porVariante,
    porHoraDoEnvio,
    porHoraDaResposta: [...horasDeResposta.entries()].sort((a, b) => a[0] - b[0]).map(([hora, respostas]) => ({ hora, respostas })),
  };
}
