// A HISTÓRIA DE UM PEDIDO DE AJUDA (redesenho de Pedidos, aprovado pelo dono em
// 08/10/2026, docs/adr/2026-10-08-pedido-detail-shows-source-messages.md).
//
// Módulo PURO. O detalhe do pedido em /pedidos mostra, em SEÇÕES empilhadas numa
// coluna só (não linha do tempo, decisão do dono): o que o cliente escreveu (as
// mensagens que levaram ao pedido e as que ele mandou ENQUANTO o pedido
// esperava), a orientação do time (vem do próprio pedido) e o que foi mandado
// depois, separado por quem mandou (IA ou time). O resumo da IA continua sendo o
// título da linha na lista, o topo do detalhe ("Resumo da IA") e o texto do aviso
// no WhatsApp; aqui ele não é a fonte. Motivo, horários e solução moram SÓ na
// faixa de fatos do detalhe, nunca repetidos nas seções.
//
// Quem respondeu cada linha (IA, time, histórico importado) sai de
// lib/mensagem.ts, nunca daqui.
//
// CARREGAMENTO: só quando um pedido é aberto, nunca na consulta da lista. São
// três consultas pequenas e limitadas em `chat_messages` (por `client_id`,
// `phone` e janela de tempo, colunas explícitas, índice
// `chat_messages_client_phone_created_idx`), em lib/pedidos-fonte.ts:
//   antes    [abertura - 12h, abertura)          8 linhas, delas as 5 últimas do cliente
//   durante  [abertura, fechamento ou agora]     as 10 mais NOVAS do cliente (+1 para saber se cortou)
//   depois   resolvido: [fechamento - 2 min, +24h], as 6 primeiras RESPOSTAS (IA ou time)
//            aberto: da abertura em diante, as 6 primeiras respostas DO TIME (envio manual).
//            Aberto ninguém respondeu ainda: a frase da IA ao abrir ("vou confirmar com
//            o time") não é resposta, então aberto não tem "Resposta da IA".
// As janelas e os limites moram AQUI e valem igual para o banco e para a memória
// do /design (`recorteAntes`, `recorteDurante`, `recorteDepois`): mudou um, muda
// o outro.

import type { Tables } from "./database.types";
import { ehManual, respostaDaIa, respostaHumana } from "./mensagem";
import { separarMensagens } from "./painel";
import { ehAberto, type PedidoItem } from "./pedidos";

/** Quantas mensagens do cliente, antes da abertura, contam como "o que levou ao pedido". */
const MENSAGENS_QUE_LEVARAM = 5;
/** Linhas lidas antes da abertura (algumas a mais que as 5, para sobrar mensagem do cliente). */
export const LINHAS_ANTES = 8;
/** Até quanto tempo antes da abertura a mensagem ainda é do assunto. */
const JANELA_ANTES_MS = 12 * 3_600_000;
/** Quantas mensagens do cliente ENQUANTO o pedido esperava (as mais novas). */
export const MENSAGENS_DURANTE = 10;
/** Quantas linhas depois (abertura, para o aberto; fechamento, para o resolvido). */
export const LINHAS_DEPOIS = 6;
/** Até quanto tempo depois do início do recorte. */
const JANELA_DEPOIS_MS = 24 * 3_600_000;
/**
 * Folga ANTES do fechamento: quem responde pela conversa ("Time assumiu") manda
 * a mensagem e só depois o servidor fecha o pedido, então a linha do envio
 * nasce alguns segundos antes de `closed_at`.
 */
const FOLGA_FECHAMENTO_MS = 2 * 60_000;

/** As colunas que a história lê de `chat_messages` (explícitas, nunca `*`). */
export const COLUNAS_HISTORIA = "id, user_message, bot_message, message_type, media_type, media_url, created_at";

const COLUNAS = ["user_message", "bot_message", "message_type", "media_type", "media_url", "created_at"] as const;

export type LinhaHistoria = Pick<
  Tables<"chat_messages">,
  "id" | "user_message" | "bot_message" | "message_type" | "media_type" | "media_url" | "created_at"
>;

/** O pedido, no que a janela precisa dele. */
interface JanelaDoPedido {
  openedAt: string;
  closedAt: string | null;
}

/** Uma mensagem como a seção mostra: o texto como chegou, a hora e o tipo de mídia. */
export interface MensagemDaSecao {
  chave: string;
  em: string;
  texto: string;
  /** "Áudio", "Imagem"... quando a linha tem mídia; o arquivo fica na conversa. */
  midia: string | null;
}

