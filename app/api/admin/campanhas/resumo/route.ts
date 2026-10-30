import { rotaDoAdmin } from "@/lib/admin";
import { ehId, falhou, painelDaBase, torto } from "@/lib/campanhas-servidor";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// O painel da base (a aba Leads) ou de uma busca (`?busca=`), agregado no SQL.
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const busca = req.nextUrl.searchParams.get("busca");
    if (busca !== null && !ehId(busca)) return torto("busca inválida");
    try {
      return Response.json(await painelDaBase(createServiceClient(), busca, agoraMs()));
    } catch (e) {
      return falhou("ler o painel da base", e);
    }
  },
  { semId: true },
);
