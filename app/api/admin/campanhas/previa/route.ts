import { rotaDoAdmin } from "@/lib/admin";
import { filtroDe } from "@/lib/campanhas-pedidos";
import { falhou, previaDoFiltro, torto } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// Quem entra pelo recorte do passo Contatos (a mesma regra que monta a fila ao
// iniciar): `?busca=todas|<id>&bons=1&sem_site=1&origem=<id>`.
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const filtro = filtroDe({
      buscaId: q.get("busca") ?? "todas",
      soMarcadosComoBons: q.get("bons") === "1",
      soSemSiteProprio: q.get("sem_site") === "1",
      quemNaoRespondeuDe: q.get("origem"),
    });
    if (!filtro) return torto("recorte inválido");
    try {
      return Response.json(await previaDoFiltro(createServiceClient(), filtro));
    } catch (e) {
      return falhou("contar quem entra", e);
    }
  },
  { semId: true },
);
