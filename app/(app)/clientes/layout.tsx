import { after } from "next/server";
import ListaClientes from "@/components/ListaClientes";
import { atualizarFotos } from "@/lib/fotos-servidor";
import { Card } from "@/components/ui/card";
import { getMyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClienteItem } from "@/lib/clientes";
import {
  CONTAGENS_CLIENTES_VAZIAS,
  PAGINA_CLIENTES,
  fonteClientesDoBanco,
  paramsClientes,
} from "@/lib/clientes-fonte";
import { foraDaLista } from "@/lib/inbox-lista";
import { agoraMs } from "@/lib/periodo";

export const dynamic = "force-dynamic";

// TELA DE CLIENTES (30/09/2026, docs/plano-clientes.md). Lista à esquerda e
// ficha à direita, no molde do /inbox. Dono e atendente veem; conta bloqueada
// vê em leitura (D5), por isso `getMyClient` e não `requireActiveTenant`.
//
// A PRIMEIRA PÁGINA (10 clientes) e as contagens dos chips saem daqui, pela
// MESMA função do banco que o navegador usa para as páginas seguintes
// (docs/plano-carregamento.md, fase 3).
export default async function ClientesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await getMyClient();
  // Fotos de perfil vencidas são conferidas DEPOIS de a tela sair (lib/fotos.ts).
  if (client) after(() => atualizarFotos(client.id, client.evolution_instance));

  let inicial = { itens: [] as ClienteItem[], contagens: CONTAGENS_CLIENTES_VAZIAS, temMais: false };
  if (client) {
    const fonte = fonteClientesDoBanco(await createClient(), client.id);
    const params = paramsClientes("todos", "", foraDaLista(client.avisos), agoraMs());
    try {
      const [itens, contagens] = await Promise.all([fonte.pagina(params, null), fonte.contagens(params)]);
      inicial = { itens, contagens, temMais: itens.length === PAGINA_CLIENTES };
    } catch (e) {
      console.error("clientes, primeira página:", e);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 md:gap-3">
      <ListaClientes
        inicial={inicial}
        clientId={client?.id}
        numeroAvisos={client?.avisos ?? null}
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
