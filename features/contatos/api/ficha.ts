import type { Tables } from "@/lib/database.types";
import type { Supa } from "@/lib/supabase/tipos";
import { resumoDaConversa, type ResumoConversa } from "@/lib/conversa-resumo";
import { fetchMembers, type Member } from "@/lib/team";

// A FICHA DE UM CONTATO na tela de Contatos: as mesmas leituras que a página do
// servidor fazia até o passo 3b (docs/plano-dados-e-estado.md), agora do navegador,
// com a sessão de quem está logado (RLS). Uma ida, em paralelo, depois do contato.

const COLUNAS = "id, telefone, nomewpp, atendimento_ia, created_at, display_name, custom_fields, email, birth_date, foto_path";

export interface FichaDoContato {
  contato: Pick<
    Tables<"dados_cliente">,
    "id" | "telefone" | "nomewpp" | "display_name" | "custom_fields" | "email" | "birth_date" | "foto_path"
  >;
  conversa: Pick<Tables<"conversations">, "id" | "last_message_at"> | null;
  resumo: ResumoConversa;
  entendimento: string | null;
  membros: Member[];
}

/** `null` quando o contato não existe (ou não é desta empresa: o RLS esconde). */
export async function lerFichaDoContato(supabase: Supa, id: number): Promise<FichaDoContato | null> {
  const { data: contato, error } = await supabase.from("dados_cliente").select(COLUNAS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!contato) return null;
  const phone = contato.telefone;
  const [{ data: conversa, error: e1 }, resumo, { data: qual, error: e2 }, membros] = await Promise.all([
    supabase.from("conversations").select("id, last_message_at").eq("phone", phone).maybeSingle(),
    resumoDaConversa(supabase, phone),
    supabase
      .from("conversation_qualifications")
      .select("summary")
      .eq("phone", phone)
      .not("summary", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchMembers(supabase),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { contato, conversa: conversa ?? null, resumo, entendimento: qual?.summary ?? null, membros };
}
