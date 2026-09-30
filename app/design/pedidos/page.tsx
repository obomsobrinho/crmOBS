import NavRail from "@/components/NavRail";
import Pedidos from "@/components/Pedidos";
import { agoraMs } from "@/lib/periodo";
import type { ContatoLinha, PedidoLinha, PedidoResolvidoLinha } from "@/lib/pedidos";

// Preview da página de PEDIDOS (abertos e resolvidos) (dev-only, liberado pelo proxy). Sem
// banco: três pedidos em duas conversas, um deles acima de 2h (âmbar), e as
// ações só simulam. `?vazio=1` mostra a página sem pedido; `?abrir=` abre a
// linha como o link do aviso faz.
export const dynamic = "force-dynamic";

const H = 3_600_000;

export default async function DesignPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ vazio?: string; abrir?: string }>;
}) {
  const { vazio, abrir } = await searchParams;
  const agora = agoraMs();
  const iso = (msAtras: number) => new Date(agora - msAtras).toISOString();

  const pedidos: PedidoLinha[] =
    vazio === "1"
      ? []
      : [
          // Fora de ordem de propósito: quem ordena é a página.
          { id: 3, phone: "5511955554444", opened_at: iso(12 * 60_000), summary: "Quer saber se dá para parcelar em 10 vezes" },
          { id: 1, phone: "5511912345678", opened_at: iso(6 * H), summary: "Pediu o valor da troca da lente com antirreflexo" },
          { id: 2, phone: "5511912345678", opened_at: iso(40 * 60_000), summary: "Perguntou se a loja abre no feriado" },
        ];
  const contatos: ContatoLinha[] = [
    { telefone: "5511912345678", nomewpp: "Ana Paula", display_name: null },
    { telefone: "5511955554444", nomewpp: null, display_name: null },
  ];
  const resolvidos: PedidoResolvidoLinha[] =
    vazio === "1"
      ? []
      : [
          {
            id: 7, phone: "5511944443333", opened_at: iso(28 * H), summary: "Quis saber se entregam no sábado",
            instruction: "Diga que sim, até as 13h, com frete grátis acima de R$ 200.",
            closed_at: iso(27 * H), closed_how: "ia", closed_by: "u1",
          },
          {
            id: 6, phone: "5511912345678", opened_at: iso(50 * H), summary: "Pediu para falar com uma pessoa sobre a garantia",
            instruction: null, closed_at: iso(48 * H), closed_how: "resolvido", closed_by: "u1",
          },
        ];
  contatos.push({ telefone: "5511944443333", nomewpp: "Carlos Mendes", display_name: null });

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="Ótica Vision" activeHref="/pedidos" role="dono" />
      <Pedidos
        key={`${vazio}-${abrir}`}
        initialAbertos={pedidos}
        initialResolvidos={resolvidos}
        initialContatos={contatos}
        members={[{ userId: "u1", email: "franck@exemplo.com", role: "dono" }]}
        numeroAvisos={null}
        abrirId={abrir ? Number(abrir) : null}
        preview
      />
    </div>
  );
}
