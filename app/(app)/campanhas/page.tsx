import CampanhasAoVivo from "@/components/admin/campanhas/CampanhasAoVivo";
import type { InicialDaCentral } from "@/components/admin/campanhas/tipos";
import { adminDaPagina } from "@/lib/admin";
import { ehUuid } from "@/lib/admin-acesso";
import { painelDaBase, paginaDeBuscas, paginaDeCampanhas, totais } from "@/lib/campanhas-servidor";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campanhas", robots: { index: false } };

// CAMPANHAS (docs/plano-campanhas.md, D1): a prospecção do dono do produto, só para
// `ADMIN_USER_IDS`. Quem não é admin NÃO recebe 404 (revelaria o caminho):
// `adminDaPagina` o redireciona para `/contatos`.
//
// A tela que abre (os totais e, por padrão, a primeira página de campanhas; de volta da Nova busca, a
// primeira página de buscas e o painel da base) vem lida do servidor, como a lista de Clientes. Antes a tela dependia só das
// leituras do navegador, e um refresh mostrava o HTML vazio ("Carregando" e
// "Nenhum resultado") até elas voltarem, ou para sempre se uma travasse (bug de
// 30/10/2026). Cada peça que falhar aqui vem null e a tela lê de novo.
export default async function CampanhasPage({ searchParams }: { searchParams: Promise<{ rascunho?: string; aba?: string }> }) {
  await adminDaPagina();
  const { rascunho, aba } = await searchParams;
  const svc = createServiceClient();
  const agora = agoraMs();
  const ou = <T,>(onde: string, p: Promise<T>) =>
    p.catch((e): null => {
      console.error(`campanhas, primeira tela (${onde}):`, e);
      return null;
    });
  const emLeads = aba === "leads" || Boolean(rascunho);
  const primeira = { texto: "", situacao: null, pagina: 1 };
  const [t, campanhas, buscas, painel] = await Promise.all([
    ou("totais", totais(svc)),
    emLeads ? null : ou("campanhas", paginaDeCampanhas(svc, primeira, agora)),
    emLeads ? ou("buscas", paginaDeBuscas(svc, primeira)) : null,
    emLeads ? ou("painel", painelDaBase(svc, null, agora)) : null,
  ]);
  const inicial: InicialDaCentral = { totais: t, campanhas, buscas, painel };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CampanhasAoVivo agora={agora} inicial={inicial} abrirEmLeads={emLeads} rascunhoEsperandoId={ehUuid(rascunho) ? rascunho : null} />
    </div>
  );
}
