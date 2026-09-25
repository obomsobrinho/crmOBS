import type { AgentConfig } from "@/lib/agent-prompt";
import { PASSOS_MONTAGEM, type PassoMontagem } from "@/lib/onboarding";

// Rascunho da montagem, no navegador.
//
// POR QUE NÃO SALVAR NO SERVIDOR A CADA PASSO (decisão do dono, 28/08/2026):
// cada `PUT /agent-config` grava uma linha em `agent_publications`, então salvar
// por passo encheria o histórico de versões com uma montagem só. E, mais
// importante, o rascunho no navegador diz a verdade para quem está montando:
// nada disto está no ar ainda. O assistente grava no servidor UMA vez, ao sair
// do passo "o que ele sabe".
//
// ⚠️ CUSTO ASSUMIDO: rascunho de navegador NÃO atravessa aparelho. Quem digitar
// no celular e voltar no computador começa vazio. É o preço de não poluir o
// histórico; o `montagemState` do servidor ainda leva a pessoa de volta ao passo
// certo, o que se perde é o texto ainda não salvo.

export interface Rascunho {
  config: AgentConfig;
  passo: PassoMontagem;
  /** ISO. Serve para o servidor vencer quando ele estiver mais novo. */
  salvoEm: string;
}

export function chaveRascunho(clientId: string): string {
  return `montagem:${clientId}`;
}

/**
 * Lê o rascunho. Devolve `null` quando não existe, quando está corrompido ou
 * quando o SERVIDOR está mais novo.
 *
 * ⚠️ A comparação com `agentConfigUpdatedAt` é a regra que impede o pior caso:
 * a pessoa monta metade no celular, abandona, entra em `/agente` no computador e
 * salva de verdade, e depois volta ao assistente no celular. Sem a comparação, o
 * rascunho velho apareceria por cima do que ela salvou.
 */
export function lerRascunho(
  clientId: string,
  agentConfigUpdatedAt: string | null
): Rascunho | null {
  if (typeof window === "undefined") return null;
  let bruto: string | null = null;
  try {
    bruto = window.localStorage.getItem(chaveRascunho(clientId));
  } catch {
    // Modo privado ou storage bloqueado: seguir sem rascunho é aceitável.
    return null;
  }
  if (!bruto) return null;

  let r: Rascunho;
  try {
    r = JSON.parse(bruto) as Rascunho;
  } catch {
    return null;
  }
  if (!r?.config || !r?.salvoEm) return null;

  // ⚠️ RASCUNHO DA ORDEM ANTIGA (antes de 24/09/2026) pode trazer um passo que
  // não existe mais. "ativar" era o último, e o último agora é "conectar";
  // qualquer outro desconhecido vira "quem", o começo. Um passo inexistente
  // deixaria o assistente sem título e sem conteúdo, travado.
  const p = r.passo as string;
  if (!PASSOS_MONTAGEM.some((d) => d.key === p)) {
    r = { ...r, passo: p === "ativar" ? "conectar" : "quem" };
  }

  if (agentConfigUpdatedAt) {
    // Comparação por INSTANTE, e nunca por texto: o banco devolve "+00:00" e o
    // navegador grava "Z", e comparar como string erra na fronteira.
    if (Date.parse(agentConfigUpdatedAt) >= Date.parse(r.salvoEm)) return null;
  }
  return r;
}

export function gravarRascunho(
  clientId: string,
  r: Omit<Rascunho, "salvoEm">
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      chaveRascunho(clientId),
      JSON.stringify({ ...r, salvoEm: new Date().toISOString() })
    );
  } catch {
    // Cota estourada ou storage bloqueado. Perder o rascunho é ruim, mas
    // derrubar a montagem por causa dele seria pior.
  }
}

export function limparRascunho(clientId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chaveRascunho(clientId));
  } catch {
    // idem
  }
}
