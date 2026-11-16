import ListaCentral from "@/features/central/components/ListaCentral";
import { adminDaPagina, paginaDeClientes } from "@/lib/admin";
import { ehFiltroDeSituacao } from "@/lib/admin-alertas";
import type { EmpresaItem } from "@/lib/admin-empresas";
import { AGENT_MODEL } from "@/lib/agent";
import { cotacaoPtax } from "@/lib/cambio-servidor";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes", robots: { index: false } };

// CLIENTES (docs/plano-central-clientes.md): a central do dono do produto, com as
// empresas que usam o CRM. Só o dono do produto (`ADMIN_USER_IDS`). Quem não é
// admin NÃO recebe 404 (revelaria o caminho): `adminDaPagina` o redireciona para
// `/contatos`, onde essa lista morava. Cada rota `/api/admin` confere de novo.
//
// A central continua lendo a primeira página no servidor (D16, passo 5 de
// docs/plano-dados-e-estado.md): a do recorte da URL (`?q=`, `?situacao=`), que a tela
// põe no cache como dado fresco só para essa chave.
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; situacao?: string | string[] }>;
}) {
  await adminDaPagina();

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const situacao = ehFiltroDeSituacao(sp.situacao) ? sp.situacao : null;
  const svc = createServiceClient();
  const agora = agoraMs();
  // A cotação do dólar segue como promessa (a lista não espera por ela): ver `useCambio`.
  const cambio = cotacaoPtax(agora);
  const itens = await paginaDeClientes(svc, { agora, busca: q.trim(), depois: null, modelo: AGENT_MODEL, situacao }).catch(
    (e): EmpresaItem[] => {
      console.error("clientes, primeira página:", e);
      return [];
    }
  );

  return <ListaCentral inicial={{ params: { busca: q.trim(), situacao }, itens }} cambio={cambio} />;
}
