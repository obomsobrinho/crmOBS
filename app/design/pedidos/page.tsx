import { HandHelping } from "lucide-react";
import NavRail from "@/components/NavRail";
import PedidosAbertos from "@/components/PedidosAbertos";
import { Card } from "@/components/ui/card";
import { agoraMs } from "@/lib/periodo";
import type { ContatoLinha, MensagemContexto, PedidoLinha } from "@/lib/pedidos";

// Preview da página de PEDIDOS ABERTOS (dev-only, liberado pelo proxy). Sem
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
  const contexto: Record<string, MensagemContexto[]> = {
    "5511912345678": [
      { autor: "cliente", texto: "Oi, quanto fica a troca da lente com antirreflexo?", em: iso(6 * H + 60_000) },
      { autor: "ia", texto: "Vou verificar o valor certinho com o time e já te respondo por aqui.", em: iso(6 * H) },
      { autor: "cliente", texto: "E vocês abrem no feriado?", em: iso(40 * 60_000) },
    ],
    "5511955554444": [
      { autor: "cliente", texto: "Dá para parcelar em 10x?", em: iso(12 * 60_000) },
      { autor: "ia", texto: "Vou confirmar as condições de parcelamento e te aviso.", em: iso(12 * 60_000) },
    ],
  };

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="Ótica Vision" activeHref="/pedidos" role="dono" />
      <Card
        variant="pagina"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-6 max-md:rounded-none max-md:border-0 max-md:p-4"
      >
        <div className="mb-1 flex items-center gap-2">
          <HandHelping size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Pedidos de ajuda</h1>
        </div>
        <p className="mb-5 text-apoio text-ink-2">
          O que a IA passou para o time e ainda espera resposta, de quem espera
          há mais tempo para o mais recente.
        </p>
        <PedidosAbertos
          key={`${vazio}-${abrir}`}
          initialPedidos={pedidos}
          initialContatos={contatos}
          numeroAvisos={null}
          clientId="preview"
          abrirId={abrir ? Number(abrir) : null}
          preview
          contextoPreview={contexto}
        />
      </Card>
    </div>
  );
}
