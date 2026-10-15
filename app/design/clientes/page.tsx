import NavRail from "@/components/NavRail";
import ListaCentral from "@/components/admin/ListaCentral";
import { PAGINA_EMPRESAS, fonteEmpresasDaMemoria } from "@/lib/admin-empresas";
import { agoraMs } from "@/lib/periodo";
import { clientesFalsos } from "./dados";

// Preview da central "Clientes" do dono do produto (dev-only, liberado pelo
// proxy). Sem banco e sem sessão: as linhas falsas passam pela MESMA conta da tela
// de verdade (`paraEmpresa`). `?cenario=vazia` mostra a lista sem clientes. A
// linha leva ao detalhe de mentira (`/design/clientes/detalhe`).
export const dynamic = "force-dynamic";

export default async function DesignClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string }>;
}) {
  const { cenario } = await searchParams;
  const todos = cenario === "vazia" ? [] : clientesFalsos(agoraMs());
  const primeira = await fonteEmpresasDaMemoria(todos).pagina({ busca: "", situacao: null }, null);

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="O Bom Sobrinho" activeHref="/clientes" role="dono" ehAdmin />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:gap-3">
        <ListaCentral
          inicial={{ itens: primeira, temMais: primeira.length === PAGINA_EMPRESAS }}
          previewTodas={todos}
          hrefModelo="/design/clientes/detalhe?cliente={id}"
        />
      </div>
    </div>
  );
}
