import { chaveTelefone } from "./avisos";
import { normalizar } from "./clientes";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "./fuso";

// CAMPANHAS v2 (29/10/2026, docs/plano-campanhas.md): a prospecção do DONO DO
// PRODUTO, nunca recurso dos clientes. Módulo puro (sem I/O): o telefone, o site
// pela URL, a pontuação do lead, as situações, a rotação das variantes, a
// agenda de envio (10 por dia, das 8h às 18h, espalhados na janela), o pedido
// para parar e os números do resultado. Tela, rota e cron usam as MESMAS funções.
//
// Decisões do dono de 29/10/2026 (plano, seção 12): dias de envio de segunda a
// sábado (D2), a linha de saída no fim de toda mensagem (D4), amostra mínima de
// 30 (D5), pausa sozinha com mais de 2 pedidos para parar no dia (D6) e 12 meses
// de guarda de quem nunca respondeu (D8). ⚠️ Os pesos da pontuação e os
// segmentos do ICP seguem PROVISÓRIOS (D9). Nada aqui é número medido.
//
// O SQL de prospeccao_* repete algumas regras daqui (faixa da pontuação, faixa
// da nota, quem pode entrar numa campanha, as contas do resultado): quem mudar
// uma muda a outra (supabase/migrations/*_prospeccao_do_dono.sql).

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
  /**
   * O dono reivindicou o perfil no Google? `false` = a fonte mostra "Reivindicar esta
   * empresa" (`claimThisBusiness`): presença digital fraca. Ausente ou null = não se sabe.
   */
  reivindicado?: boolean | null;
  /** O horário de funcionamento lido da fonte (`lerHorarios`); ausente ou null = não se sabe. */
  horarios?: HorarioDoDia[] | null;
}

// ── Horário de funcionamento (o gancho do atendimento fora do horário) ──

/** Um dia da semana (`dow` 0 = domingo) com as faixas abertas em minutos do dia; vazio = fechado. */
export interface HorarioDoDia {
  dow: number;
  faixas: [number, number][];
}

const DIA_PELO_NOME: Record<string, number> = {
  domingo: 0, sunday: 0, segunda: 1, monday: 1, terca: 2, tuesday: 2, quarta: 3, wednesday: 3,
  quinta: 4, thursday: 4, sexta: 5, friday: 5, sabado: 6, saturday: 6,
};

