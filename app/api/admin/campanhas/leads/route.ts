import { rotaDoAdmin } from "@/lib/admin";
import { lerConsulta } from "@/lib/rota";
import { consultaDosLeads } from "@/features/campanhas/schemas";
import { categoriasDoRecorte, cidadesDosLeads, falhou, paginaDeLeads, torto } from "@/features/campanhas/server/campanhas";
import { createServiceClient } from "@/lib/supabase/service";

// A tabela de leads (toda a base, ou `?busca=`): 10 por página, busca pelo nome
// ou pelos dígitos do telefone, `?cidade=`, os recortes `?filtros=a,b` e os filtros
// `?site=&nota=&avaliacoes=&categorias=` (`recorteDe`). Com `?cidades=1`, as cidades
// do escopo (o filtro "Cidade"); com `?categoriasDoRecorte=1`, as categorias que
// vieram nos leads do escopo, com a contagem (o filtro "Categoria").
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const lido = lerConsulta(req, consultaDosLeads, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const { recorte, cidades, categorias, pagina } = lido.dados;
    const svc = createServiceClient();
    try {
      if (cidades) return Response.json(await cidadesDosLeads(svc, recorte.buscaId));
      if (categorias) return Response.json(await categoriasDoRecorte(svc, recorte.buscaId));
      if (pagina === null) return torto("página inválida");
      return Response.json(await paginaDeLeads(svc, { ...recorte, pagina }));
    } catch (e) {
      return falhou("listar os leads", e);
    }
  },
  { semId: true },
);
