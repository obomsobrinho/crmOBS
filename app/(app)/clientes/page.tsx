import ListaCentral from "@/components/admin/ListaCentral";
import { adminDaPagina, paginaDeClientes } from "@/lib/admin";
import { PAGINA_EMPRESAS, type EmpresaItem } from "@/lib/admin-empresas";
import { AGENT_MODEL } from "@/lib/agent";
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

  let itens: EmpresaItem[] = [];
  try {
    itens = await paginaDeClientes(createServiceClient(), {
      agora: agoraMs(),
      busca: "",
      depois: null,
      modelo: AGENT_MODEL,
    });
  } catch (e) {
    console.error("clientes, primeira página:", e);
  }

  return <ListaCentral inicial={{ itens, temMais: itens.length === PAGINA_EMPRESAS }} />;
}
