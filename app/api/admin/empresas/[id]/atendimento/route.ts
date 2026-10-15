import { NextResponse } from "next/server";
import { atendimentoDoCliente, rotaDoAdmin } from "@/lib/admin";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/empresas/[id]/atendimento: a aba "Atendimento" da central do
// dono para UM cliente, com os QUATRO períodos do painel (`lib/periodo.ts`) numa
// resposta só (uma chamada ao banco por função, as quatro janelas em array).
// Só o admin (`ADMIN_USER_IDS`, guarda `rotaDoAdmin`: 404 para outro login, 400
// para id torto). As contas são as do painel (`painel_janelas`, `painel_motivos`)
// mais `painel_series` (respostas por hora ou dia) e `admin_cliente_solucoes`, todas
// service_role.
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const dados = await atendimentoDoCliente(createServiceClient(), id, agoraMs());
    if (!dados) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
    return NextResponse.json(dados);
  } catch (e) {
    console.error("admin, atendimento do cliente:", e);
    return NextResponse.json({ error: "falha ao ler o atendimento" }, { status: 500 });
  }
});
