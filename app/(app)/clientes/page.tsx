import ListaCentral from "@/components/admin/ListaCentral";
import { adminDaPagina, paginaDeClientes } from "@/lib/admin";
import { PAGINA_EMPRESAS, type EmpresaItem } from "@/lib/admin-empresas";
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
export default async function ClientesPage() {
  await adminDaPagina();

  const svc = createServiceClient();
  const agora = agoraMs();
  // A cotação do dólar segue como promessa (a lista não espera por ela): ver `useCambio`.
  const cambio = cotacaoPtax(agora);
  const itens = await paginaDeClientes(svc, { agora, busca: "", depois: null, modelo: AGENT_MODEL }).catch(
    (e): EmpresaItem[] => {
      console.error("clientes, primeira página:", e);
      return [];
    }
  );

  return <ListaCentral inicial={{ itens, temMais: itens.length === PAGINA_EMPRESAS }} cambio={cambio} />;
}
