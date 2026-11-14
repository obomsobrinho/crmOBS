import { rotaDoAdmin } from "@/lib/admin";
import { erroDaRota, lerConsulta, lerCorpo } from "@/lib/rota";
import { consultaDaBusca, corpoDaMarcacao, corpoDoTelefone, recorte } from "@/features/campanhas/schemas";
import { editarTelefone, falhou, marcarLead, paginaDoLead, removerLead } from "@/features/campanhas/server/campanhas";
import { createServiceClient } from "@/lib/supabase/service";

// Em que página do recorte (`?busca=&texto=&cidade=&filtros=`) o lead está: o pino
// clicado no mapa leva a tabela até ele. `{ pagina: null }` = fora do recorte.
export const GET = rotaDoAdmin(async ({ req, id }) => {
  const lido = lerConsulta(req, recorte, { motivo: true });
  if ("erro" in lido) return lido.erro;
  try {
    return Response.json({ pagina: await paginaDoLead(createServiceClient(), lido.dados, id) });
  } catch (e) {
    return falhou("achar a página do lead", e);
  }
});

// Marca o lead: `{ marcacao: "bom" | "descartado" | null }` (uma função SQL, com a linha em admin_acoes).
export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const lido = await lerCorpo(req, corpoDaMarcacao, { motivo: true });
    if ("erro" in lido) return lido.erro;
    try {
      const r = await marcarLead(createServiceClient(), admin, id, lido.dados.marcacao);
      return r ? Response.json(r) : erroDaRota(404, "lead não encontrado", "nao_encontrado");
    } catch (e) {
      return falhou("marcar o lead", e);
    }
  },
  { revalidar: true },
);

// Põe um celular no lead: `{ telefone }`, com a mesma conferência da tela (`problemaDoCelular`).
export const PATCH = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const lido = await lerCorpo(req, corpoDoTelefone, { motivo: true });
    if ("erro" in lido) return lido.erro;
    try {
      return await editarTelefone(createServiceClient(), admin, id, lido.dados);
    } catch (e) {
      return falhou("editar o lead", e);
    }
  },
  { revalidar: true },
);

// Tira o lead de uma lista (`?busca=`), ou da base inteira (sem `busca`).
export const DELETE = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const lido = lerConsulta(req, consultaDaBusca, { motivo: true });
    if ("erro" in lido) return lido.erro;
    try {
      return await removerLead(createServiceClient(), admin, id, lido.dados.busca);
    } catch (e) {
      return falhou("tirar o lead", e);
    }
  },
  { revalidar: true },
);
