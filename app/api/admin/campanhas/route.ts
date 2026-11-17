import { rotaDoAdmin } from "@/lib/admin";
import { lerConsulta } from "@/lib/rota";
import { consultaDasCampanhas } from "@/features/campanhas/schemas";
import { campanhasComEnvio, falhou, paginaDeCampanhas } from "@/features/campanhas/server/campanhas";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// A tabela de campanhas (10 por página, busca pelo nome, filtro por situação), ou,
// com `?com_envio=1`, as campanhas que já começaram (o seletor do painel).
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const lido = lerConsulta(req, consultaDasCampanhas, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const { com_envio, texto, situacao, pagina } = lido.dados;
    const svc = createServiceClient();
    try {
      if (com_envio === "1") return Response.json(await campanhasComEnvio(svc));
      return Response.json(await paginaDeCampanhas(svc, { texto, situacao, pagina }, agoraMs()));
    } catch (e) {
      return falhou("listar as campanhas", e);
    }
  },
  { semId: true },
);
