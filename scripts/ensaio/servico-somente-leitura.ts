// Caminho relativo de propósito: o alias do script troca só `@/lib/supabase/service`.
import { createServiceClient as clienteDeVerdade } from "../../lib/supabase/service";
import { buscarTrechos, quantosTrechos, ragEmMemoriaAtivo } from "./rag-em-memoria";

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

/** Um resultado pronto que aceita qualquer encadeamento e pode ser aguardado. */
function resposta(r: { data: unknown; count: number | null }): unknown {
  const v = { ...r, error: null, status: 200, statusText: "ensaio" };
  const cadeia: unknown = new Proxy(function () {}, {
    get: (_alvo, chave) =>
      chave === "then"
        ? (ok: (x: typeof v) => unknown, falha: (e: unknown) => unknown) => Promise.resolve(v).then(ok, falha)
        : () => cadeia,
    apply: () => cadeia,
  });
  return cadeia;
}

/** Um resultado vazio que aceita qualquer encadeamento (`.select().single()`) e pode ser aguardado. */
function nada(rotulo: string): unknown {
  escritasBarradas.push(rotulo);
  return resposta({ data: null, count: null });
}

export function createServiceClient() {
  const real = clienteDeVerdade();
  return new Proxy(real, {
    get(alvo, chave, receptor) {
      if (chave === "from") {
        return (tabela: string) => {
          // `--documentos`: a contagem de trechos vem da base em memória, nunca da gravada.
          if (tabela === "knowledge_chunks" && ragEmMemoriaAtivo()) return resposta({ data: null, count: quantosTrechos() });
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
          nome === "match_knowledge_chunks" && ragEmMemoriaAtivo()
            ? resposta({ data: buscarTrechos((args[0] ?? {}) as Parameters<typeof buscarTrechos>[0]), count: null })
            : RPC_DE_LEITURA.has(nome) ? (alvo.rpc as (...a: unknown[]) => unknown)(nome, ...args) : nada(`rpc ${nome}`);
      }
      const v = Reflect.get(alvo, chave, receptor);
      return typeof v === "function" ? v.bind(alvo) : v;
    },
  });
}
