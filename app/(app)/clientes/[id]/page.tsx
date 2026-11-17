import { notFound } from "next/navigation";
import DetalheCliente from "@/features/central/components/DetalheCliente";
import { adminDaPagina, detalheDoCliente } from "@/lib/admin";
import { AGENT_MODEL } from "@/lib/agent";
import { cotacaoPtax } from "@/lib/cambio-servidor";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cliente", robots: { index: false } };

// DETALHE DE UM CLIENTE da central do dono (docs/plano-central-clientes.md). Só o
// dono do produto (`ADMIN_USER_IDS`). Quem não é admin NÃO recebe 404:
// `adminDaPagina` o leva a `/contatos/{id}` quando o id é um contato do tenant da
// própria pessoa (link antigo de Contatos) e a `/contatos` em qualquer outro
// caso, sem revelar que a central existe. Um id que não é de cliente (os
// contatos têm id numérico) segue esse caminho também para o admin, para o link
// antigo dele continuar valendo. A aba e os filtros das abas vivem na URL e a
// tela os lê (`features/central/components/na-url.ts`).
export default async function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await adminDaPagina(id);

  // A cotação do dólar (PTAX do Banco Central) NÃO segura a página: segue como promessa, a tela abre em US$
  // e troca para reais quando ela chega (`useCambio`). Sem cotação fica em US$ e a nota diz que está indisponível.
  const agora = agoraMs();
  const cambio = cotacaoPtax(agora);
  const detalhe = await detalheDoCliente(createServiceClient(), id, agora, AGENT_MODEL);
  if (!detalhe) notFound();

  return <DetalheCliente detalhe={detalhe} cambio={cambio} />;
}
