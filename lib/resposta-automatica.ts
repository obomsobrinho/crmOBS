import { normalizar } from "./clientes";

// RESPOSTA AUTOMÁTICA (07/11/2026, decisão do dono): a campanha cai num número com
// robô de menu ("Digite 1 para orçamento...") e, sem trava, a IA conversa com o
// robô: gasta token, abre pedido de ajuda a cada mensagem e a campanha conta o
// menu como "respondeu". O prompt sozinho não segura (ensaio de 07/11/2026: a
// regra fixa de chamar humano ganha da persona, e o turno precisa de pelo menos
// uma mensagem). A trava vem ANTES do modelo, em `processTurn`, e o cron da
// campanha usa a MESMA regra para não contar o robô como resposta.
//
// É resposta automática quando aparecem pelo menos 2 de 3 sinais:
//   (a) rápida: chega até 5 s depois da ENTREGA da nossa última mensagem;
//   (b) padrão de menu ou automação no texto;
//   (c) o mesmo texto, normalizado, já tinha chegado antes na conversa.
// Puro: sem I/O, servidor e testes usam o mesmo.

/** A única mensagem que a IA manda a um robô, uma vez por conversa. Texto do dono (07/11/2026). */
export const PEDIDO_AO_ROBO = "Queria falar com quem cuida do atendimento aí. Pode me responder por aqui quando der.";

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

/** Uma linha da conversa em ordem cronológica: nossa (com quantas partes) ou recebida. */
type LinhaDaConversa = { nossa: true; em: number; partes: number } | { nossa: false; em: number; texto: string };

/**
 * Para cada linha (em ordem cronológica), se é uma resposta automática. Linhas
 * nossas são sempre `false`. Cada recebida é julgada com o que veio antes dela
 * (as nossas de toda a conversa contam para a janela rápida, porque uma resposta
 * do robô pode chegar antes de o envio da campanha ser gravado).
 */
export function respostasAutomaticas(linhas: LinhaDaConversa[]): boolean[] {
  const nossas = linhas.flatMap((l) => (l.nossa ? [{ em: l.em, partes: l.partes }] : []));
  const anteriores = new Set<string>();
  return linhas.map((l) => {
    if (l.nossa) return false;
    const auto = ehRespostaAutomatica(sinaisDaResposta(l, { nossas, anteriores }));
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

/** O que o turno faz: `atender` (normal), `pedir` (manda `PEDIDO_AO_ROBO`, a primeira vez) ou `silenciar` (já pediu). */
export type DecisaoDoRobo = "atender" | "pedir" | "silenciar";

/**
 * A decisão do turno a partir das linhas de `chat_messages` (da mais NOVA para a
 * mais antiga, com o envio da campanha já no lugar dele, `comEnvioDaCampanha`) e
 * de quantas das primeiras são o lote que está sendo respondido (`semLoteAtual`).
 * Só é robô se TODAS as recebidas do lote forem automáticas: uma pessoa no meio
 * volta ao atendimento normal. Linha sem texto (mídia sem legenda) não entra na
 * conta. `jaPedimos` olha a janela do histórico.
 */
export function decisaoDoTurno(
  linhas: { user_message: string | null; bot_message: string | null; created_at: string | null }[],
  tamanhoDoLote: number
): DecisaoDoRobo {
  const cronologicas: { doLote: boolean; linha: LinhaDaConversa }[] = [];
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i];
    const em = Date.parse(l.created_at ?? "");
    if (!Number.isFinite(em)) continue;
    const bot = l.bot_message?.trim() ?? "";
    const user = l.user_message?.trim() ?? "";
    if (bot) cronologicas.push({ doLote: false, linha: { nossa: true, em, partes: partesDaLinha(bot) } });
    else if (user) cronologicas.push({ doLote: i < tamanhoDoLote, linha: { nossa: false, em, texto: user } });
  }
  const flags = respostasAutomaticas(cronologicas.map((c) => c.linha));
  const doLote = cronologicas.flatMap((c, k) => (c.doLote ? [flags[k]] : []));
  if (doLote.length === 0 || doLote.some((a) => !a)) return "atender";
  return linhas.some((l) => (l.bot_message ?? "").includes(PEDIDO_AO_ROBO)) ? "silenciar" : "pedir";
}