/** O que foi mandado depois, agrupado por quem mandou (lib/mensagem.ts). */
interface RespostaDaSecao {
  quem: "ia" | "time";
  mensagens: MensagemDaSecao[];
}

export interface SecoesDoPedido {
  /** "O que o cliente escreveu": as mensagens que levaram ao pedido. */
  cliente: MensagemDaSecao[];
  /** As que o cliente mandou enquanto o pedido esperava (as 10 mais novas, em ordem). */
  durante: MensagemDaSecao[];
  /** Havia mais do que as 10 no período: o resto está na conversa. */
  duranteCortado: boolean;
  /** "Resposta da IA" / "Resposta do time", na ordem em que cada um mandou primeiro. */
  respostas: RespostaDaSecao[];
}

export interface HistoriaDoPedido {
  /** O que o cliente escreveu antes da abertura (até 5, da mais antiga para a mais nova). */
  antes: LinhaHistoria[];
  /** O que o cliente escreveu entre a abertura e o fechamento (ou agora), até 10, em ordem. */
  durante: LinhaHistoria[];
  /** O período tinha mais mensagens do cliente do que as 10 trazidas. */
  duranteCortado: boolean;
  /** O que veio depois (da abertura no aberto; do fechamento no resolvido). */
  depois: LinhaHistoria[];
}

export const HISTORIA_VAZIA: HistoriaDoPedido = { antes: [], durante: [], duranteCortado: false, depois: [] };

/** A janela de um pedido da lista: abertura e, se já resolveu, fechamento. Os dois fontes e a tela usam esta. */
export function janelaDoPedido(p: PedidoItem): JanelaDoPedido {
  return { openedAt: p.openedAt, closedAt: ehAberto(p) ? null : p.closedAt };
}

/** Início da janela de "antes": a abertura menos `JANELA_ANTES_MS`. */
export function inicioAntes(p: Pick<JanelaDoPedido, "openedAt">): string {
  return new Date(Date.parse(p.openedAt) - JANELA_ANTES_MS).toISOString();
}

/** Onde começa o "depois": a abertura (aberto) ou o fechamento menos a folga (resolvido). */
export function inicioDepois(p: Pick<JanelaDoPedido, "openedAt" | "closedAt">): string {
  if (!p.closedAt) return p.openedAt;
  return new Date(Date.parse(p.closedAt) - FOLGA_FECHAMENTO_MS).toISOString();
}

/** Onde termina o "depois" do RESOLVIDO (o do aberto não tem fim). */
export function fimDepois(p: Pick<JanelaDoPedido, "openedAt" | "closedAt">): string {
  return new Date(Date.parse(inicioDepois(p)) + JANELA_DEPOIS_MS).toISOString();
}

const tempo = (l: { created_at: string | null }) => Date.parse(l.created_at ?? "");

/** A ordem da conversa: chegada, e o id desempata. */
function ordemDaHistoria(a: LinhaHistoria, b: LinhaHistoria): number {
  return tempo(a) - tempo(b) || a.id - b.id;
}

/** A linha traz uma mensagem DO CLIENTE (texto, ou mídia recebida sem resposta junto). */
function linhaDoCliente(l: LinhaHistoria): boolean {
  if (ehManual(l.message_type)) return false;
  return !!l.user_message?.trim() || (!!l.media_url && !l.bot_message);
}

/**
 * `linhaDoCliente` no filtro do PostgREST (`.or(...)`), para o limite do banco
 * contar só linhas do cliente (sem isto a mídia mandada pelo time, `manual`,
 * ocupava vaga e o corte "há mensagens anteriores" sumia). `message_type` nulo
 * conta como não manual (`neq` sozinho deixaria o nulo de fora). Única
 * diferença: texto só de espaços passa aqui e sai em `linhaDoCliente`.
 */
export const FILTRO_DO_CLIENTE = [
  "and(message_type.is.null,user_message.not.is.null)",
  "and(message_type.is.null,media_url.not.is.null,bot_message.is.null)",
  "and(message_type.neq.manual,user_message.not.is.null)",
  "and(message_type.neq.manual,media_url.not.is.null,bot_message.is.null)",
].join(",");

/**
 * A linha é uma RESPOSTA que entra no "depois". Resolvido: da IA ou do time
 * (`respostaDaLinha`, quem mandou sai de lib/mensagem.ts). Aberto: só do time
 * (envio manual), porque ninguém respondeu o pedido ainda.
 */
