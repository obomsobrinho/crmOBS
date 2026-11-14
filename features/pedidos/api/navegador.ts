import { createClient } from "@/lib/supabase/client";
import { fonteDoBanco, type FontePedidos } from "./fonte";

let guardada: { clientId: string; fonte: FontePedidos } | null = null;

/**
 * A fonte de Pedidos no navegador: o banco, com a sessão de quem está logado (RLS).
 * Uma por empresa (o cliente Supabase do navegador já é único, `lib/supabase/client.ts`),
 * para a tela e a ponte do realtime usarem a mesma.
 */
export function fonteDoNavegador(clientId: string): FontePedidos {
  if (guardada?.clientId !== clientId) guardada = { clientId, fonte: fonteDoBanco(createClient(), clientId) };
  return guardada.fonte;
}
