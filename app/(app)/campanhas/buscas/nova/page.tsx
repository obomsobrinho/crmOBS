import NovaBuscaAoVivo from "@/components/admin/campanhas/NovaBuscaAoVivo";
import { adminDaPagina } from "@/lib/admin";
import { ehUuid } from "@/lib/admin-acesso";
import { cidadeDaUltimaBusca } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova busca", robots: { index: false } };

// A NOVA BUSCA de leads (revisão do dono de 31/10/2026): uma página, com o mapa
// grande e os campos ao lado (`components/admin/campanhas/NovaBusca.tsx`), só para
// `ADMIN_USER_IDS` (quem não é admin vai para `/contatos`, nunca um 404). O mapa
// abre na cidade da última busca, lida aqui no servidor; sem busca (ou se a leitura
// falhar), na cidade da OBS. `?rascunho=` = a campanha que esperava contatos, que
// volta com o dono para Leads.
export default async function NovaBuscaPage({ searchParams }: { searchParams: Promise<{ rascunho?: string }> }) {
  await adminDaPagina();
  const { rascunho } = await searchParams;
  const local = await cidadeDaUltimaBusca(createServiceClient()).catch((e: unknown) => {
    console.error("campanhas, nova busca (última cidade):", e);
    return null;
  });
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <NovaBuscaAoVivo localInicial={local} rascunho={ehUuid(rascunho) ? rascunho : null} />
    </div>
  );
}
