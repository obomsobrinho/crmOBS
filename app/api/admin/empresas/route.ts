import { NextResponse } from "next/server";
import { paginaDeClientes, rotaDoAdmin } from "@/lib/admin";
import { ehUuid } from "@/lib/admin-acesso";
import { ehFiltroDeSituacao } from "@/lib/admin-alertas";
import { AGENT_MODEL } from "@/lib/agent";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/empresas: uma página da lista de Clientes da central do dono
// (P1 item 6; docs/plano-central-clientes.md). Só o admin (`ADMIN_USER_IDS`,
// guarda `rotaDoAdmin`); qualquer outro recebe 404, como a página. Lê com
// service_role, no servidor; o navegador nunca vê a chave.
// Parâmetros: `busca` (nome), `situacao` (filtro; valor desconhecido é 400),
// `depoisNome` + `depoisId` (cursor), `n` (o SQL limita de 1 a 50). Cursor torto
// é 400, nunca 500.
//
// Não usa `sessaoDaRota` de propósito: o admin não age como membro de um tenant
// (ele enxerga todos), e a regra dele é a lista do servidor
// (.claude/rules/admin.md).
export const GET = rotaDoAdmin(
  async ({ req }) => {
    const q = req.nextUrl.searchParams;
    const depoisNome = q.get("depoisNome");
    const depoisId = q.get("depoisId");
    if (depoisId != null && !ehUuid(depoisId)) {
      return NextResponse.json({ error: "cursor inválido" }, { status: 400 });
    }
    const situacao = q.get("situacao");
    if (situacao != null && !ehFiltroDeSituacao(situacao)) {
      return NextResponse.json({ error: "situação inválida" }, { status: 400 });
    }
    const n = Number(q.get("n"));
    try {
      const itens = await paginaDeClientes(createServiceClient(), {
        agora: agoraMs(),
        busca: (q.get("busca") ?? "").slice(0, 100),
        depois: depoisNome != null && depoisId ? { nome: depoisNome, id: depoisId } : null,
        // Só valida o tipo (inteiro do Postgres); o tamanho quem limita é o SQL.
        n: Number.isInteger(n) && n > 0 && n < 2 ** 31 ? n : undefined,
        modelo: AGENT_MODEL,
        situacao,
      });
      return NextResponse.json({ itens });
    } catch (e) {
      console.error("admin, clientes:", e);
      return NextResponse.json({ error: "falha ao listar os clientes" }, { status: 500 });
    }
  },
  { semId: true }
);
