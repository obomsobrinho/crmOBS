import { createClient } from "@/lib/supabase/client";
import { fetchMembers } from "@/lib/team";
import { lerAberturaDaConversa } from "./conversa";
import { fonteDoBanco, type FonteInbox } from "./fonte";

/**
 * O cliente do Supabase no navegador (sessão do usuário, RLS), para a área de Conversas.
 * Componente e hook da área não importam `lib/supabase/client` (docs/plano-dados-e-estado.md,
 * 2.11): pedem aqui. As leituras que ainda moram nos componentes vêm para `api/` conforme o
 * passo 4 migra cada uma.
 */
export function clienteDoNavegador() {
  return createClient();
}

let guardada: { clientId: string; fonte: FonteInbox } | null = null;

/** A fonte da lista de Conversas no navegador (RLS), uma por empresa. */
export function fonteDeConversasDoNavegador(clientId: string): FonteInbox {
  if (guardada?.clientId !== clientId) guardada = { clientId, fonte: fonteDoBanco(createClient(), clientId) };
  return guardada.fonte;
}

/** A equipe, para nomear quem atende cada conversa. */
export function equipeDoNavegador() {
  return fetchMembers(createClient());
}

/** No máximo uma conferência das fotos a cada 10 minutos por aba (a regra de Contatos). */
const INTERVALO_DAS_FOTOS_MS = 10 * 60_000;
let ultimaConferencia = 0;

/** Pede ao servidor a conferência das fotos de perfil vencidas. Fogo e esquece: foto é enfeite. */
export function pedirConferenciaDasFotos(): void {
  const agora = Date.now();
  if (agora - ultimaConferencia < INTERVALO_DAS_FOTOS_MS) return;
  ultimaConferencia = agora;
  void fetch("/api/contacts/fotos", { method: "POST" }).catch(() => {});
}

/** A abertura de uma conversa, lida do navegador. */
export function aberturaDoNavegador(phone: string) {
  return lerAberturaDaConversa(createClient(), phone);
}
