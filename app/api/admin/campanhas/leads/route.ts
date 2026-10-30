import { rotaDoAdmin } from "@/lib/admin";
import { cidadesDosLeads, ehFiltroDosLeads, ehId, falhou, paginaDe, paginaDeLeads, textoDe, torto } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// A tabela de leads (toda a base, ou `?busca=`): 10 por página, busca pelo nome
// ou pelos dígitos do telefone, `?cidade=` e os recortes `?filtros=a,b`. Com
// `?cidades=1`, as cidades do escopo (o filtro "Cidade").
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const busca = q.get("busca");
    if (busca !== null && !ehId(busca)) return torto("busca inválida");
    const svc = createServiceClient();
    try {
      if (q.get("cidades") === "1") return Response.json(await cidadesDosLeads(svc, busca));
      const pagina = paginaDe(q.get("pagina"));
      const filtros = (q.get("filtros") ?? "").split(",").filter(Boolean);
      if (pagina === null) return torto("página inválida");
      if (!filtros.every(ehFiltroDosLeads)) return torto("filtro inválido");
      const cidade = q.get("cidade");
      return Response.json(
        await paginaDeLeads(svc, { buscaId: busca, texto: textoDe(q.get("texto")), cidade: cidade ? cidade.slice(0, 120) : null, filtros, pagina }),
      );
    } catch (e) {
      return falhou("listar os leads", e);
    }
  },
  { semId: true },
);
