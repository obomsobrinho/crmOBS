import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import FichaContato from "@/components/FichaContato";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { getMyClient } from "@/lib/auth";
import { cleanName, nomeDoContato } from "@/lib/inbox";
import { diasSemContato } from "@/lib/clientes";
import { agoraMs } from "@/lib/periodo";
import { createClient } from "@/lib/supabase/server";
import { membrosDoTenant } from "@/lib/team-servidor";
import { resumoDaConversa } from "@/lib/conversa-resumo";

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
    .select("id, telefone, nomewpp, atendimento_ia, created_at, display_name, custom_fields, email, birth_date, foto_path")
    .eq("id", id)
    .maybeSingle();
  const contato = data;
  if (!contato) notFound();
  const phone = contato.telefone;

  const clientPromise = getMyClient();
  const [{ data: conv }, resumo, { data: qual }, members, client] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("id, last_message_at")
        .eq("phone", phone)
        .maybeSingle(),
      resumoDaConversa(supabase, phone),
      supabase
        .from("conversation_qualifications")
        .select("summary")
        .eq("phone", phone)
        .not("summary", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      clientPromise.then((c) => (c ? membrosDoTenant(supabase, c.id) : [])),
      clientPromise,
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
          name={nomeDoContato(contato)}
          nomeBase={cleanName(contato.nomewpp)}
          phone={phone}
          firstMessageAt={resumo.primeira}
          messageCount={resumo.total}
          members={members}
          myUserId={client?.userId ?? ""}
          conversationId={conv?.id ?? null}
          diasSemContato={diasSemContato(
            conv?.last_message_at ?? null,
            agoraMs()
          )}
          clientId={client?.id ?? ""}
          editableName={contato.display_name ?? null}
          customFields={contato.custom_fields ?? null}
          email={contato.email ?? null}
          birthDate={contato.birth_date ?? null}
          entendimento={qual?.summary ?? null}
          podeEnviar={!client?.access.blocked}
          fotoPath={contato.foto_path ?? null}
          contactExists
        />
      </AreaRolavel>
    </div>
  );
}
