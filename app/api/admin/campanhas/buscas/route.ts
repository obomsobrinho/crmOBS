import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { rotaDoAdmin } from "@/lib/admin";
import { ehSituacaoDaBusca, opcoesDe, paginaDe, textoDe } from "@/lib/campanhas-pedidos";
import { buscasParaEscolher, criarBusca, falhou, paginaDeBuscas, torto } from "@/lib/campanhas-servidor";
import { fonteApify } from "@/lib/fonte-apify";
import { problemasDaBusca } from "@/lib/prospeccao";
import { createServiceClient } from "@/lib/supabase/service";

// GET: a tabela de buscas (10 por página, busca por segmento ou cidade, filtro por
// situação), ou, com `?escolher=1`, as buscas do seletor do assistente.
// POST: "Nova busca": começa a execução na fonte (o fim chega no webhook
// `/api/prospeccao/apify`, com o segredo num header) e grava a linha "buscando".
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const svc = createServiceClient();
    try {
      if (q.get("escolher") === "1") return Response.json(await buscasParaEscolher(svc));
      const pagina = paginaDe(q.get("pagina"));
      const situacao = q.get("situacao");
      if (pagina === null) return torto("página inválida");
      if (situacao !== null && !ehSituacaoDaBusca(situacao)) return torto("situação inválida");
      return Response.json(await paginaDeBuscas(svc, { texto: textoDe(q.get("texto")), situacao, pagina }));
    } catch (e) {
      return falhou("listar as buscas", e);
    }
  },
  { semId: true },
);

export const POST = rotaDoAdmin(
  async ({ req, admin }: { req: NextRequest; admin: string }) => {
    const corpo: unknown = await req.json().catch(() => null);
    const opcoes = opcoesDe(corpo !== null && typeof corpo === "object" ? (corpo as { opcoes?: unknown }).opcoes : null);
    if (!opcoes) return torto("opções da busca inválidas");
    const problemas = problemasDaBusca(opcoes);
    if (problemas.length > 0) return torto(problemas[0]);
    const segredo = process.env.APIFY_WEBHOOK_SECRET;
    if (!process.env.APIFY_TOKEN || !segredo) {
      return Response.json({ error: "A fonte de leads ainda não está configurada no servidor." }, { status: 503 });
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
