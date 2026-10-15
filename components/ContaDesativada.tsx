import { Card } from "@/components/ui/card";
import BrandMark from "@/components/BrandMark";
import LogoutButton from "@/components/LogoutButton";

// A TELA CLARA DA CONTA DESATIVADA (central do dono, entrega 2; aba "Ações").
// Quem entra numa empresa desativada pelo dono do produto cai aqui, nunca num
// erro: diz o que aconteceu, que nada foi apagado e como sair. Uma peça só para a
// página de verdade (`/conta-desativada`) e o preview (`/design/conta-desativada`).
export default function ContaDesativada({ empresa }: { empresa: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4 max-md:items-stretch max-md:p-0">
      <Card
        asChild
        variant="pagina"
        className="w-full max-w-sm space-y-5 p-7 max-md:max-w-none max-md:px-5 max-md:pb-8 max-md:pt-12"
      >
        <main data-slot="conta-desativada">
          <BrandMark />
          <div className="space-y-2">
            <h1 className="text-titulo">Conta desativada</h1>
            <p className="text-apoio text-ink-2">
              O acesso de <strong data-slot="conta-desativada-nome">{empresa}</strong> está desativado no momento. O
              atendimento automático também está parado.
            </p>
            <p className="text-apoio text-ink-2">
              Nenhuma conversa nem contato foi apagado. Para voltar a usar, fale com quem te passou o acesso.
            </p>
          </div>
          <LogoutButton />
        </main>
      </Card>
    </div>
  );
}
