import { createClient } from "@/lib/supabase/client";
import { ErroDaApi, erroDaResposta } from "./erro";

/**
 * Chamada do navegador a uma rota do app (docs/plano-dados-e-estado.md, 2.9).
 *
 * - Sucesso: devolve o JSON (ou `undefined` num 204).
 * - 401: renova a sessão UMA vez e repete a chamada. Um 401 garante que nada foi
 *   gravado, então repetir não duplica. Se voltar 401 de novo, lança e o tratador
 *   global do cliente de dados manda para o login.
 * - Qualquer outra falha: lança `ErroDaApi` com status, código e a frase da rota.
 *
 * Fonte de área usa isto; tela nunca chama `fetch` direto para dado.
 */
export async function chamarApi<T>(url: string, init?: RequestInit): Promise<T> {
  let res = await fetch(url, init);
  if (res.status === 401 && (await renovarSessao())) {
    res = await fetch(url, init);
  }
  if (!res.ok) throw await erroDaResposta(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Corpo JSON de uma escrita, com o cabeçalho certo. */
export function comCorpo(metodo: "POST" | "PUT" | "PATCH" | "DELETE", corpo: unknown): RequestInit {
  return { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) };
}

async function renovarSessao(): Promise<boolean> {
  try {
    const { data, error } = await createClient().auth.refreshSession();
    return !error && !!data.session;
  } catch {
    return false;
  }
}

export function ehSessaoVencida(erro: unknown): boolean {
  return erro instanceof ErroDaApi && erro.status === 401;
}
