import { ehManual, respostaHumana } from "@/lib/mensagem";
import { FUSO, formatTime } from "@/lib/format";
import { diaSP } from "@/lib/inbox";
import type { Bubble, ChatRow } from "@/lib/types";
import type { Handoff } from "../HandoffCard";

export function rowsToBubbles(rows: ChatRow[]): Bubble[] {
  const bubbles: Bubble[] = [];
  for (const r of rows) {
    const media = r.media_url ?? null;
    const mediaType = r.media_type ?? null;
    // O que decide o lado é o message_type: 'manual' = enviado pelo CRM (balão
    // "out"), qualquer outro = recebido do contato (balão "in"). Não dá para
    // usar bot_message, porque mídia enviada sem legenda tem bot_message ''.
    const isManual = ehManual(r.message_type);
    // Balão recebido: tem texto do contato, ou é mídia recebida (não manual e
    // sem resposta do bot na mesma linha).
    if (r.user_message || (media && !isManual && !r.bot_message)) {
      bubbles.push({
        key: `u${r.id}`,
        side: "in",
        author: "cliente",
        content: r.user_message ?? "",
        created_at: r.created_at ?? "",
        mediaUrl: isManual ? null : media,
        mediaType: isManual ? null : mediaType,
      });
    }
    // Envio manual só com mídia (sem legenda): balão enviado com a mídia.
    if (isManual && media && !r.bot_message) {
      bubbles.push({
        key: `m${r.id}`,
        side: "out",
        author: "voce",
        content: "",
        created_at: r.created_at ?? "",
        mediaUrl: media,
        mediaType,
      });
    }
    if (r.bot_message) {
      // ⚠️ Quem respondeu sai de `lib/mensagem.ts`, e não de
      // `message_type === "manual"` escrito aqui. A regra escrita à mão dizia
      // "não é manual, logo é IA", e `imported` não é manual: o histórico que o
      // DONO digitou à mão no WhatsApp antes de existir agente aparecia com o
      // ícone de robô e o rótulo "IA". Na OBM são 84 das 94 linhas. É o mesmo
      // defeito que o módulo puro nasceu para matar no painel, e a conversa era
      // o último lugar que ainda o repetia. Também importa para o marco de "o
      // time assumiu" logo abaixo: sem isto, toda conversa importada abriria
      // com uma passagem de bastão que nunca aconteceu.
      const author = respostaHumana(r) ? "voce" : "ia";
      // A IA responde em 1-2 mensagens; o n8n grava as duas numa linha só unidas
      // por " | ". A pessoa recebeu duas mensagens separadas no WhatsApp, então
      // renderizamos como balões separados. Só a IA é dividida (o envio manual do
      // CRM é uma mensagem única e pode conter " | " de propósito).
      const parts =
        author === "ia" ? r.bot_message.split(" | ") : [r.bot_message];
      parts.forEach((content, i) =>
        bubbles.push({
          key: `b${r.id}-${i}`,
          side: "out",
          author,
          content,
          created_at: r.created_at ?? "",
          // mídia enviada só entra quando a linha não tem mensagem recebida.
          mediaUrl: i === 0 && !r.user_message ? media : null,
          mediaType: i === 0 && !r.user_message ? mediaType : null,
        })
      );
    }
  }
  return bubbles;
}

export function dayLabel(iso: string): string {
  const t = Date.parse(iso);
  const agora = Date.now();
  if (diaSP(t) === diaSP(agora)) return "Hoje";
  if (diaSP(t) === diaSP(agora - 86_400_000)) return "Ontem";
  return new Date(t).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: FUSO,
  });
}

/** A ordem da conversa: chegada no WhatsApp, e o id desempata. */
export function ordemDasLinhas(a: ChatRow, b: ChatRow): number {
  const ta = Date.parse(a.created_at ?? "");
  const tb = Date.parse(b.created_at ?? "");
  return ta !== tb ? ta - tb : a.id - b.id;
}