function linhaDeResposta(l: LinhaHistoria, p: JanelaDoPedido): boolean {
  if (!p.closedAt) return ehManual(l.message_type) && (!!l.bot_message?.trim() || !!l.media_url);
  return respostaDaLinha(l) != null;
}

/** O mesmo, no filtro do PostgREST, para o resolvido (o aberto é `message_type = manual`). */
export const FILTRO_DE_RESPOSTA = "bot_message.not.is.null,and(message_type.eq.manual,media_url.not.is.null)";

/** A linha cai na janela do "depois" (resolvido: até 24h; aberto: sem fim). */
function naJanelaDoDepois(l: LinhaHistoria, p: JanelaDoPedido): boolean {
  const t = tempo(l);
  return (
    Number.isFinite(t) && t >= Date.parse(inicioDepois(p)) && (!p.closedAt || t <= Date.parse(fimDepois(p)))
  );
}

/** A linha cai no período em que o pedido esperava: [abertura, fechamento] (aberto: sem fim). */
function noPeriodoDeEspera(l: LinhaHistoria, p: JanelaDoPedido): boolean {
  const t = tempo(l);
  return Number.isFinite(t) && t >= Date.parse(p.openedAt) && (!p.closedAt || t <= Date.parse(p.closedAt));
}

/**
 * O recorte de "antes" sobre linhas quaisquer da conversa (a memória do
 * /design). É o mesmo do banco: `created_at` em [abertura - 12h, abertura),
 * linha com mensagem recebida ou mídia, as 8 mais recentes, e delas as 5 últimas
 * do cliente.
 */
export function recorteAntes(linhas: LinhaHistoria[], p: Pick<JanelaDoPedido, "openedAt">): LinhaHistoria[] {
  const de = Date.parse(inicioAntes(p));
  const ate = Date.parse(p.openedAt);
  const lidas = linhas
    .filter((l) => tempo(l) >= de && tempo(l) < ate && (l.user_message != null || l.media_url != null))
    .sort((a, b) => ordemDaHistoria(b, a))
    .slice(0, LINHAS_ANTES);
  return mensagensQueLevaram(lidas);
}

/** Das linhas lidas antes da abertura (em qualquer ordem), as 5 últimas do cliente, em ordem. */
export function mensagensQueLevaram(lidas: LinhaHistoria[]): LinhaHistoria[] {
  return lidas.filter(linhaDoCliente).sort(ordemDaHistoria).slice(-MENSAGENS_QUE_LEVARAM);
}

/**
 * Das linhas lidas no período de espera (o banco traz as 11 mais novas DO
 * CLIENTE, `FILTRO_DO_CLIENTE`), as 10 mais novas, em ordem, e se cortou. A
 * 11ª só existe para saber que há mais.
 */
export function mensagensDurante(lidas: LinhaHistoria[]): { durante: LinhaHistoria[]; duranteCortado: boolean } {
  const doCliente = lidas.filter(linhaDoCliente).sort(ordemDaHistoria);
  return {
    durante: doCliente.slice(-MENSAGENS_DURANTE),
    duranteCortado: doCliente.length > MENSAGENS_DURANTE,
  };
}

/** O recorte de "durante" sobre linhas quaisquer (a memória do /design), igual ao do banco. */
export function recorteDurante(
  linhas: LinhaHistoria[],
  p: JanelaDoPedido
): { durante: LinhaHistoria[]; duranteCortado: boolean } {
  const lidas = linhas
    .filter((l) => noPeriodoDeEspera(l, p) && linhaDoCliente(l))
    .sort((a, b) => ordemDaHistoria(b, a))
    .slice(0, MENSAGENS_DURANTE + 1);
  return mensagensDurante(lidas);
}

/** O recorte de "depois", igual ao do banco: só respostas, na janela, as 6 primeiras. */
export function recorteDepois(linhas: LinhaHistoria[], p: JanelaDoPedido): LinhaHistoria[] {
  return linhas
    .filter((l) => naJanelaDoDepois(l, p) && linhaDeResposta(l, p))
    .sort(ordemDaHistoria)
    .slice(0, LINHAS_DEPOIS);
}

/**
 * Encaixa UMA linha que o realtime trouxe (zero consulta). Mensagem do cliente
 * no período de espera entra no "durante" (fica com as 10 mais novas e marca o
 * corte); uma RESPOSTA na janela do "depois" entra nele se ainda couber. A
 * mesma linha (por id) é trocada.
 */
