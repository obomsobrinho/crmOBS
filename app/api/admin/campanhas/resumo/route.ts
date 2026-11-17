import { rotaDoAdmin } from "@/lib/admin";
import { lerConsulta } from "@/lib/rota";
import { consultaDaBusca } from "@/features/campanhas/schemas";
import { falhou, painelDaBase } from "@/features/campanhas/server/campanhas";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// O painel da base (a aba Leads) ou de uma busca (`?busca=`), agregado no SQL.
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const lido = lerConsulta(req, consultaDaBusca, { motivo: true });
    if ("erro" in lido) return lido.erro;
    try {
      return Response.json(await painelDaBase(createServiceClient(), lido.dados.busca, agoraMs()));
    } catch (e) {
      return falhou("ler o painel da base", e);
    }
  },
  { semId: true },
);
