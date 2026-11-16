import { NextResponse } from "next/server";
import { pedidosDoCliente, rotaDoAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { lerConsulta } from "@/lib/rota";
import { consultaDosPedidos } from "@/features/central/schemas";

// GET /api/admin/empresas/[id]/pedidos?em=&id=: a página seguinte do bloco "Pedidos em aberto"
// do detalhe de um cliente (a primeira vem com a página). Só o admin (guarda `rotaDoAdmin`).
// Todos os pedidos abertos, do mais antigo ao mais novo, sem período. Só leitura.
export const GET = rotaDoAdmin(async ({ req, id }) => {
  // A consulta cruza o esquema (`features/central/schemas.ts`, sobre `cursorDaConsulta`).
  const lido = lerConsulta(req, consultaDosPedidos, { motivo: true });
  if ("erro" in lido) return lido.erro;
  const depois = lido.dados;
  const pedidos = await pedidosDoCliente(createServiceClient(), id, depois);
  if (!pedidos) return NextResponse.json({ error: "não deu para ler os pedidos agora" }, { status: 500 });
  return NextResponse.json({ pedidos });
});
