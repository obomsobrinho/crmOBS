import { rotaDoAdmin } from "@/lib/admin";
import { rascunhoDe } from "@/lib/campanhas-pedidos";
import { campanhaAberta, falhou, salvarRascunho, torto } from "@/lib/campanhas-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// GET: a campanha (o topo do detalhe e o assistente) com quantos leads em cada situação.
// PUT: salva o rascunho (cria na primeira vez); 409 quando a campanha já começou.
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const aberta = await campanhaAberta(createServiceClient(), id);
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
