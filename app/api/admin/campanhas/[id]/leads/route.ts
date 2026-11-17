import { rotaDoAdmin } from "@/lib/admin";
import { lerConsulta } from "@/lib/rota";
import { consultaDosLeadsDaCampanha } from "@/features/campanhas/schemas";
import { falhou, leadsDaCampanha } from "@/features/campanhas/server/campanhas";
import { createServiceClient } from "@/lib/supabase/service";

// Os leads de uma campanha (o detalhe): 10 por página, na ordem da fila, busca pelo nome e `?situacao=`.
export const GET = rotaDoAdmin(async ({ req, id }) => {
  const lido = lerConsulta(req, consultaDosLeadsDaCampanha, { motivo: true });
  if ("erro" in lido) return lido.erro;
  try {
    return Response.json(await leadsDaCampanha(createServiceClient(), id, lido.dados));
  } catch (e) {
    return falhou("listar os leads da campanha", e);
  }
});
