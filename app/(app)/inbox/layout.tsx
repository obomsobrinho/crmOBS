import ContactSidebar from "@/components/ContactSidebar";
import AutoImport from "@/components/AutoImport";
import { createClient } from "@/lib/supabase/server";
import { getMyClient } from "@/lib/auth";
import { buildInbox, type ConvRow, type ContatoRow } from "@/lib/inbox";
import type { InboxItem } from "@/lib/types";

export const dynamic = "force-dynamic";

// Lê a lista de conversas (tabela `conversations`, mantida por trigger) e o
// cadastro de contatos numa tacada. A RLS já restringe tudo ao tenant logado.
async function getInbox(): Promise<{
  items: InboxItem[];
  ia: Record<string, string | null>;
}> {
  const supabase = await createClient();
  const [{ data: convs }, { data: contatos }] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "phone, last_message_at, last_message_preview, last_message_from, unread_count, assigned_user_id"
      )
      .order("last_message_at", { ascending: false })
      .limit(500),
    supabase
      .from("dados_cliente")
      .select("telefone, nomewpp, atendimento_ia, display_name"),
  ]);
  return buildInbox(
    (convs ?? []) as ConvRow[],
    (contatos ?? []) as ContatoRow[]
  );
}

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O gate de auth/instância já roda no layout do route group (app).
  const client = await getMyClient();
  const { items: initial, ia: initialIa } = await getInbox();
  const needsImport = !!client?.evolution_instance && !client.imported_at;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {needsImport && client && <AutoImport clientId={client.id} />}
      {/* TRÊS seções: o menu, a lista de conversas e a conversa com os detalhes
          do contato. Cada uma é um cartão, separada por espaço de verdade. A
          conversa e os detalhes dividem o mesmo cartão de propósito: quem está
          respondendo olha para os dois ao mesmo tempo. */}
      <div className="flex min-h-0 flex-1 gap-3">
        <ContactSidebar
          initial={initial}
          initialIa={initialIa}
          myUserId={client?.userId}
        />
        <main className="cartao flex min-w-0 flex-1 overflow-hidden rounded-2xl">
          {children}
        </main>
      </div>
    </div>
  );
}
