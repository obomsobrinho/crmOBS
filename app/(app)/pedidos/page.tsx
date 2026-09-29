import { redirect } from "next/navigation";
import { HandHelping } from "lucide-react";
import PedidosAbertos from "@/components/PedidosAbertos";
import { Card } from "@/components/ui/card";
import { getMyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ContatoLinha, PedidoLinha } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

// PEDIDOS ABERTOS (29/09/2026, docs/plano-pedidos.md). É para onde o "Abrir"
// do aviso no WhatsApp leva, com `?abrir={id}` para a linha nascer aberta.
//
// ⚠️ `getMyClient` e não `requireActiveTenant`, de propósito (decisão do dono):
// conta bloqueada vê a fila como vê o `/inbox`, só não age. As rotas de
// orientar, responder e resolver já respondem 402 nesse caso.
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ abrir?: string }>;
}) {
  const client = await getMyClient();
  if (!client) redirect("/login");
  const supabase = await createClient();
  const abrir = Number((await searchParams).abrir);

  const [{ data: pedidos }, { data: contatos }] = await Promise.all([
    supabase
      .from("handoffs")
      .select("id, phone, opened_at, summary")
      .is("closed_at", null)
      .order("opened_at", { ascending: true }),
    supabase.from("dados_cliente").select("telefone, nomewpp, display_name"),
  ]);

  return (
    <Card
      variant="pagina"
      className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 max-md:rounded-none max-md:border-0 max-md:p-4"
    >
      <div className="mb-1 flex items-center gap-2">
        <HandHelping size={20} className="text-brand-ink" />
        <h1 className="text-titulo">Pedidos de ajuda</h1>
      </div>
      <p className="mb-5 text-apoio text-ink-2">
        O que a IA passou para o time e ainda espera resposta, de quem espera há
        mais tempo para o mais recente.
      </p>
      <PedidosAbertos
        initialPedidos={(pedidos ?? []) as PedidoLinha[]}
        initialContatos={(contatos ?? []) as ContatoLinha[]}
        numeroAvisos={client.avisos}
        clientId={client.id}
        readOnly={client.access.blocked}
        abrirId={Number.isInteger(abrir) && abrir > 0 ? abrir : null}
      />
    </Card>
  );
}