/** "8:30", "08h30", "8 AM", "6:30 PM" em minutos do dia; null quando não é hora. */
function minutosDe(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2})(?:[:h](\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h > 24 || min > 59 ? null : h * 60 + min;
}

/**
 * O `openingHours` da fonte (`[{ day, hours }]`) em dias e faixas. Aceita português e
 * inglês ("segunda-feira" / "Monday", "08:00–18:00", "8 AM to 6 PM", "Fechado", "Aberto
 * 24 horas", várias faixas separadas por vírgula). O formato real com `language: pt-BR`
 * (busca de 30/10/2026): `{ day: "segunda-feira", hours: "07:30 to 12:30, 13:30 to 19:00" }`
 * e `"Fechado"`. Um dia que não se entende fica de fora (nunca vira "fechado").
 */
export function lerHorarios(bruto: unknown): HorarioDoDia[] | null {
  if (!Array.isArray(bruto)) return null;
  const dias: HorarioDoDia[] = [];
  for (const item of bruto) {
    if (item === null || typeof item !== "object") continue;
    const { day, hours } = item as { day?: unknown; hours?: unknown };
    if (typeof day !== "string" || typeof hours !== "string") continue;
    const dow = DIA_PELO_NOME[normalizar(day).replace(/-feira$/, "").trim()];
    if (dow === undefined) continue;
    const h = normalizar(hours);
    if (/fechado|closed/.test(h)) {
      dias.push({ dow, faixas: [] });
      continue;
    }
    if (/24 ?h|24 horas|24 hours/.test(h)) {
      dias.push({ dow, faixas: [[0, 24 * 60]] });
      continue;
    }
    const faixas: [number, number][] = [];
    for (const parte of h.split(/,|;/)) {
      const [a, b] = parte.split(/\s*(?:–|-|to|as|a|ate)\s+|\s*[–-]\s*/).filter(Boolean);
      const ini = a ? minutosDe(a) : null;
      const fim = b ? minutosDe(b) : null;
      if (ini !== null && fim !== null) faixas.push([ini, fim <= ini ? fim + 24 * 60 : fim]);
    }
    if (faixas.length > 0) dias.push({ dow, faixas });
  }
  return dias.length > 0 ? dias.sort((x, y) => ((x.dow + 6) % 7) - ((y.dow + 6) % 7)) : null;
}

/** O que o horário diz de quem perde cliente fora dele (o gancho do Atenda). */
export interface GanchosDoHorario {
  /** Em algum dia útil fecha antes das 18h. */
  fechaCedo: boolean;
  /** Sábado fechado (ou sábado não listado com os dias úteis listados). */
  naoAbreSabado: boolean;
  /** Em algum dia útil há um intervalo no meio do dia (fecha no almoço). */
  fechaNoAlmoco: boolean;
}

export function ganchosDoHorario(dias: HorarioDoDia[] | null | undefined): GanchosDoHorario | null {
  if (!dias || dias.length === 0) return null;
  const uteis = dias.filter((d) => d.dow >= 1 && d.dow <= 5 && d.faixas.length > 0);
  const sabado = dias.find((d) => d.dow === 6);
  return {
    fechaCedo: uteis.some((d) => Math.max(...d.faixas.map((f) => f[1])) < 18 * 60),
    naoAbreSabado: sabado ? sabado.faixas.length === 0 : uteis.length >= 5,
    fechaNoAlmoco: uteis.some((d) => d.faixas.length >= 2),
  };
}

/** As frases dos ganchos, para a ficha e o balão da pontuação. */
export function textosDosGanchos(g: GanchosDoHorario | null): string[] {
  if (!g) return [];
  return [g.fechaCedo && "Fecha antes das 18h", g.naoAbreSabado && "Não abre no sábado", g.fechaNoAlmoco && "Fecha no almoço"].filter(
    (t): t is string => typeof t === "string",
  );
}

/** "08:00 às 12:00, 14:00 às 18:00" ou "Fechado": o dia na ficha. */
export function textoDoDia(d: HorarioDoDia): string {
  if (d.faixas.length === 0) return "Fechado";
  const hm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return d.faixas.map(([a, b]) => (b - a >= 1440 ? "24 horas" : `${hm(a)} às ${hm(b)}`)).join(", ");
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

/**
 * ⚠️ PROVISÓRIO (D9): pesos de exemplo, somam 100. Revisão do dono de 30/10/2026: entram o
 * perfil não reivindicado e o horário que deixa cliente sem resposta (o gancho do Atenda).
 */
export const PESOS_PROVISORIOS = {
  semSiteProprio: 25,
  segmento: 20,
  avaliacoes: 20,
  nota: 10,
  perfilNaoReivindicado: 15,
  horario: 10,
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
  if (s.reivindicado === false) {
    pontos += PESOS_PROVISORIOS.perfilNaoReivindicado;
    motivos.push("Perfil do Google não reivindicado pelo dono");
  }
  const ganchos = textosDosGanchos(ganchosDoHorario(s.horarios));
  if (ganchos.length > 0) {
    pontos += PESOS_PROVISORIOS.horario;
    motivos.push(`${ganchos.join(", ")}: perde cliente fora do horário`);
  }
  return { pontos, motivos };
}

/**
 * A pontuação que a tela mostra: a GRAVADA quando há (a que ordena a tabela; um lead antigo
 * fica com a dele até uma busca nova), com os motivos calculados dos sinais de hoje.
 */
export function pontuacaoExibida(s: SinaisDoLead, gravada?: number): Pontuacao {
  const calculada = pontuarLead(s);
  return gravada === undefined ? calculada : { ...calculada, pontos: gravada };
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

/**
 * A linha de saída (D4, dono, 29/10/2026): vai no fim de TODA mensagem, posta
 * pelo código, e o dono não tira editando a variante. "sair" está em
 * `FRASES_DE_PARADA`, então responder SAIR sempre tira o lead da lista.
 */
export const LINHA_DE_SAIDA = "Se não quiser receber mais mensagens, é só responder SAIR.";

/** O texto pronto para um lead: `{empresa}` vira o nome da empresa e a linha de saída vai no fim. */
export function textoParaLead(modelo: string, empresa: string): string {
  return `${modelo.replaceAll(CAMPO_EMPRESA, empresa.trim()).trimEnd()}\n\n${LINHA_DE_SAIDA}`;
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

/** As três variantes sugeridas (plano, seção 9; aprovadas pelo dono em 29/10/2026): o texto pré-preenchido de uma campanha nova. */
export const VARIANTES_SUGERIDAS = [
  "Oi, tudo bem? Sou o Franck, da OBS. Achei a {empresa} numa busca no Google. A gente monta sistemas sob medida que deixam o WhatsApp respondendo sozinho e tiram o trabalho repetido da rotina. Posso te mostrar em 2 minutos como ficaria aí?",
  "Oi! Aqui é o Franck, da OBS. Vi a {empresa} no Google e fiquei curioso: quando um cliente chama no WhatsApp fora do horário, alguém responde? A gente monta um sistema que atende, organiza e agenda sozinho. Se fizer sentido, te mostro rapidinho.",
  "Oi, tudo bem? Sou o Franck, da OBS. A gente cria sistemas sob medida pra tirar tarefa chata da rotina: atendimento no WhatsApp que responde sozinho, agenda, lembrete, controle. Vale uma conversa rápida pra eu entender como funciona aí na {empresa} hoje?",
];

/** Qual variante (0, 1, 2) vai para o lead na posição `ordem` da fila: revezamento simples. */
export function varianteDaOrdem(ordem: number, quantas: number): number {
  return quantas <= 0 ? 0 : ((ordem % quantas) + quantas) % quantas;
}

// ── Pedido para parar ────────────────────────────────────────────────────

/** As frases que contam como "pare" (D4, dono, 29/10/2026). */
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

/** Das 8h às 18h, de segunda a sábado (dono, 29/10/2026, D2). */
export const JANELA: JanelaDeEnvio = { dias: [1, 2, 3, 4, 5, 6], inicioHora: 8, fimHora: 18 };

/** D6: com MAIS do que isto de pedidos para parar no mesmo dia, a campanha pausa sozinha. */
export const PARADAS_PARA_PAUSAR = 2;

/** D8 (LGPD): quem nunca respondeu sai da base depois disto, contado da entrada; quem pediu para parar fica. */
export const MESES_DE_RETENCAO = 12;

const HORA_MS = 3_600_000;
const MINUTO_MS = 60_000;

/** As tabelas de Campanhas: páginas de 10 (a rota e a paginação da tela usam o MESMO número). */
export const POR_PAGINA_DE_CAMPANHAS = 10;
/** Os dias do mini gráfico de cada linha da tabela de campanhas. */
export const DIAS_DA_LINHA = 14;

/** O instante está dentro da janela de envio (dia de envio, das 8h às 18h em São Paulo)? */
export function dentroDaJanela(t: number, janela: JanelaDeEnvio = JANELA): boolean {
  const h = horaSP(t);
  return janela.dias.includes(diaDaSemanaSP(t)) && h >= janela.inicioHora && h < janela.fimHora;
}

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

/** Abaixo disto a tela avisa "ainda pouco para comparar" (D5, dono, 29/10/2026). */
export const AMOSTRA_MINIMA = 30;

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

/** Cada filtro pago do actor (a categoria, `categoryFilterWords`), por lugar, no preço de tabela do Store. */
export const PRECO_DO_FILTRO_POR_LUGAR_USD = 0.001;

export type NotaMinima = null | 3.5 | 4 | 4.5;
export type FiltroDeSiteDaBusca = "todos" | "sem_site" | "com_site";

export interface OpcoesDaBusca {
  /** Um ou mais segmentos ("clínica de estética", "estética"). */
  termos: string[];
  /** A cidade como o IBGE escreve, escolhida na lista da UF (nunca texto livre). */
  cidade: string;
  uf: string;
  /** O código IBGE da cidade escolhida (`lib/dados/municipios.json`); null até escolher. */
  cidadeIbge: number | null;
  /**
   * O centro e o raio AJUSTADOS no mapa da "Nova busca" (revisão de 30/10/2026); null =
   * a cidade inteira (vai como `locationQuery`). Com área, vai `customGeolocation` e não
   * vai `locationQuery`. Fica gravado no jsonb `opcoes` da busca (sem DDL).
   */
  area: AreaDaBusca | null;
  porTermo: number;
  /** Nota mínima, aplicada do NOSSO lado (o filtro da fonte custa por empresa). */
  notaMinima: NotaMinima;
  /** Com ou sem site, também do nosso lado. */
  site: FiltroDeSiteDaBusca;
  /** Mínimo de avaliações no Google, do nosso lado (pouca avaliação, pouco movimento). */
  minAvaliacoes: MinimoDeAvaliacoes;
  /**
   * "Só desta categoria": palavras que a categoria do Google precisa ter (vazio = qualquer).
   * Marcada, vai para a fonte como `categoryFilterWords` (o filtro pago, para não pagar pelo
   * lugar de outra categoria; decisão do dono de 31/10/2026) e é conferida do nosso lado
   * também, sobre `categoryName` e `categories`.
   */
  categorias: string[];
  ignorarFechados: boolean;
  /** E-mail e redes sociais tirados do site da empresa (custa a mais por empresa na fonte). */
  buscarContatos: boolean;
}

/** Um círculo de busca: o centro e o raio em km. */
export interface AreaDaBusca {
  lat: number;
  lng: number;
  raioKm: number;
}

/** Os raios do controle "Raio: N km" (do menor ao maior). */
export const RAIOS_KM = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50] as const;

/** O raio com que uma área nasce quando o dono mexe no mapa pela primeira vez. */
export const RAIO_PADRAO_KM = 5;

/** O próximo raio da lista, para cima (+1) ou para baixo (-1), sem sair dela. */
export function proximoRaio(atual: number, passo: 1 | -1): number {
  const i = RAIOS_KM.findIndex((r) => r >= atual);
  const j = Math.min(RAIOS_KM.length - 1, Math.max(0, (i < 0 ? RAIOS_KM.length - 1 : i) + passo));
  return RAIOS_KM[j];
}

/** "Mutum, MG" ou "Mutum, MG · raio de 5 km": onde a busca procurou, para o detalhe. */
export function textoDoLocal(o: Pick<OpcoesDaBusca, "cidade" | "uf" | "area">): string {
  const cidade = [o.cidade, o.uf].filter(Boolean).join(", ");
  return o.area ? `${cidade} · raio de ${String(o.area.raioKm).replace(".", ",")} km` : cidade;
}

/** Os mínimos de avaliações oferecidos na "Nova busca" (null = qualquer). */
export const MINIMOS_DE_AVALIACOES = [null, 10, 30, 100] as const;
export type MinimoDeAvaliacoes = (typeof MINIMOS_DE_AVALIACOES)[number];

/**
 * ⚠️ PROVISÓRIO: categorias do Google sugeridas por segmento do ICP para "Só desta
 * categoria" (o dono escolhe; o termo digitado também vira sugestão). Os nomes são os
 * que o Google Maps mostra em português; conferir numa execução real.
 */
export const CATEGORIAS_SUGERIDAS: Record<string, string[]> = {
  estetica: ["Clínica de estética", "Esteticista", "Spa"],
  dentista: ["Dentista", "Clínica odontológica", "Ortodontista"],
  odontologia: ["Dentista", "Clínica odontológica", "Ortodontista"],
  clinica: ["Clínica médica", "Clínica de estética", "Clínica odontológica"],
  salao: ["Salão de beleza", "Cabeleireiro", "Manicure"],
  barbearia: ["Barbearia", "Cabeleireiro"],
  otica: ["Ótica", "Optometrista"],
  advocacia: ["Advogado", "Escritório de advocacia"],
  advogado: ["Advogado", "Escritório de advocacia"],
  pet: ["Pet shop", "Veterinário", "Banho e tosa"],
  academia: ["Academia", "Estúdio de pilates", "Personal trainer"],
  contabilidade: ["Contador", "Escritório de contabilidade"],
  restaurante: ["Restaurante", "Pizzaria", "Lanchonete"],
};

/** As sugestões de "Só desta categoria" para os segmentos digitados (sem repetir). */
export function categoriasSugeridas(termos: string[]): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  const incluir = (c: string) => {
    const k = normalizar(c);
    if (!vistas.has(k)) {
      vistas.add(k);
      saida.push(c);
    }
  };
  for (const t of termos) {
    const n = normalizar(t);
    for (const [chave, cats] of Object.entries(CATEGORIAS_SUGERIDAS)) if (n.includes(chave)) cats.forEach(incluir);
    if (t.trim()) incluir(t.trim().charAt(0).toUpperCase() + t.trim().slice(1));
  }
  return saida;
}

export const OPCOES_PADRAO: OpcoesDaBusca = {
  termos: [],
  cidade: "",
  uf: "",
  cidadeIbge: null,
  area: null,
  porTermo: QUANTIDADES_POR_TERMO[0],
  notaMinima: null,
  site: "todos",
  minAvaliacoes: null,
  categorias: [],
  ignorarFechados: true,
  buscarContatos: false,
};

/** O que falta para buscar (vazio = pode buscar). */
export function problemasDaBusca(o: OpcoesDaBusca): string[] {
  const p: string[] = [];
  if (o.termos.filter((t) => t.trim().length >= 3).length === 0) p.push("Falta o segmento");
  if (!UFS.includes(o.uf as (typeof UFS)[number])) p.push("Falta o estado");
  else if (o.cidadeIbge === null || o.cidade.trim().length < 2) p.push("Escolha a cidade na lista");
  return p;
}

/** O máximo de empresas que a busca pode trazer (antes de tirar as repetidas). */
export function maximoDaBusca(o: OpcoesDaBusca): number {
  return o.termos.length * o.porTermo;
}

/** O custo mínimo em dólar pelo preço de tabela, com o filtro pago da categoria (os contatos custam a mais). */
export function custoMinimoDaBuscaUsd(o: OpcoesDaBusca): number {
  const porLugar = PRECO_POR_MIL_LUGARES_USD / 1000 + (o.categorias.length > 0 ? PRECO_DO_FILTRO_POR_LUGAR_USD : 0);
  return maximoDaBusca(o) * porLugar;
}

/** As opções em pílulas curtas, para a tela da busca ("50 por termo", "Nota 4 ou mais"). */
export function resumoDasOpcoes(o: OpcoesDaBusca): string[] {
  const r = [`${o.porTermo} por termo`];
  if (o.notaMinima !== null) r.push(`Nota ${String(o.notaMinima).replace(".", ",")} ou mais`);
  if (o.site === "sem_site") r.push("Só sem site");
  if (o.site === "com_site") r.push("Só com site");
  if (o.minAvaliacoes !== null) r.push(`${o.minAvaliacoes}+ avaliações`);
  if (o.categorias.length > 0) r.push(`Categoria: ${o.categorias.join(", ")}`);
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

// ── Os gêmeos do SQL: o formato longo dobrado nas mesmas formas ─────────
//
// `prospeccao_resultados` e `prospeccao_resumo_da_base` devolvem uma linha por
// grupo (dimensão, chave, contagens). Estas funções dobram essas linhas nas MESMAS
// formas de `resultadoDaCampanha`, `respostasPorEspera`, `enviosPorDia`,
// `resumoDaBase` e `contagemPorSemana`, que o preview e os testes usam em memória.

export interface LinhaDoResultado {
  dimensao: string;
  chave: number;
  n: number | null;
  enviados: number | null;
  responderam: number | null;
}

export interface ResultadoDobrado {
  resultado: ResultadoDaCampanha;
  espera: { chave: string; rotulo: string; n: number }[];
}

/** As linhas de `prospeccao_resultados` (sem a dimensão `dia`) na forma de `resultadoDaCampanha`. */
export function resultadoDasLinhas(
  linhas: LinhaDoResultado[],
  quantasVariantes: number,
  janela: JanelaDeEnvio = JANELA,
): ResultadoDobrado {
  const de = (d: string) => linhas.filter((l) => l.dimensao === d);
  const n = (d: string) => de(d)[0]?.n ?? 0;
  const taxaDe = (d: string, chave: number) => {
    const l = de(d).find((x) => x.chave === chave);
    return taxa(l?.enviados ?? 0, l?.responderam ?? 0);
  };
  const env = de("enviados")[0];
  const mediana = de("mediana")[0];
  const porHoraDoEnvio = [];
  for (let h = janela.inicioHora; h < janela.fimHora; h++) porHoraDoEnvio.push({ hora: h, ...taxaDe("hora_envio", h) });
  return {
    resultado: {
      total: n("total"),
      naFila: n("na_fila"),
      falharam: n("falharam"),
      pararam: n("pararam"),
      ...taxa(env?.enviados ?? 0, env?.responderam ?? 0),
      porVariante: Array.from({ length: Math.max(1, quantasVariantes) }, (_, v) => taxaDe("variante", v)),
      porHoraDoEnvio,
      porDiaDaSemana: DIAS_DA_SEMANA.map(({ dow }) => ({ dow, ...taxaDe("dia_semana", dow) })),
      porHoraDaResposta: de("hora_resposta")
        .map((l) => ({ hora: l.chave, respostas: l.n ?? 0 }))
        .sort((a, b) => a.hora - b.hora),
      minutosAteResponder: mediana?.n ?? null,
    },
    espera: FAIXAS_DE_ESPERA.map((f, i) => ({
      chave: f.chave,
      rotulo: f.rotulo,
      n: de("espera").find((l) => l.chave === i)?.n ?? 0,
    })),
  };
}

/** A dimensão `dia` de `prospeccao_resultados` (chave = dias desde `de`) na forma de `enviosPorDia`. */
export function serieDasLinhas(linhas: LinhaDoResultado[], de: string, dias: number): DiaDeEnvio[] {
  return Array.from({ length: dias }, (_, i) => {
    const l = linhas.find((x) => x.dimensao === "dia" && x.chave === i);
    return { dia: somarDias(de, i), enviados: l?.enviados ?? 0, responderam: l?.responderam ?? 0 };
  });
}

export interface LinhaDoResumo {
  dimensao: string;
  chave: string;
  n: number;
  aContatar: number | null;
  contatados: number | null;
  responderam: number | null;
  soma: number | null;
}

export interface SemanaContada {
  inicio: string;
  n: number;
}

export interface ResumoDobrado {
  resumo: ResumoDaBase;
  novosPorSemana: SemanaContada[];
  enviosPorSemana: SemanaContada[];
  respostasPorDia: DiaDeEnvio[];
}

/** As linhas de `prospeccao_resumo_da_base` na forma de `resumoDaBase` e das séries de `contagemPorSemana`/`enviosPorDia`. */
export function resumoDasLinhas(linhas: LinhaDoResumo[], hoje: string, semanas: number, dias: number): ResumoDobrado {
  const de = (d: string) => linhas.filter((l) => l.dimensao === d);
  const n = (d: string, chave = "") => de(d).find((l) => l.chave === chave)?.n ?? 0;
  const grupos = (d: string) =>
    de(d)
      .map((l) => ({ nome: l.chave, total: l.n, aContatar: l.aContatar ?? 0, contatados: l.contatados ?? 0, responderam: l.responderam ?? 0 }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  const total = de("total")[0];
  const media = de("nota_media")[0];
  const semana = (d: string) =>
    Array.from({ length: semanas }, (_, i) => ({ inicio: somarDias(hoje, -7 * (semanas - i) + 1), n: n(d, String(i)) }));
  return {
    resumo: {
      total: total?.n ?? 0,
      comCelular: n("com_celular"),
      bons: n("bons"),
      contatados: total?.contatados ?? 0,
      responderam: total?.responderam ?? 0,
      aContatar: total?.aContatar ?? 0,
      porCidade: grupos("cidade"),
      porSegmento: grupos("segmento"),
      porBairro: grupos("bairro"),
      porTelefone: { celular: n("telefone", "celular"), fixo: n("telefone", "fixo"), sem: n("telefone", "sem") },
      notaMedia: media && media.n > 0 && media.soma !== null ? Math.round((media.soma / media.n) * 10) / 10 : null,
      porSite: { sim: n("site", "sim"), so_rede_social: n("site", "so_rede_social"), nao: n("site", "nao") },
      porFaixa: { alta: n("faixa", "alta"), media: n("faixa", "media"), baixa: n("faixa", "baixa") },
      porNota: { sem: n("nota", "sem"), ate4: n("nota", "ate4"), "4": n("nota", "4"), "45": n("nota", "45"), "48": n("nota", "48") },
    },
    novosPorSemana: semana("novos_semana"),
    enviosPorSemana: semana("envios_semana"),
    respostasPorDia: Array.from({ length: dias }, (_, i) => {
      const dia = somarDias(hoje, i - dias + 1);
      const l = de("respostas_dia").find((x) => x.chave === dia);
      return { dia, enviados: l?.n ?? 0, responderam: l?.responderam ?? 0 };
    }),
  };
}

// ── O que o servidor confere antes de iniciar ───────────────────────────

/** O que impede de iniciar (vazio = pode). As mesmas regras que travam o assistente, de novo no servidor. */
export function problemasParaIniciar(c: {
  nome: string;
  conexaoId: string | null;
  agendadaPara: number | null;
  variantes: string[];
  agora: number;
}): string[] {
  const p: string[] = [];
  if (c.nome.trim() === "") p.push("Falta o nome da campanha");
  if (!c.conexaoId) p.push("Falta o número que envia");
  if (c.agendadaPara !== null && c.agendadaPara <= c.agora) p.push("A data agendada já passou");
  if (c.variantes.length === 0) p.push("Falta a mensagem");
  if (c.variantes.length > MAXIMO_DE_VARIANTES) p.push(`No máximo ${MAXIMO_DE_VARIANTES} variantes`);
  c.variantes.forEach((v, i) => {
    const pv = problemasDaVariante(v);
    if (pv.length > 0) p.push(`Variante ${i + 1}: ${pv[0]}`);
  });
  return p;
}

// ── Respostas e pedidos para parar (o cron lê `chat_messages`, nunca escreve) ──

/** Um lead enviado que o cron ainda observa: a primeira resposta, ou um pedido para parar depois. */
export interface EnvioObservado {
  campanhaId: string;
  leadId: string;
  /** A chave do celular do lead (55 + DDD + número). */
  telefone: string;
  situacao: "enviado" | "respondeu";
  enviadoEm: number;
}

/** Uma mensagem RECEBIDA (`user_message`) na empresa que enviou. */
export interface MensagemRecebida {
  telefone: string;
  texto: string;
  em: number;
}

export interface RespostaAchada {
  campanhaId: string;
  leadId: string;
  /** A primeira mensagem depois do envio (só para quem ainda estava "enviado"). */
  respondeuEm?: number;
  /** A primeira mensagem que pede para parar (`ehPedidoParaParar`). */
  parouEm?: number;
}

/**
 * O que as mensagens recebidas dizem sobre cada envio observado. Uma mensagem
 * conta para o envio do mesmo celular (com e sem o nono dígito, `chaveTelefone`)
 * que veio ANTES dela, e só até o próximo envio ao mesmo lead (uma "segunda
 * chance" não faz a primeira campanha ganhar a resposta da segunda).
 */
export function respostasDosEnvios(envios: EnvioObservado[], mensagens: MensagemRecebida[]): RespostaAchada[] {
  const agrupar = <T,>(lista: T[], chave: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of lista) {
      const k = chave(x);
      const g = m.get(k);
      if (g) g.push(x);
      else m.set(k, [x]);
    }
    return m;
  };
  const porLead = agrupar(envios, (e) => e.leadId);
  const porFone = agrupar(mensagens, (m) => chaveTelefone(m.telefone));
  const achadas: RespostaAchada[] = [];
  for (const e of envios) {
    const proximo = (porLead.get(e.leadId) ?? [])
      .map((x) => x.enviadoEm)
      .filter((t) => t > e.enviadoEm)
      .reduce((a, b) => Math.min(a, b), Infinity);
    const delas = (porFone.get(chaveTelefone(e.telefone)) ?? [])
      .filter((m) => m.em > e.enviadoEm && m.em < proximo && m.texto.trim() !== "")
      .sort((a, b) => a.em - b.em);
    if (delas.length === 0) continue;
    const parada = delas.find((m) => ehPedidoParaParar(m.texto));
    const r: RespostaAchada = { campanhaId: e.campanhaId, leadId: e.leadId };
    if (e.situacao === "enviado") r.respondeuEm = delas[0].em;
    if (parada) r.parouEm = parada.em;
    if (r.respondeuEm !== undefined || r.parouEm !== undefined) achadas.push(r);
  }
  return achadas;
}

// ── O que a fonte traz além do básico (a ficha do lead e o mapa) ─────────

/** Quantas avaliações de 1 a 5 estrelas (`reviewsDistribution`). */
export interface DistribuicaoDasNotas {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

/**
 * O que a fonte devolve de graça em todo lugar e a ficha mostra. Tudo opcional: um lead
 * de antes destes campos (ou de outra fonte) só não tem a informação.
 */
export interface DetalhesDoLead {
  lat: number | null;
  lng: number | null;
  /** O dono reivindicou o perfil no Google (o contrário de `claimThisBusiness`). */
  reivindicado: boolean | null;
  horarios: HorarioDoDia[] | null;
  distribuicao: DistribuicaoDasNotas | null;
  fotos: number | null;
  /** A categoria principal e as outras (`categoryName`, `categories`). */
  categorias: string[];
  endereco: string | null;
  /** O @ do Instagram, quando a busca pediu os contatos do site. */
  instagram: string | null;
}

/** As colunas do lead no banco que viram `DetalhesDoLead` (o jsonb chega como veio). */
export interface DetalhesNaLinha {
  lat: number | string | null;
  lng: number | string | null;
  reivindicado: boolean | null;
  horarios: unknown;
  distribuicao_notas: unknown;
  fotos: number | null;
  categorias: string[] | null;
  instagram: string | null;
  endereco: string | null;
}

/** Um número finito (também o numeric que o banco devolve como texto), ou null. */
export const numeroOuNull = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** O horário como `concluir` gravou (`HorarioDoDia[]`), conferido; um dia torto fica de fora. */
function horariosDoBanco(v: unknown): HorarioDoDia[] | null {
  if (!Array.isArray(v)) return null;
  const dias = v.flatMap((d): HorarioDoDia[] => {
    if (d === null || typeof d !== "object") return [];
    const { dow, faixas } = d as { dow?: unknown; faixas?: unknown };
    if (typeof dow !== "number" || !Number.isInteger(dow) || dow < 0 || dow > 6 || !Array.isArray(faixas)) return [];
    const boas = faixas.filter(
      (f): f is [number, number] => Array.isArray(f) && f.length === 2 && f.every((x) => typeof x === "number" && Number.isFinite(x)),
    );
    return [{ dow, faixas: boas }];
  });
  return dias.length > 0 ? dias : null;
}

/** As avaliações por estrela como gravadas (`{"1": n, ..., "5": n}`). */
function distribuicaoDoBanco(v: unknown): DistribuicaoDasNotas | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const n = (k: string) => Math.max(0, numeroOuNull(o[k]) ?? 0);
  const d = { 1: n("1"), 2: n("2"), 3: n("3"), 4: n("4"), 5: n("5") };
  return Object.values(d).some((x) => x > 0) ? d : null;
}

/** As colunas do lead no banco em `DetalhesDoLead` (a ficha, o filtro e a pontuação da tela). Puro. */
export function detalhesDaLinha(r: DetalhesNaLinha): DetalhesDoLead {
  return {
    lat: numeroOuNull(r.lat),
    lng: numeroOuNull(r.lng),
    reivindicado: r.reivindicado,
    horarios: horariosDoBanco(r.horarios),
    distribuicao: distribuicaoDoBanco(r.distribuicao_notas),
    fotos: r.fotos,
    categorias: r.categorias ?? [],
    endereco: r.endereco,
    instagram: r.instagram,
  };
}

/** A cor do pino no mapa: o estado do lead, do mais forte para o mais fraco. */
export type EstadoNoMapa = "respondeu" | "contatado" | "descartado" | "bom" | "nao_contatado";

export const ROTULO_NO_MAPA: Record<EstadoNoMapa, string> = {
  respondeu: "Respondeu",
  contatado: "Contatado",
  descartado: "Descartado",
  bom: "Marcado como bom",
  nao_contatado: "Não contatado",
};

/** Respondeu ganha de contatado, que ganha da marcação do dono. */
export function estadoNoMapa(l: { respondeu: boolean; campanhas: number; marcacao: MarcacaoDoLead }): EstadoNoMapa {
  if (l.respondeu) return "respondeu";
  if (l.campanhas > 0) return "contatado";
  if (l.marcacao === "descartado") return "descartado";
  if (l.marcacao === "bom") return "bom";
  return "nao_contatado";
}
