import { rotaDoAdmin } from "@/lib/admin";
import { erroDaRota, lerCorpo } from "@/lib/rota";
import { corpoDoRascunho } from "@/features/campanhas/schemas";
import { apagarCampanha, campanhaAberta, falhou, salvarRascunho } from "@/features/campanhas/server/campanhas";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// GET: a campanha (o topo do detalhe e o assistente) com quantos leads em cada situação.
// PUT: salva o rascunho (cria na primeira vez); 409 quando a campanha já começou.
// DELETE: apaga a campanha (suave); 409 enquanto ela está rodando ou agendada.
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const aberta = await campanhaAberta(createServiceClient(), id, agoraMs());
    return aberta ? Response.json(aberta) : erroDaRota(404, "campanha não encontrada", "nao_encontrado");
  } catch (e) {
    return falhou("abrir a campanha", e);
  }
});

export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const lido = await lerCorpo(req, corpoDoRascunho(id), { motivo: true });
    if ("erro" in lido) return lido.erro;
    const rascunho = lido.dados;
    try {
      const salvaEm = await salvarRascunho(createServiceClient(), admin, rascunho);
      return salvaEm === null
        ? erroDaRota(409, "a campanha já começou e não é mais rascunho", "ja_comecou")
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
