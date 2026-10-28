import { notFound } from "next/navigation";
import NavRail from "@/components/NavRail";
import DetalheCliente from "@/components/admin/DetalheCliente";
import { ehAbaDoCliente } from "@/lib/admin-cliente";
import { cambioDoPreview, idFalso, clientesFalsos, detalheFalso, previewDoCliente } from "../dados";
import type { EstadoDoWhatsApp } from "@/lib/admin-alertas";
import { agoraMs } from "@/lib/periodo";

// Preview do detalhe de um cliente da central do dono (dev-only). Sem banco e sem
// sessão. Parâmetros: `cliente` (id falso; padrão o primeiro), `aba`
// (`visao`, `uso`, `atendimento`, `financeiro`, `acoes`), `whatsapp` (`conectado`, `reconectando`, `desconectado`,
// `desconhecido`) e `vazio=1` (sem uso e sem atendimento), `pedidos=falha` (a leitura dos pedidos abertos falhou) `semcambio=1` (sem cotação do dólar: os custos ficam em US$) e `cambio=atraso|falha` (a cotação chega depois, como a de verdade: abre em US$ e troca) e `escala=N` (multiplica os tokens do uso, para provar números grandes). Editar o limite e as
// ações do Financeiro e das Ações validam e não gravam.
export const dynamic = "force-dynamic";

export default async function DesignDetalheClientePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; aba?: string; whatsapp?: string; vazio?: string; semcambio?: string; cambio?: string; escala?: string; pedidos?: string }>;
}) {
  const { cliente, aba, whatsapp, vazio, semcambio, cambio, escala, pedidos } = await searchParams;
  const fator = Number(escala) > 0 && Number(escala) <= 10_000 ? Number(escala) : 1;
  const agora = agoraMs();
  const todos = clientesFalsos(agora);
  const e = todos.find((c) => c.id === (cliente ?? idFalso(1)));
  if (!e) notFound();
  const estado: EstadoDoWhatsApp =
    whatsapp === "desconectado" || whatsapp === "reconectando" || whatsapp === "desconhecido" ? whatsapp : "conectado";

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="O Bom Sobrinho" activeHref="/clientes" role="dono" ehAdmin />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:gap-3">
        <DetalheCliente
          key={`${e.id}-${aba ?? ""}`}
          detalhe={{
            ...detalheFalso(e, agora, { vazio: vazio === "1" }),
            // `pedidos=falha`: a leitura dos pedidos abertos falhou (o servidor devolve null).
            ...(pedidos === "falha" ? { pedidos: null } : {}),
          }}
          cambio={cambioDoPreview(agora, cambio, semcambio === "1")}
          abaInicial={ehAbaDoCliente(aba) ? aba : "visao"}
          preview={previewDoCliente(e, agora, estado, vazio === "1", fator)}
          hrefLista="/design/clientes"
        />
      </div>
    </div>
  );
}
