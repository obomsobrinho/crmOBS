"use client";

import { createClient } from "@/lib/supabase/client";

// URL assinada da mídia de uma mensagem (bucket privado `whatsapp-media`), com
// LOTE e CACHE (R-23, 01/10/2026). Antes cada balão de mídia pedia a própria URL,
// uma ida ao Storage por balão, e a mesma mídia era assinada de novo toda vez
// que a conversa era aberta ou o balão remontava.
//
// - LOTE: os pedidos que chegam juntos (os balões de uma página da conversa
//   montam no mesmo instante) saem numa chamada só, `createSignedUrls`.
// - CACHE: a URL vale 1h; guardamos por 50 min, então reabrir a conversa ou
//   voltar a ela não assina de novo. O mesmo caminho pedido duas vezes
//   enquanto a primeira ainda voa divide a resposta.
//
// A RLS do Storage continua decidindo (por tenant): um caminho que não é do
// tenant volta sem URL, e o balão cai no estado "carregando mídia".
const VALIDADE_S = 3600;
const GUARDA_MS = 50 * 60 * 1000;
const JANELA_DO_LOTE_MS = 15;

const guardadas = new Map<string, { url: string; ate: number }>();
const esperando = new Map<string, Array<(url: string | null) => void>>();
let agendado = false;

async function enviarLote() {
  agendado = false;
  const lote = new Map(esperando);
  esperando.clear();
  const caminhos = [...lote.keys()];
  if (caminhos.length === 0) return;

  const resultado = new Map<string, string | null>();
  try {
    const { data } = await createClient()
      .storage.from("whatsapp-media")
      .createSignedUrls(caminhos, VALIDADE_S);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) resultado.set(item.path, item.signedUrl);
    }
  } catch (e) {
    console.error("urls assinadas da mídia:", e);
  }

  const agora = Date.now();
  for (const [caminho, cbs] of lote) {
    const url = resultado.get(caminho) ?? null;
    if (url) guardadas.set(caminho, { url, ate: agora + GUARDA_MS });
    for (const cb of cbs) cb(url);
  }
}

/** URL assinada de um caminho do bucket `whatsapp-media`, ou `null` se não saiu. */
export function urlAssinadaDaMidia(caminho: string): Promise<string | null> {
  const guardada = guardadas.get(caminho);
  if (guardada && guardada.ate > Date.now()) return Promise.resolve(guardada.url);

  return new Promise((resolve) => {
    const fila = esperando.get(caminho);
    if (fila) fila.push(resolve);
    else esperando.set(caminho, [resolve]);
    if (!agendado) {
      agendado = true;
      setTimeout(() => void enviarLote(), JANELA_DO_LOTE_MS);
    }
  });
}

/** A URL já guardada, para o balão que remonta nascer pronto (sem piscar). */
export function urlGuardadaDaMidia(caminho: string): string | null {
  const g = guardadas.get(caminho);
  return g && g.ate > Date.now() ? g.url : null;
}
