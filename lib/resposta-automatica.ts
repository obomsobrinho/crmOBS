import { normalizar } from "./clientes";

// RESPOSTA AUTOMÁTICA (07/11/2026, decisão do dono): a campanha cai num número com
// robô de menu ("Digite 1 para orçamento...") e, sem trava, a IA conversa com o
// robô: gasta token, abre pedido de ajuda a cada mensagem e a campanha conta o
// menu como "respondeu". O prompt sozinho não segura (ensaio de 07/11/2026: a
// regra fixa de chamar humano ganha da persona, e o turno precisa de pelo menos
// uma mensagem). A trava vem ANTES do modelo, em `processTurn`, e o cron da
// campanha usa a MESMA regra para não contar o robô como resposta.
//
// Duas regras, e basta uma:
//   1. JANELA DA PRIMEIRA RESPOSTA (24/11/2026, opção B do dono): o que chega até
//      120 s depois do envio da campanha, antes de qualquer mensagem nossa, é robô
//      quando nenhuma mensagem é áudio e pelo menos uma tem cara de automação
//      (padrão abaixo, 80 caracteres ou mais, ou um link). Os 17 robôs reais de
//      Lajinha chegaram de 1 a 58 s; a pessoa mais rápida, em 146 s, por áudio.
//      Risco aceito: uma pessoa que responde em 2 min com texto longo fica sem
//      resposta naquele lote; a próxima mensagem dela é atendida.
//   2. Pelo menos 2 de 3 sinais (07/11/2026), para o resto da conversa:
//      (a) rápida: chega até 5 s depois da ENTREGA da nossa última mensagem;
//      (b) padrão de menu ou automação no texto;
//      (c) o mesmo texto, normalizado, já tinha chegado antes na conversa.
// Áudio nunca é robô. Com robô a IA fica em SILÊNCIO (24/11/2026): o pedido de uma
// pessoa que saía uma vez só dava ao robô mais uma mensagem para responder.
// Puro: sem I/O, servidor e testes usam o mesmo.
// (why: docs/adr/2026-11-24-campaign-origin-embed-and-first-reply-window.md)

/** Regra 1: até quanto tempo depois do envio da campanha a primeira resposta pode ser robô (dono, 24/11/2026). */
export const JANELA_PRIMEIRA_RESPOSTA_MS = 120_000;

/** Regra 1: um texto deste tamanho (caracteres, sem as pontas) tem cara de automação (dono, 24/11/2026). */
export const TAMANHO_DE_AUTOMACAO = 80;

/** Um link no texto: endereço com protocolo, com www ou um domínio comum ("anota.ai", "saipos.com"). */
const TEM_LINK = /\bhttps?:\/\/\S|\bwww\.\S|\b[a-z0-9-]+\.(?:com|br|ai|app|me|link|ly|site|online|net|org)\b/i;

/** O sinal (a): até quanto tempo depois da entrega da nossa mensagem a resposta conta como rápida. */
const JANELA_RAPIDA_MS = 5_000;

/**
 * Quanto o n8n leva para ENTREGAR cada mensagem nossa depois de gravar a linha.
 * Espelha o fluxo `n8n/obs-atendimento.json`: "Salva chat_messages" grava antes de
 * enviar, e cada envio tem `delay: 2500` no "Evolution send" e 1 s ("1s") entre
 * uma mensagem e a próxima. Sem isso, o robô que responde na hora à 2ª mensagem
 * chegaria ~6 s depois da linha e o sinal (a) nunca pegaria. Mudou o n8n, muda aqui.
 */
const ATRASO_POR_MENSAGEM_MS = 2_500;
const PAUSA_ENTRE_MENSAGENS_MS = 1_000;

/**
 * O sinal (c) só vale para texto com pelo menos isto de caracteres normalizados:
 * uma pessoa repete "oi", "ok" ou "sim" sem ser robô; um menu repetido é longo.
 */
const TAMANHO_MINIMO_REPETIDA = 12;

