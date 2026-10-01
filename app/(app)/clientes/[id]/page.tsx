import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import FichaContato from "@/components/FichaContato";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { getMyClient } from "@/lib/auth";
import { cleanName } from "@/lib/inbox";
import { diasSemContato } from "@/lib/clientes";
import { agoraMs } from "@/lib/periodo";
import { createClient } from "@/lib/supabase/server";
import { fetchMembers } from "@/lib/team";
import type { Cliente } from "@/lib/types";

export const dynamic = "force-dynamic";

// A ficha na tela de Clientes. É a MESMA do painel da conversa
// (`FichaContato`), com `superficie="clientes"`.
export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const supabase = await createClient();

  const { data } = await supabase
    .from("dados_cliente")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const contato = data as Cliente | null;
  if (!contato) notFound();
  const phone = contato.telefone;

  const [{ data: conv }, { count }, { data: primeira }, { data: qual }, members, client] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("id, last_message_at")
        .eq("phone", phone)
        .maybeSingle(),
      supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("phone", phone),
      supabase
        .from("chat_messages")
        .select("created_at")
        .eq("phone", phone)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("conversation_qualifications")
        .select("summary")
        .eq("phone", phone)
        .not("summary", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchMembers(supabase),
      getMyClient(),
    ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No celular a ficha é a tela inteira, e este é o caminho de volta. */}
      <div className="border-b border-line px-4 py-2 md:hidden">
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1.5 text-apoio font-semibold text-ink-2"
        >
          <ArrowLeft size={16} />
          Clientes
        </Link>
      </div>
      <AreaRolavel className="min-h-0 flex-1">
        <FichaContato
          key={contato.id}
          superficie="clientes"
          name={cleanName(contato.display_name) ?? cleanName(contato.nomewpp)}
          phone={phone}
          firstMessageAt={(primeira as { created_at: string } | null)?.created_at ?? null}
          messageCount={count ?? 0}
          members={members}
          myUserId={client?.userId ?? ""}
          conversationId={(conv as { id: number } | null)?.id ?? null}
          diasSemContato={diasSemContato(
            (conv as { last_message_at: string | null } | null)?.last_message_at ?? null,
            agoraMs()
          )}
          clientId={client?.id ?? ""}
          editableName={contato.display_name ?? null}
          customFields={contato.custom_fields ?? null}
          email={contato.email ?? null}
          birthDate={contato.birth_date ?? null}
          entendimento={(qual as { summary: string | null } | null)?.summary ?? null}
          podeEnviar={!client?.access.blocked}
          contactExists
        />
      </AreaRolavel>
    </div>
  );
}
