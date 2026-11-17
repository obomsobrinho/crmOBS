import { NextResponse } from "next/server";
import { paginaDeClientes, rotaDoAdmin } from "@/lib/admin";
import { ehFiltroDeSituacao } from "@/lib/admin-alertas";
import { AGENT_MODEL } from "@/lib/agent";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";
import { lerConsulta } from "@/lib/rota";
import { consultaDaLista } from "@/features/central/schemas";

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
    // A consulta cruza o esquema (`features/central/schemas.ts`), com as frases de antes.
    const lido = lerConsulta(req, consultaDaLista, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const q = lido.dados;
    const depoisNome = q.depoisNome ?? null;
    const depoisId = q.depoisId ?? null;
    const situacao = q.situacao && ehFiltroDeSituacao(q.situacao) ? q.situacao : null;
    const n = Number(q.n ?? null);
    try {
      const itens = await paginaDeClientes(createServiceClient(), {
        agora: agoraMs(),
        busca: (q.busca ?? "").slice(0, 100),
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
