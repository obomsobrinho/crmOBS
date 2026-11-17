import { notFound } from "next/navigation";
import FichaDaRota from "@/features/contatos/components/FichaDaRota";

export const dynamic = "force-dynamic";

// A ficha na tela de Contatos. É a MESMA do painel da conversa (`FichaContato`),
// com `superficie="clientes"`. A página não lê o banco (passo 3b de
// docs/plano-dados-e-estado.md, D8): só confere que o id é um número e entrega à
// ficha, que lê pelo cache no navegador (`FichaDaRota`).
export default async function ContatoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return <FichaDaRota id={id} />;
}
