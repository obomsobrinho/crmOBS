import { rotaDoAdmin } from "@/lib/admin";
import { lerConsulta } from "@/lib/rota";
import { consultaDaPrevia } from "@/features/campanhas/schemas";
import { falhou, previaDoFiltro } from "@/features/campanhas/server/campanhas";
import { createServiceClient } from "@/lib/supabase/service";

// Quem entra pelo recorte do passo Contatos (a mesma regra que monta a fila ao
// iniciar): `?busca=todas|<id>&bons=1&sem_site=1&origem=<id>`.
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const lido = lerConsulta(req, consultaDaPrevia, { motivo: true });
    if ("erro" in lido) return lido.erro;
    try {
      return Response.json(await previaDoFiltro(createServiceClient(), lido.dados));
    } catch (e) {
      return falhou("contar quem entra", e);
    }
  },
  { semId: true },
);
