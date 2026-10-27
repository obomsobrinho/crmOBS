"use client";

import { createClient } from "@/lib/supabase/client";
import {
  COLUNAS_DE_ARQUIVO,
  TIPOS_DE_ARQUIVO,
  arquivoDaLinha,
  type ArquivoDoContato,
  type TipoDeArquivo,
} from "@/lib/arquivos";

/** Página da lista de arquivos (regra da casa: 10 por vez). */
export const PAGINA_ARQUIVOS = 10;

type DoContato = { clientId: string; phone: string };

export type ParamsArquivos = DoContato & { tipo: TipoDeArquivo };

/**
 * Até `n` arquivos DE UM TIPO depois de `depois` (null = do começo), mais
 * recente primeiro. Keyset por (created_at, id), o mesmo da conversa
 * (`useMensagensDaConversa`), sobre o índice `(client_id, phone, created_at)`.
 * A RLS de `chat_messages` decide o tenant; o `client_id` vai junto pelo índice.
 */
export async function buscarArquivos(
  p: ParamsArquivos,
  depois: ArquivoDoContato | null,
  n: number
): Promise<ArquivoDoContato[]> {
  let q = createClient()
    .from("chat_messages")
    .select(COLUNAS_DE_ARQUIVO)
    .eq("client_id", p.clientId)
    .eq("phone", p.phone)
    .eq("message_type", p.tipo)
    .not("media_url", "is", null);
  if (depois) {
    q = q.or(
      `created_at.lt.${depois.criadoEm},and(created_at.eq.${depois.criadoEm},id.lt.${depois.id})`
    );
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(n);
  if (error) throw error;
  return (data ?? []).flatMap((l) => {
    const a = arquivoDaLinha(l);
    return a ? [a] : [];
  });
}

/** Quantos arquivos de cada tipo o contato tem: três HEAD com contagem, nunca linhas. */
export async function contarArquivos(p: DoContato): Promise<Record<TipoDeArquivo, number>> {
  const contagens = await Promise.all(
    TIPOS_DE_ARQUIVO.map(async (tipo) => {
      const { count, error } = await createClient()
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("client_id", p.clientId)
        .eq("phone", p.phone)
        .eq("message_type", tipo)
        .not("media_url", "is", null);
      if (error) throw error;
      return [tipo, count ?? 0] as const;
    })
  );
  return Object.fromEntries(contagens) as Record<TipoDeArquivo, number>;
}
