import { createClient } from "@/lib/supabase/client";
import { agoraMs } from "@/lib/periodo";
import { lerPainel } from "./painel";

/** O Painel lido do navegador (RLS), com o relógio da hora da leitura. */
export function painelDoNavegador(s: { clientId: string; avisos: string | null }) {
  return lerPainel(createClient(), s, agoraMs());
}
