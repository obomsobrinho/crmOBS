import { rotaDoAdmin } from "@/lib/admin";
import { falhou, pontosDaBusca } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// Os pinos do mapa de uma busca: os leads dela com coordenadas e a cor do estado (no máximo 2000, no SQL).
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    return Response.json(await pontosDaBusca(createServiceClient(), id));
  } catch (e) {
    return falhou("ler os pinos da busca", e);
  }
});
