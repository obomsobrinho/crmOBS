import { rotaDoAdmin } from "@/lib/admin";
import { paginaDe, recorteDe } from "@/lib/campanhas-pedidos";
import { categoriasDoRecorte, cidadesDosLeads, falhou, paginaDeLeads, torto } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// A tabela de leads (toda a base, ou `?busca=`): 10 por página, busca pelo nome
// ou pelos dígitos do telefone, `?cidade=`, os recortes `?filtros=a,b` e os filtros
// `?site=&nota=&avaliacoes=&categorias=` (`recorteDe`). Com `?cidades=1`, as cidades
// do escopo (o filtro "Cidade"); com `?categoriasDoRecorte=1`, as categorias que
// vieram nos leads do escopo, com a contagem (o filtro "Categoria").
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const svc = createServiceClient();
    try {
      const recorte = recorteDe(q);
      if (typeof recorte === "string") return torto(recorte);
      if (q.get("cidades") === "1") return Response.json(await cidadesDosLeads(svc, recorte.buscaId));
      if (q.get("categoriasDoRecorte") === "1") return Response.json(await categoriasDoRecorte(svc, recorte.buscaId));
      const pagina = paginaDe(q.get("pagina"));
      if (pagina === null) return torto("página inválida");
      return Response.json(await paginaDeLeads(svc, { ...recorte, pagina }));
    } catch (e) {
      return falhou("listar os leads", e);
    }
  },
  { semId: true },
);
