// SOLUÇÃO DO PEDIDO DE AJUDA (redesenho de Pedidos, aprovado pelo dono em 08/10/2026,
// docs/adr/2026-10-08-help-request-resolution-is-stored.md).
//
// Módulo PURO e fonte única da lista: quem fecha (`fecharPedido`, lib/handoffs.ts,
// chamado pelas três rotas), a página de Pedidos, a linha do pedido na conversa
// (`HandoffCard`) e a bancada leem daqui. O `check` da coluna `handoffs.solucao`
// no banco repete as chaves: mudou aqui, muda a migração junto.
//
// Por que existe: a tela montava a frase do desfecho a partir de `closed_how`
// ("ia" ou "resolvido"), e "resolvido" juntava duas coisas diferentes. A solução
// agora é GRAVADA no fechamento, pelo servidor, e a tela só mostra o rótulo.
//
// Cada porta que fecha um pedido grava UMA destas, sempre a mesma:
//   orientou_ia    POST /api/conversations/orientar (a IA responde com a orientação)
//   time_resolveu  POST /api/conversations/resolve  (fecha e devolve a conversa à IA)
//   time_assumiu   POST /api/send com `pedidoId`    (o time respondeu com as
//                  próprias palavras e ficou com a conversa; a IA segue pausada)
// Histórico: "ia" virou orientou_ia e "resolvido" virou time_resolveu. Nada é
// reclassificado depois (o "resolvido" antigo do envio manual fica como está).

export const SOLUCOES = [
  { chave: "orientou_ia", rotulo: "Orientou IA" },
  { chave: "time_resolveu", rotulo: "Time resolveu" },
  { chave: "time_assumiu", rotulo: "Time assumiu" },
] as const;

export type Solucao = (typeof SOLUCOES)[number]["chave"];

const ROTULO = new Map<string, string>(SOLUCOES.map((s) => [s.chave, s.rotulo]));

/**
 * A solução que cada PORTA grava (fonte única do mapa da tabela acima): as rotas
 * passam por aqui para `fecharPedido`, e a bancada, que simula as portas sem
 * banco, também.
 */
export const SOLUCAO_DA_PORTA = {
  orientar: "orientou_ia",
  resolver: "time_resolveu",
  responder: "time_assumiu",
} as const satisfies Record<string, Solucao>;

function ehSolucao(v: unknown): v is Solucao {
  return typeof v === "string" && ROTULO.has(v);
}

/** A solução lida do banco; qualquer coisa fora da lista é `null` (nunca inventar). */
export function solucaoDoBanco(v: unknown): Solucao | null {
  return ehSolucao(v) ? v : null;
}

/** Rótulo de tela, ou `null` quando não há solução gravada (a tela não mostra nada). */
export function rotuloDaSolucao(s: string | null | undefined): string | null {
  return (s && ROTULO.get(s)) || null;
}
