import { rotaDoAdmin } from "@/lib/admin";
import { rascunhoDe } from "@/lib/campanhas-pedidos";
import { apagarCampanha, campanhaAberta, falhou, salvarRascunho, torto } from "@/lib/campanhas-servidor";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// GET: a campanha (o topo do detalhe e o assistente) com quantos leads em cada situação.
// PUT: salva o rascunho (cria na primeira vez); 409 quando a campanha já começou.
// DELETE: apaga a campanha (suave); 409 enquanto ela está rodando ou agendada.
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const aberta = await campanhaAberta(createServiceClient(), id, agoraMs());
    return aberta ? Response.json(aberta) : Response.json({ error: "campanha não encontrada" }, { status: 404 });
  } catch (e) {
    return falhou("abrir a campanha", e);
  }
});

export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const rascunho = rascunhoDe(id, await req.json().catch(() => null));
    if (!rascunho) return torto("rascunho inválido");
    try {
      const salvaEm = await salvarRascunho(createServiceClient(), admin, rascunho);
      return salvaEm === null
        ? Response.json({ error: "a campanha já começou e não é mais rascunho" }, { status: 409 })
        : Response.json({ salvaEm });
    } catch (e) {
      return falhou("salvar o rascunho", e);
    }
  },
  { revalidar: true },
);

export const DELETE = rotaDoAdmin(
  async ({ admin, id }) => {
    try {
      return await apagarCampanha(createServiceClient(), admin, id);
    } catch (e) {
      return falhou("apagar a campanha", e);
    }
  },
  { revalidar: true },
);
