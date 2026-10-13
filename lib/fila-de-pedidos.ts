// FILA DE PEDIDOS DE AJUDA: as regras PURAS que o processTurn (lib/agent-turn.ts,
// server-only) usa para decidir se um turno abre pedido novo ou atualiza um que
// já espera. Saíram de lib/agent-turn.ts em 08/10/2026 para serem testadas
// direto (e2e/pedidos.design.spec.ts), sem servidor.
//
// `mesmoAssunto` é a REDE DE SEGURANÇA de 28/09/2026 (docs/adr/2026-09-27-handoff-queue-and-handoffs-table.md):
// sem palavra de assunto em comum, entra na fila mesmo que a IA diga que não é novo.

import { normalizar } from "./clientes";

// Palavras que aparecem em QUALQUER pedido de ajuda e por isso não dizem o
// assunto ("cliente quer falar com uma pessoa do time sobre..."). Fora delas,
// uma palavra em comum basta para dois resumos serem do mesmo assunto.
const PALAVRAS_DE_PEDIDO = new Set([
  "cliente", "quer", "queria", "pediu", "pedido", "pede", "falar", "fala", "pessoa", "alguem",
  "time", "equipe", "humano", "atendente", "sobre", "contato", "retorno", "resposta", "responder",
  "ajuda", "saber", "perguntou", "pergunta", "verificar", "confirmar", "dono", "voces", "para",
  "com", "uma", "mais", "ainda", "agora", "direto", "depois", "entender", "conversar", "cobrou",
  "cobra", "insistiu", "novamente", "tambem", "outra", "outro", "coisa", "assunto", "questao",
]);
function palavrasDeAssunto(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !PALAVRAS_DE_PEDIDO.has(p))
  );
}
/** Dois resumos de pedido falam do mesmo assunto? (uma palavra de assunto em comum) */
export function mesmoAssunto(a: string, b: string): boolean {
  const pa = palavrasDeAssunto(a);
  if (pa.size === 0) return true; // resumo vazio de assunto: não dá para dizer que é novo
  for (const p of palavrasDeAssunto(b)) if (pa.has(p)) return true;
  return false;
}

export interface PedidoEmAberto {
  id: number;
  summary: string | null;
  motivo: string | null;
}

export type AtualizacaoDoPedido =
  /** Nada a atualizar (o turno não trouxe informação nova para um pedido aberto). */
  | { tipo: "nenhuma" }
  /** Reescrever o resumo deste pedido aberto; `motivo` só vem quando o pedido não tinha. */
  | { tipo: "atualizar"; id: number; summary: string; motivo: string | null };

/**
 * PEDIDO ATUALIZADO PELO CLIENTE (08/10/2026, pedido do dono;
 * docs/adr/2026-10-08-open-request-updated-by-new-client-info.md).
 *
 * O cliente acrescentou informação a um pedido que ainda espera ("quer saber o
 * prazo de entrega" e depois "preciso até sexta"): o resumo desse pedido é
 * reescrito com o que a IA resumiu neste turno, em vez de ficar velho.
 *
 * QUEM DIZ QUAL PEDIDO É O MODELO: `pedido_aberto` é o número do pedido na lista
 * PEDIDOS DE AJUDA EM ABERTO (a mesma ordem de `abertos`, do mais antigo para o
 * mais novo) e `informacao_nova` diz se o cliente trouxe algo novo (insistir,
 * agradecer ou repetir é false). Aqui só se VALIDA, nada é adivinhado:
 * - não é a retomada (ela é a IA cumprindo uma orientação, não o cliente);
 * - a ação é `pausar` e o guardrail não barrou;
 * - o turno NÃO entrou na fila (pedido novo nunca atualiza o velho);
 * - `informacao_nova` e um `pedido_aberto` que existe na lista;
 * - o resumo não está vazio e é diferente do que o pedido já diz.
 *
 * Nunca avisa no WhatsApp (só pedido NOVO avisa) e nunca toca pedido fechado
 * (a lista `abertos` só tem os abertos; o UPDATE também filtra `closed_at`).
 */
