import { notFound } from "next/navigation";
import DetalheCliente from "@/components/admin/DetalheCliente";
import { adminDaPagina, detalheDoCliente } from "@/lib/admin";
import { ehAbaDoCliente } from "@/lib/admin-cliente";
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
// antigo dele continuar valendo.
export default async function ClienteDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  await adminDaPagina(id);

  const { aba } = await searchParams;
  // A cotação do dólar (PTAX do Banco Central) NÃO segura a página: segue como promessa, a tela abre em US$
  // e troca para reais quando ela chega (`useCambio`). Sem cotação fica em US$ e a nota diz que está indisponível.
  const agora = agoraMs();
  const cambio = cotacaoPtax(agora);
  const detalhe = await detalheDoCliente(createServiceClient(), id, agora, AGENT_MODEL);
  if (!detalhe) notFound();

  return <DetalheCliente detalhe={detalhe} cambio={cambio} abaInicial={ehAbaDoCliente(aba) ? aba : "visao"} />;
}