export function encaixarNaHistoria(h: HistoriaDoPedido, linha: LinhaHistoria, p: JanelaDoPedido): HistoriaDoPedido {
  // A mesma linha, sem mudança (UPDATE que não mexeu no que a tela mostra): o MESMO objeto, sem render.
  const ja = h.durante.find((l) => l.id === linha.id) ?? h.depois.find((l) => l.id === linha.id);
  if (ja && COLUNAS.every((c) => ja[c] === linha[c])) return h;
  let out = h;
  if (linhaDoCliente(linha) && noPeriodoDeEspera(linha, p)) {
    const sem = out.durante.filter((l) => l.id !== linha.id);
    const todos = [...sem, linha].sort(ordemDaHistoria);
    const cortou = todos.length > MENSAGENS_DURANTE;
    out = {
      ...out,
      durante: todos.slice(-MENSAGENS_DURANTE),
      duranteCortado: out.duranteCortado || cortou,
    };
  }
  if (naJanelaDoDepois(linha, p) && linhaDeResposta(linha, p)) {
    const sem = out.depois.filter((l) => l.id !== linha.id);
    const depois = [...sem, linha].sort(ordemDaHistoria).slice(0, LINHAS_DEPOIS);
    if (depois.some((l) => l.id === linha.id)) out = { ...out, depois };
  }
  return out;
}

/** Rótulo da mídia (o arquivo não é baixado aqui; a conversa mostra). */
function rotuloDaMidia(tipo: string | null | undefined): string {
  switch (tipo) {
    case "image":
      return "Imagem";
    case "audio":
      return "Áudio";
    case "video":
      return "Vídeo";
    case "document":
      return "Documento";
    default:
      return "Arquivo";
  }
}

/** A mensagem do cliente numa linha (texto, ou mídia recebida sem resposta junto). */
function doCliente(l: LinhaHistoria): MensagemDaSecao {
  return {
    chave: `c${l.id}`,
    em: l.created_at ?? "",
    texto: l.user_message?.trim() ?? "",
    midia: l.media_url ? rotuloDaMidia(l.media_type) : null,
  };
}

/** O que foi mandado numa linha, e por quem, ou null se a linha não tem resposta. */
function respostaDaLinha(l: LinhaHistoria): { quem: "ia" | "time"; mensagens: MensagemDaSecao[] } | null {
  const em = l.created_at ?? "";
  if (respostaDaIa(l)) {
    // A IA responde em partes que o n8n grava unidas por " | " (dívida conhecida):
    // cada parte é uma mensagem que o cliente recebeu (`separarMensagens`, lib/painel.ts).
    const partes = separarMensagens(l.bot_message!);
    return { quem: "ia", mensagens: partes.map((texto, i) => ({ chave: `b${l.id}-${i}`, em, texto, midia: null })) };
  }
  if (respostaHumana(l)) {
    return { quem: "time", mensagens: [{ chave: `t${l.id}`, em, texto: l.bot_message!.trim(), midia: null }] };
  }
  if (ehManual(l.message_type) && l.media_url) {
    // Envio manual só com mídia (sem legenda).
    return { quem: "time", mensagens: [{ chave: `t${l.id}`, em, texto: "", midia: rotuloDaMidia(l.media_type) }] };
  }
  return null;
}

/**
 * As seções do detalhe: o que o cliente escreveu antes do pedido, o que ele
 * escreveu enquanto o pedido esperava, e o que foi mandado depois, por quem
 * mandou. Mensagem do cliente depois do FECHAMENTO não entra (está na conversa).
 * `antes` e `durante` já chegam prontos (só do cliente, em ordem, sem se
 * cruzar): os recortes e `encaixarNaHistoria` garantem isso.
 */
export function montarSecoes(h: HistoriaDoPedido): SecoesDoPedido {
  const cliente = h.antes.map(doCliente);
  const durante = h.durante.map(doCliente);
  const respostas: RespostaDaSecao[] = [];
  for (const l of h.depois) {
    const r = respostaDaLinha(l);
    if (!r) continue;
    const grupo = respostas.find((x) => x.quem === r.quem);
    if (grupo) grupo.mensagens.push(...r.mensagens);
    else respostas.push({ quem: r.quem, mensagens: [...r.mensagens] });
  }
  return { cliente, durante, duranteCortado: h.duranteCortado, respostas };
}
