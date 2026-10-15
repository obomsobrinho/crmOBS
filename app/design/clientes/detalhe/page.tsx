import { notFound } from "next/navigation";
import NavRail from "@/components/NavRail";
import DetalheCliente from "@/components/admin/DetalheCliente";
import { ehAbaDoCliente } from "@/lib/admin-cliente";
import { idFalso, clientesFalsos, detalheFalso, previewDoCliente } from "../dados";
import type { EstadoDoWhatsApp } from "@/lib/admin-alertas";
import { agoraMs } from "@/lib/periodo";

// Preview do detalhe de um cliente da central do dono (dev-only). Sem banco e sem
// sessão. Parâmetros: `cliente` (id falso; padrão o primeiro), `aba`
// (`visao`, `uso`, `atendimento`), `whatsapp` (`conectado`, `reconectando`, `desconectado`,
// `desconhecido`) e `vazio=1` (sem uso e sem atendimento). Editar o limite
// valida e não grava.
export const dynamic = "force-dynamic";

export default async function DesignDetalheClientePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string; aba?: string; whatsapp?: string; vazio?: string }>;
}) {
  const { cliente, aba, whatsapp, vazio } = await searchParams;
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
          detalhe={detalheFalso(e, agora)}
          abaInicial={ehAbaDoCliente(aba) ? aba : "visao"}
          preview={previewDoCliente(agora, estado, vazio === "1")}
          hrefLista="/design/clientes"
        />
      </div>
    </div>
  );
}
