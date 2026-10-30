import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { rotaDoAdmin } from "@/lib/admin";
import { criarBuscaNoBanco, linhaParaBusca } from "@/lib/campanhas-servidor";
import { fonteApify } from "@/lib/fonte-apify";
import { problemasDaBusca, type OpcoesDaBusca } from "@/lib/prospeccao";
import { createServiceClient } from "@/lib/supabase/service";

export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const offset = Math.max(0, Number(q.get("offset") ?? 0) || 0);
    const limite = Math.min(50, Math.max(1, Number(q.get("n") ?? 10) || 10));
    const texto = (q.get("busca") ?? "").trim() || null;
    const status = q.get("status");
    const svc = createServiceClient();
    const { data, error } = await svc.rpc("prospeccao_buscas_pagina", {
      p_texto: texto,
      p_status: status,
      p_offset: offset,
      p_limite: limite,
    });
    if (error) {
      console.error("campanhas buscas:", error.message);
      return NextResponse.json({ error: "falha ao listar as buscas" }, { status: 500 });
    }
    const linhas = data ?? [];
    const total = linhas[0]?.total_geral ?? 0;
    const itens = linhas.map((r) => ({
      ...linhaParaBusca({
        id: r.id,
        termo: r.termo,
        cidade: r.cidade,
        status: r.status,
        opcoes: r.opcoes,
        erro: r.erro,
        criada_em: r.criada_em,
      }),
      total: r.achadas,
      comCelular: r.com_celular,
      bons: r.bons,
      contatados: r.contatados,
      responderam: r.responderam,
    }));
    return NextResponse.json({ itens, total, offset, limite });
  },
  { semId: true },
);

const postBusca = async ({ req, admin }: { req: NextRequest; admin: string }) => {
    let corpo: { opcoes?: OpcoesDaBusca };
    try {
      corpo = (await req.json()) as { opcoes?: OpcoesDaBusca };
    } catch {
      return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
    }
    const opcoes = corpo.opcoes;
    if (!opcoes) return NextResponse.json({ error: "faltam opções" }, { status: 400 });
    const probs = problemasDaBusca(opcoes);
    if (probs.length) return NextResponse.json({ error: probs[0] }, { status: 400 });
    if (!process.env.APIFY_TOKEN) {
      return NextResponse.json({ error: "APIFY_TOKEN não configurado (configure na Vercel e reinicie o dev)" }, { status: 503 });
    }
    const id = randomUUID();
    const termo = opcoes.termos.join(", ");
    const secret = process.env.APIFY_WEBHOOK_SECRET ?? "";
    const origin = req.nextUrl.origin;
    const webhookUrl = `${origin}/api/prospeccao/apify?busca=${id}${secret ? `&s=${encodeURIComponent(secret)}` : ""}`;
    try {
      const inicio = await fonteApify.iniciar(id, opcoes, webhookUrl);
      const svc = createServiceClient();
      await criarBuscaNoBanco(svc, {
        quem: admin,
        id,
        termo,
        cidade: opcoes.cidade,
        uf: opcoes.uf,
        fonte: inicio.fonte,
        execucao: inicio.execucaoId,
        opcoes,
      });
      return NextResponse.json({ id, execucaoId: inicio.execucaoId });
    } catch (e) {
      console.error("campanhas nova busca:", e);
      return NextResponse.json({ error: "falha ao iniciar a busca na fonte" }, { status: 502 });
    }
};

export const POST = rotaDoAdmin(postBusca, { revalidar: true, semId: true });
