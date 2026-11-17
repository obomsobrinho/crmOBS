import { createClient } from "@/lib/supabase/client";
import { fonteClientesDoBanco, type FonteClientes } from "./fonte";
import { lerFichaDoContato } from "./ficha";

let guardada: { clientId: string; fonte: FonteClientes } | null = null;

/** A fonte da lista de Contatos no navegador (RLS), uma por empresa. */
export function fonteDeContatosDoNavegador(clientId: string): FonteClientes {
  if (guardada?.clientId !== clientId) guardada = { clientId, fonte: fonteClientesDoBanco(createClient(), clientId) };
  return guardada.fonte;
}

/** A ficha de um contato, lida do navegador. */
export function fichaDoNavegador(id: number) {
  return lerFichaDoContato(createClient(), id);
}

/** No máximo uma conferência das fotos a cada 10 minutos por aba. */
const INTERVALO_DAS_FOTOS_MS = 10 * 60_000;
let ultimaConferencia = 0;

/**
 * Pede ao servidor a conferência das fotos de perfil vencidas (`/api/contacts/fotos`).
 * Fogo e esquece: foto é enfeite, nenhuma falha aqui chega à tela. Uma foto só é
 * reconsultada depois de dias (`FOTO_RECHECAR_DIAS`), então pedir a cada entrada na
 * tela (como o layout fazia) só gastava uma ida ao servidor; voltar a Contatos dentro
 * de 10 minutos não pede nada (B2).
 */
export function pedirConferenciaDasFotos(): void {
  const agora = Date.now();
  if (agora - ultimaConferencia < INTERVALO_DAS_FOTOS_MS) return;
  ultimaConferencia = agora;
  void fetch("/api/contacts/fotos", { method: "POST" }).catch(() => {});
}
