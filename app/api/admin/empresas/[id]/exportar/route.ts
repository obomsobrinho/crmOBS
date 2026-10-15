import { NextResponse } from "next/server";
import { exportacaoDoCliente, rotaDoAdmin } from "@/lib/admin";
import { nomeDoArquivo } from "@/lib/admin-purga";
import { diaIsoSP } from "@/lib/fuso";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";
import { fluxoDe, zipEmPartes } from "@/lib/zip";

// A exportação de um cliente grande lê muitos lotes: o tempo da função sobe.
export const maxDuration = 300;

// GET /api/admin/empresas/[id]/exportar: a exportação LGPD de um cliente (aba
// Ações da central do dono, antes do "Apagar de vez"; decisão do dono: um ZIP com
// UM CSV POR TABELA). Só o admin, com a sessão reconferida no Auth (`revalidar`:
// é a leitura de tudo do cliente, e deixa rastro em `admin_acoes`). O ZIP sai em
// fluxo (lib/zip.ts), lido em lotes pelo servidor (memória limitada).
export const GET = rotaDoAdmin(
  async ({ admin, id }) => {
    try {
      const exp = await exportacaoDoCliente(createServiceClient(), admin, id);
      if (!exp) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
      const agora = agoraMs();
      const arquivo = `${nomeDoArquivo(exp.nome)}-${diaIsoSP(agora)}.zip`;
      return new Response(fluxoDe(zipEmPartes(exp.arquivos, new Date(agora))), {
        headers: {
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="${arquivo}"`,
          "cache-control": "no-store",
        },
      });
    } catch (e) {
      console.error("admin, exportação:", e);
      return NextResponse.json({ error: "falha ao exportar" }, { status: 500 });
    }
  },
  { revalidar: true }
);
