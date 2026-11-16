import NavRail from "@/components/NavRail";
import ListaCentral from "@/features/central/components/ListaCentral";
import { fonteEmpresasDaMemoria } from "@/lib/admin-empresas";
import { agoraMs } from "@/lib/periodo";
import { ProvedorDeDados } from "@/lib/query/provedor";
import { cambioDoPreview, clientesFalsos } from "./dados";

// Preview da central "Clientes" do dono do produto (dev-only, liberado pelo
// proxy). Sem banco e sem sessão: as linhas falsas passam pela MESMA conta da tela
// de verdade (`paraEmpresa`). `?cenario=vazia` mostra a lista sem clientes. A
// linha leva ao detalhe de mentira (`/design/clientes/detalhe`). `?cambio=atraso|falha`: a cotação chega depois.
// A busca e o filtro vivem na URL (`?q=`, `?situacao=`), como na tela de verdade; o preview
// entrega a primeira página do recorte padrão e a tela lê o resto da memória.
export const dynamic = "force-dynamic";

export default async function DesignClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ cenario?: string; cambio?: string }>;
}) {
  const { cenario, cambio } = await searchParams;
  const agora = agoraMs();
  const todos = cenario === "vazia" ? [] : clientesFalsos(agora);
  const params = { busca: "", situacao: null };
  const primeira = await fonteEmpresasDaMemoria(todos).pagina(params, null);

  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="O Bom Sobrinho" activeHref="/clientes" role="dono" ehAdmin />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:gap-3">
        <ProvedorDeDados identidade={`design-clientes:${cenario ?? ""}`}>
          <ListaCentral
            inicial={{ params, itens: primeira }}
            previewTodas={todos}
            hrefModelo="/design/clientes/detalhe?cliente={id}"
            cambio={cambioDoPreview(agora, cambio)}
          />
        </ProvedorDeDados>
      </div>
    </div>
  );
}
