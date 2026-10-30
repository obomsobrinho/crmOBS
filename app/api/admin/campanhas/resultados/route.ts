import { rotaDoAdmin } from "@/lib/admin";
import { ehId } from "@/lib/campanhas-pedidos";
import { falhou, resultados, torto } from "@/lib/campanhas-servidor";
import { agoraMs, ehPeriodo } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// O painel de resultados: `?campanha=` (uma, ou todas sem ele) e `?periodo=` (a
// janela que termina hoje e a anterior igual; sem ele, desde o início).
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const campanha = q.get("campanha");
    const periodo = q.get("periodo");
    if (campanha !== null && !ehId(campanha)) return torto("campanha inválida");
    if (periodo !== null && !ehPeriodo(periodo)) return torto("período inválido");
    try {
      return Response.json(await resultados(createServiceClient(), { campanhaId: campanha, periodo }, agoraMs()));
    } catch (e) {
      return falhou("ler os resultados", e);
    }
  },
  { semId: true },
);