/** Frases de automação (lista do dono, 07/11/2026, ampliada em 11/11/2026), já sem acento e em caixa baixa. */
const PALAVRAS_DE_AUTOMACAO = [
  /\bdigite\b/,
  /\bopca?o(es)?\b/,
  /\baguarde\b/,
  /\bmensagem automatica\b/,
  /\bretornaremos\b/,
  // Ausência e saudação do WhatsApp Business (campanha de Lajinha, 10 e 11/11/2026: as 7 passaram pela trava).
  /\bretornarei\b/,
  /\bentraremos em contato\b/,
  /\bentrarei em contato\b/,
  /\bno momento nao (estou|estamos) disponive(l|is)\b/,
  /\bnao (estou|estamos) disponive(l|is) no momento\b/,
  /\bagradece (o|seu|pelo) contato\b/,
  /\bobrigad[oa] (pelo|por seu|pelo seu) contato\b/,
  /\brecebemos (a )?sua mensagem\b/,
  /\bestarei te respondendo\b/,
  /\bseja bem vind[oa]\b/,
  /\bfora do (nosso )?horario de atendimento\b/,
];

/**
 * Linha de menu sem número: começa com emoji ou marcador ("✅Pediatra", "• Vendas",
 * "- Horários"). 3 ou mais delas contam como menu (dono, 11/11/2026). "*" e "-" só
 * com espaço depois, para um "*negrito*" no começo da linha não contar.
 */
const LINHA_DE_LISTA = /^\s*(?:[•▪◦‣]|[*-]\s|\p{Extended_Pictographic})/u;
const LINHAS_DE_LISTA_PARA_MENU = 3;

/**
 * Marcador de opção numerada: "1 para", "1 -", "1)", "1:", "1. " ou o emoji 1️⃣,
 * no começo do texto ou depois de espaço, parêntese ou asterisco.
 */
const MARCADOR_DE_OPCAO = /(?:^|[\s(*])([1-9])(?:️?⃣|\s*[-):]|\.(?=\s|$)|\s+(?:para|pra)\b)/gu;