export type ItemDaConversa =
  | { kind: "day"; label: string; key: string }
  | { kind: "marco"; label: string; key: string }
  | { kind: "bubble"; bubble: Bubble; showLabel: boolean }
  | { kind: "handoff"; handoff: Handoff; key: string };

/**
 * A linha do tempo da conversa: separadores de dia, o marco "o time assumiu", os
 * balões e os pedidos de ajuda já fechados. Separadores de dia + flag de rótulo
 * (mostra "IA"/"Você" só quando o autor muda em relação ao balão anterior,
 * agrupa sequências, estilo WhatsApp).
 */
export function montarItens(bubbles: Bubble[], handoffs: Handoff[]): ItemDaConversa[] {
  const result: ItemDaConversa[] = [];
    // SÓ O PEDIDO FECHADO ENTRA NA CONVERSA, no ponto em que fechou (a linha
    // de histórico). O aberto mora na caixa de escrita (27/09/2026).
    const ancoras = handoffs
      .filter((h) => h.closedAt)
      .map((h) => ({ h, ate: Date.parse(h.closedAt!) }))
      .sort((a, b) => a.ate - b.ate);
    let proximo = 0;
    const soltarAte = (limite: number) => {
      while (proximo < ancoras.length && ancoras[proximo].ate < limite) {
        const h = ancoras[proximo].h;
        result.push({ kind: "handoff", handoff: h, key: `h-${h.id}` });
        lastAuthor = "";
        proximo++;
      }
    };
    let lastDay = "";
    let lastAuthor = "";
    // Quem respondeu por último ANTES deste balão, atravessando a virada de dia:
    // a passagem de bastão da IA para o time não deixa de existir porque a
    // conversa dormiu uma noite.
    let ultimaResposta = "";
    for (const b of bubbles) {
      soltarAte(Date.parse(b.created_at ?? ""));
      const day = new Date(b.created_at).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        lastAuthor = "";
        result.push({ kind: "day", label: dayLabel(b.created_at), key: `d-${day}` });
      }
      // MARCO: alguém do time assumiu. O sinal é a primeira resposta humana
      // depois de uma resposta da IA, e ele é DERIVADO, não guardado: responder
      // pelo CRM pausa a IA e atribui a conversa, então uma linha `manual`
      // logo depois de uma da IA É a passagem de bastão.
      //
      // ⚠️ SEM NOME, e isso não é descuido. O desenho escreve "Bruna assumiu a
      // conversa · 12:03", mas `chat_messages` não tem coluna de autor: quem
      // enviou pelo CRM não fica gravado em lugar nenhum. Pôr aqui o
      // responsável ATUAL da conversa seria inventar, porque ele pode ter
      // assumido meses depois, ou ser outra pessoa. Enquanto não houver autor
      // por mensagem, o marco diz o que é verdade: o time assumiu, e quando.
      if (b.author === "voce" && ultimaResposta === "ia") {
        lastAuthor = "";
        result.push({
          kind: "marco",
          label: `O time assumiu a conversa · ${formatTime(b.created_at)}`,
          key: `m-${b.key}`,
        });
      }
      if (b.author === "voce" || b.author === "ia") ultimaResposta = b.author;
      result.push({
        kind: "bubble",
        bubble: b,
        showLabel: b.author !== lastAuthor,
      });
      lastAuthor = b.author;
    }
    soltarAte(Infinity);
    // ⚠️ `lastOfGroup` SAIU. Ele existia para pôr o canto serrado só no último
    // balão de uma sequência, à moda do WhatsApp. No desenho aprovado o canto
    // recortado é do AUTOR, não da posição: todo balão recebido tem o recorte
    // em cima à esquerda e todo enviado em cima à direita, sempre. Com a regra
    // antiga, um balão sozinho e um balão no meio de uma sequência tinham
    // geometrias diferentes sem que isso significasse nada para quem lê.
    return result;
}
