import { rotaDoAdmin } from "@/lib/admin";
import { paginaDe, recorteDe } from "@/lib/campanhas-pedidos";
import { cidadesDosLeads, falhou, paginaDeLeads, torto } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// A tabela de leads (toda a base, ou `?busca=`): 10 por página, busca pelo nome
// ou pelos dígitos do telefone, `?cidade=` e os recortes `?filtros=a,b`. Com
// `?cidades=1`, as cidades do escopo (o filtro "Cidade").
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const svc = createServiceClient();
    try {
      const recorte = recorteDe(q);
      if (typeof recorte === "string") return torto(recorte);
      if (q.get("cidades") === "1") return Response.json(await cidadesDosLeads(svc, recorte.buscaId));
      const pagina = paginaDe(q.get("pagina"));
      if (pagina === null) return torto("página inválida");
      return Response.json(await paginaDeLeads(svc, { ...recorte, pagina }));
    } catch (e) {
      return falhou("listar os leads", e);
    }
  },
  { semId: true },
);
