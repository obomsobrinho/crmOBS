import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ehSessaoVencida } from "./api";
import { ErroDaApi, FRASE_SEM_RESPOSTA, valeRepetir } from "./erro";
import { mostrarAvisoGlobal } from "./aviso-global";
import type { ContextoDaEscrita } from "./escrita";

/** Listas e contadores: o realtime mantém em dia; 30 s evita reler numa troca rápida de tela. */
export const FRESCO_LISTA_MS = 30_000;
/** Configuração (estágios, equipe, planos): muda pouco. */
export const FRESCO_CONFIG_MS = 5 * 60_000;
/** Quanto tempo uma chave que ninguém olha fica guardada. */
export const GUARDADO_MS = 30 * 60_000;


/**
 * O cliente de dados do navegador, com os padrões do plano
 * (docs/plano-dados-e-estado.md, 2.4). Um por identidade: o provedor recria
 * quando o usuário ou a empresa mudam, então o cache nunca atravessa contas.
 *
 * - 401 em qualquer leitura ou escrita (depois da renovação única de
 *   `chamarApi`): vai ao login. O login não volta ao link de onde saiu, de
 *   propósito (docs/adr/2026-09-30-pedidos-detail-is-a-request-sheet-not-a-chat.md).
 * - Escrita recusada com a tela já trocada: aviso global (2.6).
 */
export function criarClienteDeDados(): QueryClient {
  const irAoLogin = (erro: unknown) => {
    if (ehSessaoVencida(erro) && typeof window !== "undefined") window.location.assign("/login");
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: irAoLogin }),
    mutationCache: new MutationCache({
      onError: (erro, _vars, ctx) => {
        irAoLogin(erro);
        if (ehSessaoVencida(erro) || typeof window === "undefined") return;
        const rota = (ctx as ContextoDaEscrita | undefined)?.rota;
        if (rota && rota !== window.location.pathname) {
          mostrarAvisoGlobal(erro instanceof ErroDaApi ? erro.message : FRASE_SEM_RESPOSTA);
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: FRESCO_LISTA_MS,
        gcTime: GUARDADO_MS,
        // Com realtime, os hooks do canal já revalidam na volta do foco e na
        // reconexão (realtime.md); área sem canal liga o foco na própria consulta.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: (tentativas, erro) => tentativas < 1 && valeRepetir(erro),
      },
      mutations: { retry: 0 },
    },
  });
}
