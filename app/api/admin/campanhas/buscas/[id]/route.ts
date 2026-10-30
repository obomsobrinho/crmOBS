import { rotaDoAdmin } from "@/lib/admin";
import { buscaPorId, falhou } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// Uma busca (o topo do detalhe da busca).
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const busca = await buscaPorId(createServiceClient(), id);
    return busca ? Response.json(busca) : Response.json({ error: "busca não encontrada" }, { status: 404 });
  } catch (e) {
    return falhou("ler a busca", e);
  }
});
