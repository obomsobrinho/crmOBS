import ListaDaSessao from "@/features/conversas/components/ListaDaSessao";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// CONVERSAS. Área migrada no passo 4 de docs/plano-dados-e-estado.md (16/11/2026): o
// layout NÃO lê o banco (D8). A sessão vem do layout do `(app)`, a lista e os números
// dos chips leem pelo cache no navegador (`features/conversas/hooks/useConversas.ts`,
// a MESMA função do banco de antes, `inbox_pagina`, com a RLS de quem chama), e a
// conferência das fotos de perfil a tela pede depois de abrir (`/api/contacts/fotos`).
export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:gap-3">
      {/* TRÊS seções: o menu, a lista de conversas e a conversa com os detalhes
          do contato. Cada uma é um cartão, separada por espaço de verdade. A
          conversa e os detalhes dividem o mesmo cartão de propósito: quem está
          respondendo olha para os dois ao mesmo tempo. */}
      {/* No CELULAR (abaixo de `md`) é uma tela por vez: em /inbox só a lista,
          em /inbox/[id] só a conversa. A lista se esconde sozinha quando há
          conversa aberta; a conversa se esconde aqui quando a página é o vazio
          "Selecione uma conversa" (`data-inbox-vazio`), por `:has`, porque o
          layout é Server Component e não sabe a rota. */}
      <div className="flex min-h-0 flex-1 md:gap-3">
        <ListaDaSessao />
        <Card
          asChild
          variant="pagina"
          className="flex min-w-0 flex-1 overflow-hidden max-md:has-[[data-inbox-vazio]]:hidden"
        >
          <main>{children}</main>
        </Card>
      </div>
    </div>
  );
}
