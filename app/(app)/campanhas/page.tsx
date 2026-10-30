import CampanhasAoVivo from "@/components/admin/campanhas/CampanhasAoVivo";
import type { InicialDaCentral } from "@/components/admin/campanhas/tipos";
import { adminDaPagina } from "@/lib/admin";
import { painelDaBase, paginaDeBuscas, totais } from "@/lib/campanhas-servidor";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campanhas", robots: { index: false } };

// CAMPANHAS (docs/plano-campanhas.md, D1): a prospecção do dono do produto, só para
// `ADMIN_USER_IDS`. Quem não é admin NÃO recebe 404 (revelaria o caminho):
// `adminDaPagina` o redireciona para `/contatos`.
//
// A primeira tela (aba Leads: totais, primeira página de buscas e o painel da base)
// vem lida do servidor, como a lista de Clientes. Antes a tela dependia só das
// leituras do navegador, e um refresh mostrava o HTML vazio ("Carregando" e
// "Nenhum resultado") até elas voltarem, ou para sempre se uma travasse (bug de
// 30/10/2026). Cada peça que falhar aqui vem null e a tela lê de novo.
export default async function CampanhasPage() {
  await adminDaPagina();
  const svc = createServiceClient();
  const agora = agoraMs();
  const ou = <T,>(onde: string, p: Promise<T>) =>
    p.catch((e): null => {
      console.error(`campanhas, primeira tela (${onde}):`, e);
      return null;
    });
  const [t, buscas, painel] = await Promise.all([
    ou("totais", totais(svc)),
    ou("buscas", paginaDeBuscas(svc, { texto: "", situacao: null, pagina: 1 })),
    ou("painel", painelDaBase(svc, null, agora)),
  ]);
  const inicial: InicialDaCentral = { totais: t, buscas, painel };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CampanhasAoVivo agora={agora} inicial={inicial} />
    </div>
  );
}
