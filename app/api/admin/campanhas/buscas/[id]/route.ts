import { rotaDoAdmin } from "@/lib/admin";
import { apagarBusca, buscaPorId, falhou } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// GET: uma busca (o topo do detalhe da busca). DELETE: apaga a lista (suave); 409 enquanto ela
// busca ou tem lead na fila de uma campanha.
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const busca = await buscaPorId(createServiceClient(), id);
    return busca ? Response.json(busca) : Response.json({ error: "busca não encontrada" }, { status: 404 });
  } catch (e) {
    return falhou("ler a busca", e);
  }
});

export const DELETE = rotaDoAdmin(
  async ({ admin, id }) => {
    try {
      return await apagarBusca(createServiceClient(), admin, id);
    } catch (e) {
      return falhou("apagar a lista", e);
    }
  },
  { revalidar: true },
);
