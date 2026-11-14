import { rotaDoAdmin } from "@/lib/admin";
import { lerConsulta } from "@/lib/rota";
import { consultaDosResultados } from "@/features/campanhas/schemas";
import { falhou, resultados } from "@/features/campanhas/server/campanhas";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// O painel de resultados: `?campanha=` (uma, ou todas sem ele) e `?periodo=` (a
// janela que termina hoje e a anterior igual; sem ele, desde o início).
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const lido = lerConsulta(req, consultaDosResultados, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const { campanha, periodo } = lido.dados;
    try {
      return Response.json(await resultados(createServiceClient(), { campanhaId: campanha, periodo }, agoraMs()));
    } catch (e) {
      return falhou("ler os resultados", e);
    }
  },
  { semId: true },
);
