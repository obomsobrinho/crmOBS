import { rotaDoAdmin } from "@/lib/admin";
import { campanhasComEnvio, ehSituacaoDaCampanha, falhou, paginaDe, paginaDeCampanhas, textoDe, torto } from "@/lib/campanhas-servidor";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// A tabela de campanhas (10 por página, busca pelo nome, filtro por situação), ou,
// com `?com_envio=1`, as campanhas que já começaram (o seletor do painel).
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const svc = createServiceClient();
    try {
      if (q.get("com_envio") === "1") return Response.json(await campanhasComEnvio(svc));
      const pagina = paginaDe(q.get("pagina"));
      const situacao = q.get("situacao");
      if (pagina === null) return torto("página inválida");
      if (situacao !== null && !ehSituacaoDaCampanha(situacao)) return torto("situação inválida");
      return Response.json(await paginaDeCampanhas(svc, { texto: textoDe(q.get("texto")), situacao, pagina }, agoraMs()));
    } catch (e) {
      return falhou("listar as campanhas", e);
    }
  },
  { semId: true },
);