export function atualizacaoDoPedido(t: {
  retomada: boolean;
  action: string;
  guardrailBarrou: boolean;
  entraNaFila: boolean;
  summary: string;
  /** O motivo deste turno (lib/motivos.ts), já validado; null = sem. */
  motivo: string | null;
  /** Número do pedido na lista PEDIDOS DE AJUDA EM ABERTO (1, 2...); 0 = nenhum. */
  pedidoAberto: number;
  informacaoNova: boolean;
  /** Os abertos na MESMA ordem da lista mostrada ao modelo. */
  abertos: PedidoEmAberto[];
}): AtualizacaoDoPedido {
  const nenhuma = { tipo: "nenhuma" } as const;
  const resumo = t.summary.trim();
  if (t.retomada || t.action !== "pausar" || t.guardrailBarrou || t.entraNaFila) return nenhuma;
  if (!t.informacaoNova || !resumo) return nenhuma;
  const alvo = Number.isInteger(t.pedidoAberto) ? t.abertos[t.pedidoAberto - 1] : undefined;
  if (!alvo) return nenhuma;
  // Mesmo texto (caixa, acento e espaço à parte) não é informação nova.
  const comparavel = (x: string) => normalizar(x).replace(/\s+/g, " ").trim();
  if (comparavel(alvo.summary ?? "") === comparavel(resumo)) return nenhuma;
  return {
    tipo: "atualizar",
    id: alvo.id,
    summary: resumo,
    motivo: alvo.motivo == null && t.motivo ? t.motivo : null,
  };
}

/**
 * O turno ENTRA NA FILA (abre pedido novo e avisa no WhatsApp)?
 *
 * Sem pedido aberto, todo `pausar` abre. Com pedido aberto, abre quando a IA diz
 * que o assunto é novo (`pedido_novo`) OU quando a rede `mesmoAssunto` não acha
 * palavra de assunto em comum com nenhum aberto (28/09/2026: a IA às vezes dizia
 * "mesmo pedido" para assunto novo). O guardrail que degrada para `pausar` só
 * abre quando não há nenhum. A retomada nunca abre.
 *
 * EXCEÇÃO (13/10/2026): quando o modelo APONTA um pedido da lista
 * (`pedido_aberto` válido em `listaDoModelo`), diz que é informação nova e que
 * não é pedido novo, o turno é ATUALIZAÇÃO daquele pedido (`atualizacaoDoPedido`)
 * e a rede não vale: o resumo reescrito ("precisa até sexta") pode não dividir
 * palavra com o pedido velho e viraria um pedido novo com aviso. Fora disso, a
 * rede fica exatamente como era.
 */
export function entraNaFila(t: {
  retomada: boolean;
  action: string;
  guardrailBarrou: boolean;
  /** Não há pedido aberto (no dryRun: a lista da bancada vazia). */
  semPedido: boolean;
  pedidoNovo: boolean;
  summary: string;
  /** Todos os abertos (a rede compara com eles). */
  abertos: { summary: string | null }[];
  pedidoAberto: number;
  informacaoNova: boolean;
  /** A lista numerada que o modelo viu (`pedido_aberto` aponta para ela). */
  listaDoModelo: unknown[];
}): boolean {
  if (t.retomada || t.action !== "pausar") return false;
  if (t.semPedido) return true;
  const atualiza =
    !t.pedidoNovo &&
    t.informacaoNova &&
    Number.isInteger(t.pedidoAberto) &&
    t.listaDoModelo[t.pedidoAberto - 1] !== undefined;
  if (atualiza) return false;
  const novo = t.pedidoNovo || !t.abertos.some((p) => mesmoAssunto(t.summary, p.summary ?? ""));
  return novo && !t.guardrailBarrou;
}
