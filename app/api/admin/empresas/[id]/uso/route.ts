import { NextResponse } from "next/server";
import { rotaDoAdmin, usoDoCliente } from "@/lib/admin";
import { usoParaTela } from "@/lib/admin-cliente";
import { AGENT_MODEL } from "@/lib/agent";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/empresas/[id]/uso: o uso de IA de UM cliente para a aba "Uso de
// IA" da central do dono: os QUATRO períodos do painel (Dia por hora, os outros
// por dia, com o total de cada um) e a grade de dia da semana x hora (30 dias). Só o admin (`ADMIN_USER_IDS`, guarda
// `rotaDoAdmin`: 404 para outro login, 400 para id torto). O agregado é do banco
// (`admin_cliente_uso` e `admin_cliente_uso_horas`, service_role, janela limitada); as somas e o custo
// estimado saem de `lib/admin-cliente.ts` sobre `lib/custo-ia.ts`.
export const GET = rotaDoAdmin(async ({ id }) => {
  const agora = agoraMs();
  try {
    const bruto = await usoDoCliente(createServiceClient(), id, agora);
    return NextResponse.json(usoParaTela(bruto, agora, AGENT_MODEL));
  } catch (e) {
    console.error("admin, uso de IA do cliente:", e);
    return NextResponse.json({ error: "falha ao ler o uso de IA" }, { status: 500 });
  }
});
