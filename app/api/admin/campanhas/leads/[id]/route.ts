import { rotaDoAdmin } from "@/lib/admin";
import { campoDe, ehId, recorteDe } from "@/lib/campanhas-pedidos";
import { editarTelefone, falhou, marcarLead, paginaDoLead, removerLead, torto } from "@/lib/campanhas-servidor";
import { problemaDoCelular, telefoneDoLead } from "@/lib/prospeccao";
import { createServiceClient } from "@/lib/supabase/service";

// Em que página do recorte (`?busca=&texto=&cidade=&filtros=`) o lead está: o pino
// clicado no mapa leva a tabela até ele. `{ pagina: null }` = fora do recorte.
export const GET = rotaDoAdmin(async ({ req, id }) => {
  const recorte = recorteDe(req.nextUrl.searchParams);
  if (typeof recorte === "string") return torto(recorte);
  try {
    return Response.json({ pagina: await paginaDoLead(createServiceClient(), recorte, id) });
  } catch (e) {
    return falhou("achar a página do lead", e);
  }
});

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

// Põe um celular no lead: `{ telefone }`, com a mesma conferência da tela (`problemaDoCelular`).
export const PATCH = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const corpo: unknown = await req.json().catch(() => null);
    const digitado = campoDe(corpo, "telefone");
    if (typeof digitado !== "string") return torto("telefone inválido");
    const problema = problemaDoCelular(digitado);
    const celular = telefoneDoLead(digitado);
    if (problema || !celular) return torto(problema ?? "telefone inválido");
    try {
      return await editarTelefone(createServiceClient(), admin, id, celular);
    } catch (e) {
      return falhou("editar o lead", e);
    }
  },
  { revalidar: true },
);

// Tira o lead de uma lista (`?busca=`), ou da base inteira (sem `busca`).
export const DELETE = rotaDoAdmin(
  async ({ req, admin, id }) => {
    const busca = req.nextUrl.searchParams.get("busca");
    if (busca !== null && !ehId(busca)) return torto("busca inválida");
    try {
      return await removerLead(createServiceClient(), admin, id, busca);
    } catch (e) {
      return falhou("tirar o lead", e);
    }
  },
  { revalidar: true },
);
