// Caminho relativo de propósito: o alias do script troca só `@/lib/supabase/service`.
import { createServiceClient as clienteDeVerdade } from "../../lib/supabase/service";

// O `createServiceClient` do ensaio do prompt (scripts/ensaio-do-prompt.mjs troca
// `@/lib/supabase/service` por este arquivo). Lê o banco de verdade, mas TODA
// escrita vira nada: insert, update, upsert e delete devolvem vazio sem chamar o
// banco, e só os `rpc` de leitura passam. O dryRun do turno já não grava a
// conversa; isto garante também que o registro do turno (`agent_turns`) e a soma
// do consumo de IA do mês não acontecem.

const ESCRITAS = new Set(["insert", "update", "upsert", "delete"]);
const RPC_DE_LEITURA = new Set(["match_knowledge_chunks"]);

/** O que foi barrado nesta execução, para o relatório. */
export const escritasBarradas: string[] = [];

/** Um resultado vazio que aceita qualquer encadeamento (`.select().single()`) e pode ser aguardado. */
function nada(rotulo: string): unknown {
  escritasBarradas.push(rotulo);
  const vazio = { data: null, error: null, count: null, status: 200, statusText: "ensaio" };
  const cadeia: unknown = new Proxy(function () {}, {
    get: (_alvo, chave) =>
      chave === "then"
        ? (ok: (v: typeof vazio) => unknown, falha: (e: unknown) => unknown) => Promise.resolve(vazio).then(ok, falha)
        : () => cadeia,
    apply: () => cadeia,
  });
  return cadeia;
}

export function createServiceClient() {
  const real = clienteDeVerdade();
  return new Proxy(real, {
    get(alvo, chave, receptor) {
      if (chave === "from") {
        return (tabela: string) => {
          const consulta = alvo.from(tabela as never);
          return new Proxy(consulta, {
            get(q, metodo, r) {
              if (typeof metodo === "string" && ESCRITAS.has(metodo)) return () => nada(`${metodo} ${tabela}`);
              const v = Reflect.get(q, metodo, r);
              return typeof v === "function" ? v.bind(q) : v;
            },
          });
        };
      }
      if (chave === "rpc") {
        return (nome: string, ...args: unknown[]) =>
          RPC_DE_LEITURA.has(nome) ? (alvo.rpc as (...a: unknown[]) => unknown)(nome, ...args) : nada(`rpc ${nome}`);
      }
      const v = Reflect.get(alvo, chave, receptor);
      return typeof v === "function" ? v.bind(alvo) : v;
    },
  });
}