/** O texto como os sinais comparam: sem acento, em caixa baixa, só letras e números, espaço simples. */
function textoComparavel(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** O sinal (b): o texto tem opções numeradas (2 ou mais), um menu de marcadores ou uma frase de automação. */
export function temPadraoDeAutomacao(texto: string): boolean {
  const opcoes = new Set([...texto.toLowerCase().matchAll(MARCADOR_DE_OPCAO)].map((m) => m[1]));
  if (opcoes.size >= 2) return true;
  if (texto.split("\n").filter((l) => LINHA_DE_LISTA.test(l)).length >= LINHAS_DE_LISTA_PARA_MENU) return true;
  const t = textoComparavel(texto);
  return PALAVRAS_DE_AUTOMACAO.some((p) => p.test(t));
}

/** Uma mensagem NOSSA (campanha, IA ou alguém do time): quando a linha foi gravada e quantas mensagens saíram nela. */
interface MensagemNossa {
  em: number;
  /** Quantas mensagens de WhatsApp a linha virou (a IA grava "a | b" numa linha só). */
  partes: number;
}

/** Até quando a mensagem nossa estava sendo entregue (ver `ATRASO_POR_MENSAGEM_MS`). */
function entregueAte(n: MensagemNossa): number {
  const partes = Math.max(1, n.partes);
  return n.em + partes * ATRASO_POR_MENSAGEM_MS + (partes - 1) * PAUSA_ENTRE_MENSAGENS_MS;
}

export interface SinaisDaResposta {
  rapida: boolean;
  padrao: boolean;
  repetida: boolean;
}

/**
 * Os três sinais de uma mensagem RECEBIDA. `nossas` = as mensagens nossas da
 * conversa; `anteriores` = os textos recebidos ANTES desta, já em `textoComparavel`.
 */
export function sinaisDaResposta(
  m: { texto: string; em: number },
  ctx: { nossas: MensagemNossa[]; anteriores: ReadonlySet<string> }
): SinaisDaResposta {
  // (a) Uma mensagem nossa estava saindo até 5 s antes desta chegar. A janela também
  // abre 5 s ANTES da nossa hora: o envio da campanha é gravado quando a Evolution
  // confirma (migration 20261108030904), e o robô pode responder antes disso; e o
  // relógio do n8n (hora da recebida) não é o do banco. Nenhuma pessoa responde a uma
  // mensagem antes de ela chegar.
  const rapida = ctx.nossas.some((n) => m.em >= n.em - JANELA_RAPIDA_MS && m.em <= entregueAte(n) + JANELA_RAPIDA_MS);
  const t = textoComparavel(m.texto);
  const repetida = t.length >= TAMANHO_MINIMO_REPETIDA && ctx.anteriores.has(t);
  return { rapida, padrao: temPadraoDeAutomacao(m.texto), repetida };
}

/** Pelo menos 2 dos 3 sinais. */
export function ehRespostaAutomatica(s: SinaisDaResposta): boolean {
  return Number(s.rapida) + Number(s.padrao) + Number(s.repetida) >= 2;
}

/** Regra 1: o texto tem cara de automação (padrão, tamanho ou link). */
export function temCaraDeAutomacao(texto: string): boolean {
  const t = texto.trim();
  return t.length >= TAMANHO_DE_AUTOMACAO || TEM_LINK.test(t) || temPadraoDeAutomacao(t);
}

/**
 * Regra 1 para um lote já dentro da janela: nenhum áudio e pelo menos uma
 * mensagem com cara de automação. Um robô manda saudação e ausência juntas, e a
 * curta das duas ("Como podemos ajudar?") vai junto com a longa.
 */
export function ehLoteDeRoboNaPrimeiraResposta(lote: { texto: string; audio?: boolean }[]): boolean {
  return lote.length > 0 && lote.every((m) => !m.audio) && lote.some((m) => temCaraDeAutomacao(m.texto));
}

/**
 * Uma linha da conversa em ordem cronológica: nossa (com quantas partes; `campanha`
 * = o envio da campanha) ou recebida (`audio` = a pessoa mandou áudio; o texto é a
 * transcrição).
 */
export type LinhaDaConversa =
  | { nossa: true; em: number; partes: number; campanha?: boolean }
  | { nossa: false; em: number; texto: string; audio?: boolean };

/**
 * Para cada linha (em ordem cronológica), se é uma resposta automática. Linhas
 * nossas e áudios são sempre `false`. Primeiro a regra 1: para cada envio de
 * campanha, as recebidas da janela (5 s antes do envio, porque o robô pode
 * responder antes de o envio ser gravado, até 120 s depois) que vieram antes de
 * qualquer outra mensagem nossa são julgadas como UM lote. Depois a regra 2, cada
 * recebida com o que veio antes dela (as nossas de toda a conversa contam para a
 * janela rápida).
 */
export function respostasAutomaticas(linhas: LinhaDaConversa[]): boolean[] {
  const nossas = linhas.flatMap((l) => (l.nossa ? [{ em: l.em, partes: l.partes }] : []));
  const naPrimeira = new Set<number>();
  linhas.forEach((c, k) => {
    if (!c.nossa || !c.campanha) return;
    const outra = linhas
      .filter((l, j) => j !== k && l.nossa && l.em > c.em)
      .reduce((min, l) => Math.min(min, l.em), Infinity);
    const grupo = linhas.flatMap((l, j) =>
      !l.nossa && l.em >= c.em - JANELA_RAPIDA_MS && l.em <= c.em + JANELA_PRIMEIRA_RESPOSTA_MS && l.em < outra ? [j] : []
    );
    const lote = grupo.map((j) => linhas[j] as Extract<LinhaDaConversa, { nossa: false }>);
    if (ehLoteDeRoboNaPrimeiraResposta(lote)) grupo.forEach((j) => naPrimeira.add(j));
  });
  const anteriores = new Set<string>();
  return linhas.map((l, k) => {
    if (l.nossa) return false;
    const auto = !l.audio && (naPrimeira.has(k) || ehRespostaAutomatica(sinaisDaResposta(l, { nossas, anteriores })));
    anteriores.add(textoComparavel(l.texto));
    return auto;
  });
}

/**
 * Quantas mensagens de WhatsApp uma linha nossa virou: a regra de `separarMensagens`
 * (`lib/painel.ts`, o n8n junta com " | "), repetida aqui para o bundle das
 * Campanhas não puxar `lib/agent-prompt.ts` pelo painel.
 */
export function partesDaLinha(botMessage: string): number {
  return Math.max(1, botMessage.split(" | ").filter((s) => s.trim()).length);
}

/** O que o turno faz: `atender` (normal) ou `silenciar` (robô: nenhuma mensagem, nenhum modelo). */
export type DecisaoDoRobo = "atender" | "silenciar";

/** Uma linha de `chat_messages` como a trava lê. */
type LinhaDoChat = { user_message: string | null; bot_message: string | null; created_at: string | null; message_type?: string | null };

/** A linha nossa é o envio da campanha (`comEnvioDaCampanha` a põe com a hora do envio). */
function ehOEnvio(l: LinhaDoChat, envioEm: number | null): boolean {
  return envioEm !== null && !!l.bot_message?.trim() && Date.parse(l.created_at ?? "") === envioEm;
}

/**
 * A decisão do turno a partir das linhas de `chat_messages` (da mais NOVA para a
 * mais antiga, com o envio da campanha já no lugar dele, `comEnvioDaCampanha`), de
 * quantas das primeiras são o lote que está sendo respondido (`semLoteAtual`) e da
 * hora do envio da campanha (ISO). Só é robô se TODAS as recebidas do lote forem
 * automáticas: uma pessoa no meio volta ao atendimento normal. Linha sem texto
 * (mídia sem legenda) não entra na conta, menos o áudio, que sempre é uma pessoa.
 */
export function decisaoDoTurno(linhas: LinhaDoChat[], tamanhoDoLote: number, envioDaCampanha: string | null): DecisaoDoRobo {
  const envioEm = envioDaCampanha ? Date.parse(envioDaCampanha) : null;
  const cronologicas: { doLote: boolean; linha: LinhaDaConversa }[] = [];
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i];
    const em = Date.parse(l.created_at ?? "");
    if (!Number.isFinite(em)) continue;
    const bot = l.bot_message?.trim() ?? "";
    const user = l.user_message?.trim() ?? "";
    const audio = l.message_type === "audio";
    if (bot) cronologicas.push({ doLote: false, linha: { nossa: true, em, partes: partesDaLinha(bot), campanha: ehOEnvio(l, envioEm) } });
    else if (user || audio) cronologicas.push({ doLote: i < tamanhoDoLote, linha: { nossa: false, em, texto: user, audio } });
  }
  const flags = respostasAutomaticas(cronologicas.map((c) => c.linha));
  const doLote = cronologicas.flatMap((c, k) => (c.doLote ? [flags[k]] : []));
  return doLote.length > 0 && doLote.every(Boolean) ? "silenciar" : "atender";
}

/**
 * A PRIMEIRA resposta de uma pessoa a um envio de campanha (o aviso ao dono, 24/11/2026):
 * nenhuma mensagem nossa depois do envio (nem da IA, nem do time). Com a IA em
 * silêncio para o robô, a primeira pessoa depois dele também é a primeira. Uma vez
 * por lead e envio, sem coluna nova: depois da resposta da IA a regra não vale mais.
 */
export function ehPrimeiraRespostaAoEnvio(linhas: LinhaDoChat[], envioDaCampanha: string): boolean {
  const envioEm = Date.parse(envioDaCampanha);
  return !linhas.some((l) => {
    const em = Date.parse(l.created_at ?? "");
    return !!l.bot_message?.trim() && em > envioEm;
  });
}
