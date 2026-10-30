import { rotaDoAdmin } from "@/lib/admin";
import { ehSituacaoNaCampanha, falhou, leadsDaCampanha, paginaDe, textoDe, torto } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// Os leads de uma campanha (o detalhe): 10 por página, na ordem da fila, busca pelo nome e `?situacao=`.
export const GET = rotaDoAdmin(async ({ req, id }) => {
  const q = req.nextUrl.searchParams;
  const pagina = paginaDe(q.get("pagina"));
  const situacao = q.get("situacao");
  if (pagina === null) return torto("página inválida");
  if (situacao !== null && !ehSituacaoNaCampanha(situacao)) return torto("situação inválida");
  try {
    return Response.json(await leadsDaCampanha(createServiceClient(), id, { texto: textoDe(q.get("texto")), situacao, pagina }));
  } catch (e) {
    return falhou("listar os leads da campanha", e);
  }
});
