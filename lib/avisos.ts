// AVISOS NO WHATSAPP (29/09/2026, plano em docs/plano-avisos.md).
//
// Módulo PURO (zero imports, como lib/billing.ts): a rota que grava o destino,
// o `processTurn` que manda o aviso e as telas que escondem o número de avisos
// usam as MESMAS funções. Duas opiniões sobre "é o número de avisos?" é como uma
// tela esconde a conversa e a outra conta ela.
//
// O destino mora em `clients.notify_group_jid` (nome antigo, semântica nova):
// um GRUPO (`...@g.us`, escolhido numa lista, nunca digitado) OU um NÚMERO
// (`<dígitos>@s.whatsapp.net`). É o mesmo valor que o n8n já usa no
// "Notifica grupo" e no "Avisa falha no grupo", e a Evolution aceita os dois
// formatos no `number` do sendText.

const SUFIXO_NUMERO = "@s.whatsapp.net";
const SUFIXO_GRUPO = "@g.us";

export function ehGrupo(jid: string | null | undefined): boolean {
  return typeof jid === "string" && jid.endsWith(SUFIXO_GRUPO);
}

/**
 * O que a pessoa digitou vira dígitos com DDI, ou `null` se não parece um
 * telefone. 10 ou 11 dígitos é número brasileiro sem DDI (DDD mais 8 ou 9
 * dígitos) e ganha o 55; de 12 a 15 já vem com DDI e fica como está.
 */
export function normalizarNumero(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

export function jidDoNumero(digitos: string): string {
  return `${digitos}${SUFIXO_NUMERO}`;
}

/** Dígitos de um JID de pessoa (`5511...@s.whatsapp.net`), ou `null` para grupo. */
export function digitosDoJid(jid: string | null | undefined): string | null {
  if (!jid || !jid.endsWith(SUFIXO_NUMERO)) return null;
  const d = jid.slice(0, -SUFIXO_NUMERO.length).replace(/\D/g, "");
  return d || null;
}

/**
 * Chave de comparação de telefone. ⚠️ O nono dígito: no Brasil o mesmo celular
 * aparece com e sem o 9 depois do DDD (o WhatsApp guarda muitos números antigos
 * sem ele), então a pessoa digita `11 9 1234-5678` e a conversa chega como
 * `551112345678`. Comparar os dígitos crus deixaria o número de avisos passar
 * por conversa comum, que é o defeito que esta regra existe para evitar.
 */
export function chaveTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") {
    return d.slice(0, 4) + d.slice(5);
  }
  return d;
}

export function mesmoTelefone(a: string, b: string): boolean {
  const ca = chaveTelefone(a);
  return ca !== "" && ca === chaveTelefone(b);
}

/**
 * A conversa `phone` é o número que recebe os avisos? Grupo nunca é (o n8n
 * recusa `@g.us` no nó `Rotas`, então conversa de grupo nem existe).
 *
 * Vale em TODA lista e contagem (revisão de 29/09/2026): conversas, pipeline,
 * painel, contador do menu e fila de pedidos. O aviso sai do número do agente,
 * e se alguém do time responder por ali, a troca vira "conversa" no banco.
 */
export function ehNumeroDeAvisos(
  phone: string | null | undefined,
  destino: string | null | undefined
): boolean {
  const d = digitosDoJid(destino);
  if (!d || !phone) return false;
  return mesmoTelefone(phone, d);
}

/** Tira do conjunto as linhas do número de avisos. Sem destino, devolve igual. */
export function semNumeroDeAvisos<T>(
  linhas: T[],
  destino: string | null | undefined,
  telefone: (l: T) => string | null | undefined
): T[] {
  if (!digitosDoJid(destino)) return linhas;
  return linhas.filter((l) => !ehNumeroDeAvisos(telefone(l), destino));
}

