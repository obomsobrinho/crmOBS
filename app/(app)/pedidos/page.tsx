import { redirect } from "next/navigation";
import Pedidos from "@/components/Pedidos";
import { getMyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMembers } from "@/lib/team";
import { agoraMs } from "@/lib/periodo";
import {
  inicioDosResolvidos,
  type ContatoLinha,
  type PedidoLinha,
  type PedidoResolvidoLinha,
} from "@/lib/pedidos";

export const dynamic = "force-dynamic";

// PEDIDOS DE AJUDA (29/09/2026, refeita em 30/09/2026: docs/plano-fechar-p0.md).
// É para onde o "Abrir" do aviso no WhatsApp leva, com `?abrir={id}` para o
// pedido nascer selecionado. Abertos e resolvidos dos últimos 30 dias (D5).
//
// ⚠️ `getMyClient` e não `requireActiveTenant`, de propósito (decisão do dono):
// conta bloqueada vê a fila como vê o `/inbox`, só não age. As rotas de
// orientar e resolver já respondem 402 nesse caso.
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ abrir?: string }>;
}) {
  const client = await getMyClient();
  if (!client) redirect("/login");
  const supabase = await createClient();
  const abrir = Number((await searchParams).abrir);

  const [{ data: abertos }, { data: resolvidos }, members] =
    await Promise.all([
      supabase
        .from("handoffs")
        .select("id, phone, opened_at, summary")
        .is("closed_at", null)
        .order("opened_at", { ascending: true }),
      supabase
        .from("handoffs")
        .select("id, phone, opened_at, summary, instruction, closed_at, closed_how, closed_by")
        .not("closed_at", "is", null)
        .gte("closed_at", inicioDosResolvidos(agoraMs()))
        .order("closed_at", { ascending: false }),
      fetchMembers(supabase),
    ]);
  // Os NOMES só dos telefones que estão na fila e no histórico, e não a lista
  // inteira de contatos da conta (docs/plano-carregamento.md).
  const fones = [
    ...new Set(
      [...(abertos ?? []), ...(resolvidos ?? [])].map((h) => (h as { phone: string }).phone)
    ),
  ];
  const { data: contatos } = fones.length
    ? await supabase.from("dados_cliente").select("telefone, nomewpp, display_name").in("telefone", fones)
    : { data: [] };

  return (
    <Pedidos
      initialAbertos={(abertos ?? []) as PedidoLinha[]}
      initialResolvidos={(resolvidos ?? []) as PedidoResolvidoLinha[]}
      initialContatos={(contatos ?? []) as ContatoLinha[]}
      members={members}
      clientId={client.id}
      numeroAvisos={client.avisos}
      readOnly={client.access.blocked}
      abrirId={Number.isInteger(abrir) && abrir > 0 ? abrir : null}
    />
  );
}
