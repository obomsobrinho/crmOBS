import { redirect } from "next/navigation";
import Pedidos from "@/components/Pedidos";
import { getMyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { membrosDoTenant } from "@/lib/team-servidor";
import { foraDaLista } from "@/lib/inbox-lista";
import { PAGINA_PEDIDOS, ehAberto } from "@/lib/pedidos";
import { fonteDoBanco } from "@/lib/pedidos-fonte";

export const dynamic = "force-dynamic";

// PEDIDOS DE AJUDA (29/09/2026, refeita em 30/09/2026: docs/plano-fechar-p0.md;
// paginada em 02/10/2026, docs/plano-carregamento.md).
// É para onde o "Abrir" do aviso no WhatsApp leva, com `?abrir={id}` para o
// pedido nascer selecionado. Abertos e resolvidos dos últimos 30 dias (D5).
//
// O servidor traz SÓ a primeira página da aba que abre (10 pedidos), os números
// das abas e, se veio `?abrir=`, aquele pedido; o resto o navegador pede pela
// MESMA fonte (`lib/pedidos-fonte.ts`).
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
  const fonte = fonteDoBanco(supabase, client.id);
  const fora = foraDaLista(client.avisos);

  // O pedido do link primeiro: se já está resolvido, a página abre na aba dele.
  const [pedidoDoLink, members, contagens] = await Promise.all([
    Number.isInteger(abrir) && abrir > 0 ? fonte.porId(fora, abrir) : Promise.resolve(null),
    membrosDoTenant(supabase, client.id),
    fonte.contagens(fora),
  ]);
  const aba = pedidoDoLink && !ehAberto(pedidoDoLink) ? "resolvidos" : "abertos";
  const itens = await fonte.pagina({ aba, busca: "", fora }, null, PAGINA_PEDIDOS);

  return (
    <Pedidos
      inicial={{
        aba,
        itens,
        temMais: itens.length === PAGINA_PEDIDOS,
        contagens,
        abrir: pedidoDoLink,
      }}
      members={members}
      clientId={client.id}
      numeroAvisos={client.avisos}
      readOnly={client.access.blocked}
    />
  );
}
