import { notFound } from "next/navigation";
import ConversationView from "@/components/ConversationView";
import { PAGINA_MENSAGENS } from "@/lib/mensagem";
import { createClient } from "@/lib/supabase/server";
import { getMyClient } from "@/lib/auth";
import { bestName, nomeDoContato } from "@/lib/inbox";
import { fetchMembers } from "@/lib/team";
import type { ChatRow, Cliente } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // O param é o JID do WhatsApp. decodeURIComponent é defensivo: se já vier
  // decodificado, é no-op (o JID não contém '%').
  const { id } = await params;
  const phone = decodeURIComponent(id);
  const supabase = await createClient();

  // `getMyClient()` DENTRO do Promise.all (C5 do plano da demo, achado A1).
  // Ele estava antes, em série, e nenhuma das quatro consultas precisa dele:
  // ele só alimenta `userId`, `clientId` e `readOnly` no fim. Medido em
  // 07/09/2026: 887ms em série contra 402ms em paralelo, numa conversa de uma
  // mensagem. Com a memoização por request em `lib/auth.ts`, aqui ele costuma
  // voltar do cache do layout, mas a ordem continua certa se um dia deixar de
  // voltar.
  // CONVERSA PAGINADA (01/10/2026, docs/plano-carregamento.md, fase 4): só as
  // 30 mais recentes; as anteriores vêm ao rolar para cima. O total e a data da
  // primeira mensagem saem de consultas próprias, baratas (contagem e uma linha).
  const [
    { data: rows },
    { data: cliente },
    { data: conv },
    members,
    client,
    { count: totalMensagens },
    { data: primeiraMsg },
  ] =
    await Promise.all([
      supabase
        .from("chat_messages")
        .select("*")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGINA_MENSAGENS),
      supabase
        .from("dados_cliente")
        .select("*")
        .eq("telefone", phone)
        .maybeSingle(),
      supabase
        .from("conversations")
        .select("id, assigned_user_id, pending_instruction")
        .eq("phone", phone)
        .maybeSingle(),
      fetchMembers(supabase),
      getMyClient(),
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
    ]);

  const initialRows = ((rows ?? []) as ChatRow[]).reverse();
  const contato = cliente as Cliente | null;

  if (initialRows.length === 0 && !contato) notFound();

  // display_name (CRM) precede o nomewpp (pushName do WhatsApp).
  const name = nomeDoContato(contato) ?? bestName(initialRows);
  const firstMessageAt =
    (primeiraMsg as { created_at: string } | null)?.created_at ?? initialRows[0]?.created_at ?? null;
  const convRow = conv as {
    id: number;
    assigned_user_id: string | null;
    pending_instruction: string | null;
  } | null;

  return (
    <ConversationView
      phone={phone}
      name={name}
      fotoPath={contato?.foto_path ?? null}
      atendimentoIa={contato?.atendimento_ia ?? null}
      initialRows={initialRows}
      firstMessageAt={firstMessageAt}
      messageCount={totalMensagens ?? initialRows.length}
      temAntigas={(totalMensagens ?? 0) > initialRows.length}
      assignedUserId={convRow?.assigned_user_id ?? null}
      members={members}
      myUserId={client?.userId ?? ""}
      conversationId={convRow?.id ?? null}
      pendingInstruction={convRow?.pending_instruction ?? null}
      clientId={client?.id ?? ""}
      displayName={contato?.display_name ?? null}
      customFields={contato?.custom_fields ?? null}
      contactEmail={contato?.email ?? null}
      contactBirthDate={contato?.birth_date ?? null}
      contactExists={!!contato}
      readOnly={client?.access.blocked ?? false}
    />
  );
}
