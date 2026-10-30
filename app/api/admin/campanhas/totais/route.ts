import { rotaDoAdmin } from "@/lib/admin";
import { falhou, totais } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// As contagens do topo (as abas Leads e Campanhas) e dos botões de filtro.
export const GET = rotaDoAdmin(
  async () => {
    try {
      return Response.json(await totais(createServiceClient()));
    } catch (e) {
      return falhou("contar a base", e);
    }
  },
  { semId: true },
);
