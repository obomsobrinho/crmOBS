import { after } from "next/server";
import ContactSidebar from "@/components/ContactSidebar";
import { atualizarFotos } from "@/lib/fotos-servidor";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getMyClient } from "@/lib/auth";
import { JANELA_PADRAO } from "@/lib/inbox";
import {
  CONTAGENS_VAZIAS,
  PAGINA_INBOX,
  foraDaLista,
  inicioDaJanela,
  type Contagens,
  type ItemLista,
} from "@/lib/inbox-lista";
import { fonteDoBanco } from "@/lib/inbox-fonte";
import { agoraMs } from "@/lib/periodo";

export const dynamic = "force-dynamic";

// A PRIMEIRA PÁGINA da lista (10 conversas de hoje, mais os pedidos abertos) e
// as contagens dos chips, pela MESMA função do banco que o navegador usa para
// as páginas seguintes (docs/plano-carregamento.md). A RLS restringe ao tenant.
async function getInbox(
  clientId: string,
  userId: string | null,
  avisos: string | null
): Promise<{ itens: ItemLista[]; contagens: Contagens; temMais: boolean }> {
  const fonte = fonteDoBanco(await createClient(), clientId);
  const params = {
    inicio: inicioDaJanela(JANELA_PADRAO, agoraMs()),
    filtro: "all" as const,
    busca: "",
    eu: userId,
    fora: foraDaLista(avisos),
  };
  try {
    const [itens, contagens] = await Promise.all([
      fonte.pagina(params, null),
      fonte.contagens(params),
    ]);
    return { itens, contagens, temMais: itens.length === PAGINA_INBOX };
  } catch (e) {
    console.error("inbox, primeira página:", e);
    return { itens: [], contagens: CONTAGENS_VAZIAS, temMais: false };
  }
}

export default async function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O gate de auth/instância já roda no layout do route group (app).
  const client = await getMyClient();
  const inicial = client
    ? await getInbox(client.id, client.userId ?? null, client.avisos ?? null)
    : { itens: [], contagens: CONTAGENS_VAZIAS, temMais: false };
  // Fotos de perfil vencidas são conferidas DEPOIS de a tela sair (lib/fotos.ts).
  if (client) after(() => atualizarFotos(client.id, client.evolution_instance));

  return (
    <div className="flex min-h-0 flex-1 flex-col md:gap-3">
      {/* TRÊS seções: o menu, a lista de conversas e a conversa com os detalhes
          do contato. Cada uma é um cartão, separada por espaço de verdade. A
          conversa e os detalhes dividem o mesmo cartão de propósito: quem está
          respondendo olha para os dois ao mesmo tempo. */}
      {/* No CELULAR (abaixo de `md`) é uma tela por vez: em /inbox só a lista,
          em /inbox/[id] só a conversa. A lista se esconde sozinha quando há
          conversa aberta; a conversa se esconde aqui quando a página é o vazio
          "Selecione uma conversa" (`data-inbox-vazio`), por `:has`, porque o
          layout é Server Component e não sabe a rota. */}
      <div className="flex min-h-0 flex-1 md:gap-3">
        <ContactSidebar
          inicial={inicial}
          clientId={client?.id}
          myUserId={client?.userId}
          numeroAvisos={client?.avisos ?? null}
        />
        <Card
          asChild
          variant="pagina"
          className="flex min-w-0 flex-1 overflow-hidden max-md:has-[[data-inbox-vazio]]:hidden"
        >
          <main>{children}</main>
        </Card>
      </div>
    </div>
  );
}
