import ListaClientes from "@/components/ListaClientes";
import { Card } from "@/components/ui/card";
import { getMyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  montarClientes,
  type ContatoClienteRow,
  type ConversaClienteRow,
  type TagClienteRow,
} from "@/lib/clientes";

export const dynamic = "force-dynamic";

// Teto de carga da lista. Passou disso, a tela DIZ que cortou (nunca esconde em
// silêncio) e a busca continua valendo sobre o que veio.
const TETO = 2000;

// TELA DE CLIENTES (30/09/2026, docs/plano-clientes.md). Lista à esquerda e
// ficha à direita, no molde do /inbox. Dono e atendente veem; conta bloqueada
// vê em leitura (D5), por isso `getMyClient` e não `requireActiveTenant`.
export default async function ClientesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [client, { data: contatos }, { data: conversas }, { data: tags }] =
    await Promise.all([
      getMyClient(),
      supabase
        .from("dados_cliente")
        .select(
          "id, telefone, nomewpp, display_name, atendimento_ia, custom_fields, email, birth_date, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(TETO),
      supabase
        .from("conversations")
        .select("id, phone, last_message_at, assigned_user_id"),
      supabase.from("conversation_tags").select("conversation_id, tags(name, color)"),
    ]);

  const itens = montarClientes(
    (contatos ?? []) as ContatoClienteRow[],
    (conversas ?? []) as ConversaClienteRow[],
    (tags ?? []) as unknown as TagClienteRow[],
    client?.avisos ?? null
  );

  return (
    <div className="flex min-h-0 flex-1 md:gap-3">
      <ListaClientes
        itens={itens}
        cortada={(contatos ?? []).length >= TETO}
        podeCadastrar={!client?.access.blocked}
      />
      <Card
        asChild
        variant="pagina"
        className="flex w-[400px] shrink-0 flex-col overflow-hidden max-md:w-full max-md:flex-1 max-md:has-[[data-clientes-vazio]]:hidden"
      >
        <main>{children}</main>
      </Card>
    </div>
  );
}
