import { PAGINA_MENSAGENS } from "@/lib/mensagem";
import { resumoDaConversa } from "@/lib/conversa-resumo";
import type { Supa } from "@/lib/supabase/tipos";
import { fetchMembers } from "@/lib/team";

// A ABERTURA DE UMA CONVERSA (passo 4 de docs/plano-dados-e-estado.md). As MESMAS
// leituras que a página fazia no servidor, agora do navegador, com a RLS de quem
// chama: as 30 mensagens mais recentes (as anteriores vêm ao rolar), o contato, a
// linha da conversa, o total e a primeira mensagem (uma função, R-14) e a equipe.
// Tudo em paralelo; nenhuma depende da outra.

/** `null` = não existe (ou não é desta empresa): nem mensagem nem contato. */
export async function lerAberturaDaConversa(supabase: Supa, phone: string) {
  const [mensagens, contato, conversa, membros, resumo] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("id, phone, nomewpp, user_message, bot_message, message_type, active, created_at, media_url, media_type")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGINA_MENSAGENS),
    supabase
      .from("dados_cliente")
      .select("id, telefone, nomewpp, atendimento_ia, created_at, display_name, custom_fields, email, birth_date, foto_path")
      .eq("telefone", phone)
      .maybeSingle(),
    supabase.from("conversations").select("id, assigned_user_id, pending_instruction, handoff_at").eq("phone", phone).maybeSingle(),
    fetchMembers(supabase),
    resumoDaConversa(supabase, phone),
  ]);
  if (mensagens.error) throw mensagens.error;
  if (contato.error) throw contato.error;
  if (conversa.error) throw conversa.error;
  const linhas = (mensagens.data ?? []).reverse();
  if (linhas.length === 0 && !contato.data) return null;
  return { linhas, contato: contato.data, conversa: conversa.data, membros, resumo };
}

export type AberturaDaConversa = NonNullable<Awaited<ReturnType<typeof lerAberturaDaConversa>>>;
