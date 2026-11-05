// MÍDIAS DO AGENTE (04/11/2026, pedido do dono): a IA pode mandar um vídeo ou
// uma imagem que a empresa cadastrou em `agent_midias` (ex.: o vídeo de "como
// funciona" quando o lead pergunta como funciona).
//
// Módulo PURO (sem I/O): a regra existe uma vez, aqui, e o turno
// (`processTurn`, lib/agent-turn.ts) só lê o banco e assina a URL.
//
// - O modelo escolhe pela DESCRIÇÃO e por QUANDO ENVIAR, escritas por quem
//   cadastrou. Ele nunca vê o arquivo, então nunca descreve o que não está escrito.
// - O campo `midia` da saída só aceita as chaves cadastradas (enum do esquema,
//   `chavesParaOModelo`); qualquer outra coisa vira "" (`escolherMidia`).
// - No máximo UMA vez por conversa, por código (`escolherMidia` com as já
//   enviadas), não só pelo prompt.
// - Quem envia é o n8n, depois das mensagens de texto; a linha gravada é
//   `message_type = 'midia_ia'` (`MIDIA_DA_IA`, lib/mensagem.ts), sem
//   `bot_message`, então NÃO conta como resposta da IA nas métricas.

/** Uma mídia cadastrada, como o turno a lê de `agent_midias`. */
export interface MidiaDoCatalogo {
  chave: string;
  tipo: "video" | "image";
  path: string;
  mime: string;
  nomeArquivo: string;
  descricao: string;
  quandoEnviar: string;
  legenda: string;
}

/** O que sai do turno para o n8n enviar (a URL é assinada pelo turno, 1 hora). */
export interface MidiaDoTurno {
  chave: string;
  tipo: "video" | "image";
  path: string;
  mime: string;
  nomeArquivo: string;
  legenda: string;
  url: string;
}

/** Pasta das mídias do agente dentro do bucket `whatsapp-media`. */
export const PASTA_DAS_MIDIAS = "biblioteca";

/** Teto de mídias no prompt (o bloco precisa ficar curto). */
export const MAX_MIDIAS_NO_PROMPT = 5;

const CHAVE = /^[a-z0-9_]{1,40}$/;

/** O caminho é da própria empresa, na pasta das mídias do agente. */
export function caminhoDaMidiaValido(clientId: string, path: string): boolean {
  return !!clientId && path.startsWith(`${clientId}/${PASTA_DAS_MIDIAS}/`) && !path.includes("..");
}

/**
 * As linhas de `agent_midias` (ativas) viram o catálogo do turno. Linha torta
 * (chave fora do formato, tipo desconhecido, caminho de outra empresa, sem
 * descrição) fica de fora em silêncio: nunca derruba o atendimento.
 */
export function catalogoDasLinhas(
  clientId: string,
  linhas: {
    chave: string | null;
    tipo: string | null;
    path: string | null;
    mime: string | null;
    nome_arquivo: string | null;
    descricao: string | null;
    quando_enviar: string | null;
    legenda: string | null;
  }[]
): MidiaDoCatalogo[] {
  const vistas = new Set<string>();
  const out: MidiaDoCatalogo[] = [];
  for (const l of linhas) {
    const chave = (l.chave ?? "").trim();
    const tipo = l.tipo === "video" || l.tipo === "image" ? l.tipo : null;
    const path = (l.path ?? "").trim();
    const descricao = (l.descricao ?? "").trim();
    const quandoEnviar = (l.quando_enviar ?? "").trim();
    if (!CHAVE.test(chave) || !tipo || !descricao || !quandoEnviar || vistas.has(chave)) continue;
    if (!caminhoDaMidiaValido(clientId, path)) continue;
    vistas.add(chave);
    out.push({
      chave,
      tipo,
      path,
      mime: (l.mime ?? "").trim() || (tipo === "video" ? "video/mp4" : "image/jpeg"),
      nomeArquivo: (l.nome_arquivo ?? "").trim(),
      descricao,
      quandoEnviar,
      legenda: (l.legenda ?? "").trim(),
    });
    if (out.length >= MAX_MIDIAS_NO_PROMPT) break;
  }
  return out;
}

