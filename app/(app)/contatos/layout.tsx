import GuardaDaTela from "@/components/GuardaDaTela";
import ListaDaSessao from "@/features/contatos/components/ListaDaSessao";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// TELA DE CONTATOS (30/09/2026, docs/plano-clientes.md, quando ainda se chamava Clientes; em /contatos desde 14/10/2026). Lista à esquerda e
// ficha à direita, no molde do /inbox. Dono e atendente veem; conta bloqueada
// vê em leitura (D5), por isso a guarda não exige conta ativa.
//
// Área migrada no passo 3b de docs/plano-dados-e-estado.md (14/11/2026): o layout NÃO
// lê o banco (D8). A sessão vem do layout do `(app)`, a lista lê pelo cache no
// navegador (`features/contatos/hooks/useContatos.ts`), e a conferência das fotos de
// perfil, que este layout fazia com `after()`, a tela pede depois de abrir
// (`/api/contacts/fotos`).
export default function ContatosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GuardaDaTela>
      <div className="flex min-h-0 flex-1 md:gap-3">
        <ListaDaSessao />
        <Card
          asChild
          variant="pagina"
          className="flex w-[400px] shrink-0 flex-col overflow-hidden max-md:w-full max-md:flex-1 max-md:has-[[data-clientes-vazio]]:hidden"
        >
          <main>{children}</main>
        </Card>
      </div>
    </GuardaDaTela>
  );
}
