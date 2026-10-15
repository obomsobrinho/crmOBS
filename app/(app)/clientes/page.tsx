import ListaCentral from "@/components/admin/ListaCentral";
import { adminDaPagina, bloqueadosSemBeta, paginaDeClientes } from "@/lib/admin";
import { betaAberto } from "@/lib/beta";
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

  const svc = createServiceClient();
  // As duas leituras em paralelo; uma falha não derruba a outra. Com a chave do
  // beta ligada, o aviso diz quantos cairiam se ela fosse desligada hoje (uma
  // contagem em SQL que espelha `accessState`); desligada, nada a avisar.
  const [pagina, contagem] = await Promise.allSettled([
    paginaDeClientes(svc, { agora: agoraMs(), busca: "", depois: null, modelo: AGENT_MODEL }),
    betaAberto() ? bloqueadosSemBeta(svc) : Promise.resolve(null),
  ]);
  if (pagina.status === "rejected") console.error("clientes, primeira página:", pagina.reason);
  if (contagem.status === "rejected") console.error("clientes, aviso do beta:", contagem.reason);
  const itens: EmpresaItem[] = pagina.status === "fulfilled" ? pagina.value : [];
  const bloqueariam = contagem.status === "fulfilled" ? contagem.value : null;

  return (
    <ListaCentral inicial={{ itens, temMais: itens.length === PAGINA_EMPRESAS }} bloqueariamSemBeta={bloqueariam} />
  );
}