/** As mídias que ainda podem ir nesta conversa (as já enviadas saem). */
export function midiasDisponiveis(catalogo: MidiaDoCatalogo[], enviadas: Iterable<string>): MidiaDoCatalogo[] {
  const ja = new Set(enviadas);
  return catalogo.filter((m) => !ja.has(m.path) && !ja.has(m.chave));
}

/** O enum do campo `midia` no esquema do turno: as chaves disponíveis e "". */
export function chavesParaOModelo(disponiveis: MidiaDoCatalogo[]): string[] {
  return [...disponiveis.map((m) => m.chave), ""];
}

/**
 * O campo `midia` do esquema da saída (lib/agent.ts), ou null quando não há
 * chave: aí o esquema fica exatamente o de sempre, sem campo novo.
 */
export function campoMidiaDoEsquema(chaves: string[]): { type: "string"; enum: string[]; description: string } | null {
  const validas = [...new Set(chaves.filter((c) => CHAVE.test(c)))];
  if (validas.length === 0) return null;
  return {
    type: "string",
    enum: [...validas, ""],
    description: 'Chave de uma mídia de MÍDIAS PARA ENVIAR para mandar depois das mensagens, ou "" (o normal).',
  };
}

/** O `midia` que o modelo devolveu, limpo; o catálogo é conferido depois (`escolherMidia`). */
export function midiaDaSaida(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  return CHAVE.test(t) ? t : "";
}

const ROTULO = { video: "Vídeo", image: "Imagem" } as const;

/**
 * `### MÍDIAS PARA ENVIAR` do turno, ou null quando não há nada disponível. Vai
 * no fim do prompt (depois da ORIGEM), fora do prefixo do cache: a lista muda
 * quando uma mídia já foi enviada. Fica fora da persona: vale para qualquer
 * empresa que cadastrar mídia.
 */
export function blocoDeMidias(disponiveis: MidiaDoCatalogo[]): string | null {
  if (disponiveis.length === 0) return null;
  return [
    "### MÍDIAS PARA ENVIAR",
    "A empresa cadastrou estas mídias. Você não vê o arquivo: o que cada uma mostra é só o que está escrito abaixo.",
    ...disponiveis.map((m) => `- ${m.chave} (${ROTULO[m.tipo].toLowerCase()}): ${m.descricao} Quando enviar: ${m.quandoEnviar}`),
    'Para enviar, ponha a chave no campo midia; ela vai logo depois das suas mensagens. Só quando a situação de "Quando enviar" aconteceu nesta mensagem; na dúvida, midia vazio. No máximo uma por resposta, e cada uma só uma vez na conversa (as já enviadas aparecem no histórico e saem desta lista).',
    'Quando enviar, diga numa frase curta o que a pessoa vai ver, com base na descrição (ex.: "Te mando um vídeo curto mostrando como funciona."). Nunca diga que mandou uma mídia sem preencher midia, e nunca prometa uma que não está nesta lista.',
  ].join("\n");
}

/**
 * A mídia que o turno manda, ou null. O código decide, não o prompt: chave fora
 * do catálogo, já enviada, guardrail barrando ou turno de retomada (a resposta
 * sai pelo "CRM Envio IA", que não manda mídia) = nada.
 */
export function escolherMidia(a: {
  escolhida: string;
  catalogo: MidiaDoCatalogo[];
  enviadas: Iterable<string>;
  guardrailBarrou: boolean;
  retomada: boolean;
}): MidiaDoCatalogo | null {
  const chave = a.escolhida.trim();
  if (!chave || a.guardrailBarrou || a.retomada) return null;
  return midiasDisponiveis(a.catalogo, a.enviadas).find((m) => m.chave === chave) ?? null;
}

/**
 * A linha do histórico para uma mídia que a empresa já mandou: a IA lê o
 * histórico só em texto e, sem isto, não saberia que o vídeo foi.
 */
export function marcaDeMidiaEnviada(m: Pick<MidiaDoCatalogo, "tipo" | "chave" | "descricao"> | null): string {
  if (!m) return "[Mídia enviada pela empresa]";
  return `[${m.tipo === "video" ? "Vídeo enviado" : "Imagem enviada"} pela empresa: ${m.chave}. ${m.descricao}]`;
}