/** `+55 11 91234-5678`, para a tela dizer para onde os avisos vão. */
export function formatarNumero(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const corte = resto.length - 4;
    return `+55 ${ddd} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return `+${d}`;
}

/**
 * O texto do aviso de pedido de ajuda. Sem travessão e sem assumir segmento.
 * `abrir` ausente (rodando fora da Vercel) tira a linha inteira, em vez de
 * mandar um link para lugar nenhum.
 *
 * ⚠️ FORMATO REFEITO EM 30/09/2026 (dono: "está meio quebrada"): quatro linhas
 * coladas liam como um bloco só no celular. Agora são blocos separados por linha
 * em branco, com o negrito do WhatsApp (`*...*`) nos rótulos, e o telefone e o
 * link em linha própria, que é onde o WhatsApp os deixa tocáveis. O mesmo
 * desenho vale para o aviso de conversa marcada, que sai do n8n.
 */
export function textoDoAviso(a: {
  nome: string | null;
  phone: string;
  resumo: string;
  /** Rótulo do motivo (`rotuloDoMotivo`, lib/motivos.ts), já pronto: este
   *  módulo não importa nada. null/ausente = a linha some. */
  motivo?: string | null;
  abrir: string | null;
}): string {
  const digitos = a.phone.replace(/\D/g, "");
  const blocos = [
    "🙋 *A IA pediu sua ajuda*",
    [`*Cliente:* ${a.nome ?? formatarNumero(digitos)}`, `wa.me/${digitos}`].join("\n"),
    // O motivo vem antes do pedido: é o que o time lê primeiro para decidir se
    // abre agora (06/10/2026, P1 item 4).
    ...(a.motivo?.trim() ? [`*Motivo:* ${a.motivo.trim()}`] : []),
    `*Pedido:* ${a.resumo.trim() || "sem resumo"}`,
  ];
  if (a.abrir) blocos.push(`Abrir no CRM:\n${a.abrir}`);
  return blocos.join("\n\n");
}

export const TEXTO_TESTE_AVISO =
  "Teste de aviso do seu agente. Se chegou, está certo.";

/**
 * Telefone que não existe: DDD 00 não é código de área no Brasil. É o da
 * conversa de teste da suíte e2e (`e2e/semente.ts`, `5500000000001`), que abre
 * pedido de ajuda de verdade no cérebro. ⚠️ Sem esta trava a suíte mandaria
 * WhatsApp REAL ao destino de avisos do tenant de teste a cada rodada. Nenhum
 * cliente de verdade tem esse número, então não há aviso real perdido.
 *
 * ⚠️ É TAMBÉM a regra única de "telefone de teste nunca vai à Evolution"
 * (03/10/2026): o número da OBM foi restringido pelo WhatsApp (403) depois de
 * rodadas da bateria n8n mandando resposta real a este número. Todo ponto do
 * app que chama a Evolution para um contato pula quando isto é `true`; o n8n
 * repete a mesma regra nos nós `Telefone real?`
 * (docs/adr/2026-10-03-test-phone-never-reaches-evolution.md).
 */
export function telefoneImpossivel(phone: string): boolean {
  return /^5500/.test(phone.replace(/\D/g, ""));
}

/**
 * As grafias possíveis do número de avisos numa conversa: com e sem o nono
 * dígito (ver `chaveTelefone`). Existe para quem precisa excluir o número NO
 * BANCO (`not in`), como o contador do menu, que só conta e não traz linhas.
 * Vazio quando o destino é grupo ou não existe.
 */
export function grafiasDoNumeroDeAvisos(destino: string | null | undefined): string[] {
  const d = digitosDoJid(destino);
  if (!d) return [];
  return grafiasDeDigitos(d);
}

/**
 * ÚNICA fonte de "com e sem o nono dígito": os dígitos como vieram, a chave sem
 * o 9 e, para celular BR de 12 dígitos (sem o 9), a grafia com o 9. Quem
 * precisa dessas grafias (número de avisos, `p_fora` do SQL, busca de contato)
 * chama esta função em vez de reescrever a lista. A ordem é `[como veio,
 * chave, com 9]`, sem repetidos.
 */
export function grafiasDeDigitos(digitos: string): string[] {
  const chave = chaveTelefone(digitos);
  const grafias = new Set([digitos, chave]);
  if (chave.length === 12 && chave.startsWith("55")) {
    grafias.add(`${chave.slice(0, 4)}9${chave.slice(4)}`);
  }
  return [...grafias];
}
