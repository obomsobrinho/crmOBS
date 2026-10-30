import { rotaDoAdmin } from "@/lib/admin";
import { campoDe } from "@/lib/campanhas-pedidos";
import { falhou, marcarLead, torto } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// Marca o lead: `{ marcacao: "bom" | "descartado" | null }` (uma função SQL, com a linha em admin_acoes).
export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const corpo: unknown = await req.json().catch(() => null);
    const marcacao = campoDe(corpo, "marcacao");
    if (marcacao !== null && marcacao !== "bom" && marcacao !== "descartado") return torto("marcação inválida");
    try {
      const r = await marcarLead(createServiceClient(), admin, id, marcacao);
      return r ? Response.json(r) : Response.json({ error: "lead não encontrado" }, { status: 404 });
    } catch (e) {
      return falhou("marcar o lead", e);
    }
  },
  { revalidar: true },
);
