import type { NextRequest } from "next/server";
import { rotaDoAdmin } from "@/lib/admin";
import { falhouComMotivo, torto } from "@/lib/campanhas-servidor";
import { MAXIMO_DO_ARQUIVO_BYTES } from "@/lib/planilha-de-leads";
import { gravarPlanilha, lerPlanilha, situacaoNaBase } from "@/lib/planilha-servidor";
import { createServiceClient } from "@/lib/supabase/service";

// IMPORTAR UMA PLANILHA (.xlsx) de contatos numa campanha (dono, 02/11/2026). O
// mesmo arquivo vem duas vezes: sem `confirmar`, a prévia (as colunas achadas, os
// válidos e os inválidos, quantos já estão na base, quem pediu para sair e a
// amostra "como ficou"), sem gravar nada; com `confirmar=1`, grava como uma busca
// de fonte "planilha" (`gravarPlanilha`, com a linha em admin_acoes) e devolve o
// id, que a campanha passa a usar.
export const POST = rotaDoAdmin(
  async ({ req, admin }: { req: NextRequest; admin: string }) => {
    const form = await req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) return torto("falta o arquivo");
    if (arquivo.size > MAXIMO_DO_ARQUIVO_BYTES) return torto("O arquivo passa de 4 MB. Divida a planilha em partes.");
    if (!/\.xlsx$/i.test(arquivo.name)) return torto("Envie uma planilha do Excel (.xlsx).");
    const confirmar = form?.get("confirmar") === "1";
    const nome = String(form?.get("nome") ?? "").trim().slice(0, 80) || `Planilha ${arquivo.name}`.slice(0, 80);
    try {
      const lida = await lerPlanilha(await arquivo.arrayBuffer());
      if (!lida.ok) return torto(lida.erro);
      if (lida.leitura.validas.length === 0) return torto("Nenhum celular válido na planilha.");
      const svc = createServiceClient();
      if (!confirmar) {
        const base = await situacaoNaBase(svc, lida.leitura.validas.map((v) => v.telefone));
        return Response.json({ ...lida.previaSemBase, ...base });
      }
      return Response.json({ buscaId: await gravarPlanilha(svc, { admin, nome, leitura: lida.leitura }) });
    } catch (e) {
      return falhouComMotivo(confirmar ? "importar a planilha" : "ler a planilha", e);
    }
  },
  { revalidar: true, semId: true },
);
