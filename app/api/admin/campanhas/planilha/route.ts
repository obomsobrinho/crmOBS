import type { NextRequest } from "next/server";
import { rotaDoAdmin } from "@/lib/admin";
import { falhouComMotivo, torto } from "@/features/campanhas/server/campanhas";
import { lerFormulario } from "@/lib/rota";
import { formularioDaPlanilha } from "@/features/campanhas/schemas";
import { gravarPlanilha, lerPlanilha, situacaoNaBase } from "@/features/campanhas/server/planilha";
import { createServiceClient } from "@/lib/supabase/service";

// IMPORTAR UMA PLANILHA (.xlsx) de contatos numa campanha (dono, 02/11/2026). O
// mesmo arquivo vem duas vezes: sem `confirmar`, a prévia (as colunas achadas, os
// válidos e os inválidos, quantos já estão na base, quem pediu para sair e a
// amostra "como ficou"), sem gravar nada; com `confirmar=1`, grava como uma busca
// de fonte "planilha" (`gravarPlanilha`, com a linha em admin_acoes) e devolve o
// id, que a campanha passa a usar.
export const POST = rotaDoAdmin(
  async ({ req, admin }: { req: NextRequest; admin: string }) => {
    const lido = await lerFormulario(req, formularioDaPlanilha, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const { arquivo, confirmar, nome } = lido.dados;
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
