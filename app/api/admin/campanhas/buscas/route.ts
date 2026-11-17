import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { rotaDoAdmin } from "@/lib/admin";
import { erroDaRota, lerConsulta, lerCorpo } from "@/lib/rota";
import { consultaDasBuscas, corpoDaNovaBusca } from "@/features/campanhas/schemas";
import { buscasParaEscolher, criarBusca, falhou, paginaDeBuscas } from "@/features/campanhas/server/campanhas";
import { fonteApify } from "@/features/campanhas/server/apify";
import { createServiceClient } from "@/lib/supabase/service";
import { envDoServidor } from "@/lib/env";

// GET: a tabela de buscas (10 por página, busca por segmento ou cidade, filtro por
// situação), ou, com `?escolher=1`, as buscas do seletor do assistente.
// POST: "Nova busca": começa a execução na fonte (o fim chega no webhook
// `/api/prospeccao/apify`, com o segredo num header) e grava a linha "buscando".
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const lido = lerConsulta(req, consultaDasBuscas, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const { escolher, texto, situacao, pagina } = lido.dados;
    const svc = createServiceClient();
    try {
      if (escolher === "1") return Response.json(await buscasParaEscolher(svc));
      return Response.json(await paginaDeBuscas(svc, { texto, situacao, pagina }));
    } catch (e) {
      return falhou("listar as buscas", e);
    }
  },
  { semId: true },
);

export const POST = rotaDoAdmin(
  async ({ req, admin }: { req: NextRequest; admin: string }) => {
    const lido = await lerCorpo(req, corpoDaNovaBusca, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const opcoes = lido.dados;
    const segredo = envDoServidor("APIFY_WEBHOOK_SECRET");
    if (!envDoServidor("APIFY_TOKEN") || !segredo) {
      return erroDaRota(503, "A fonte de leads ainda não está configurada no servidor.", "sem_configuracao");
    }
    const id = randomUUID();
    const url = `${req.nextUrl.origin}/api/prospeccao/apify?busca=${id}`;
    try {
      const inicio = await fonteApify.iniciar(opcoes, { url, segredo });
      await criarBusca(createServiceClient(), { admin, id, opcoes, fonte: inicio.fonte, execucao: inicio.execucaoId });
      return Response.json({ id });
    } catch (e) {
      return falhou("começar a busca na fonte", e);
    }
  },
  { revalidar: true, semId: true },
);
