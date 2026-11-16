import ConversaDaRota from "@/features/conversas/components/ConversaDaRota";

export const dynamic = "force-dynamic";

// A conversa aberta. Área migrada no passo 4 de docs/plano-dados-e-estado.md
// (16/11/2026): a página NÃO lê o banco (D8). A moldura aparece no clique e a abertura
// (as 30 mensagens mais recentes, o contato, a conversa, o resumo e a equipe) vem do
// navegador, com a RLS de quem chama (`features/conversas/api/conversa.ts`).
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // O param é o JID do WhatsApp. decodeURIComponent é defensivo: se já vier
  // decodificado, é no-op (o JID não contém '%').
  const { id } = await params;
  return <ConversaDaRota phone={decodeURIComponent(id)} />;
}
