import { NextResponse } from "next/server";
import { pedidosDoCliente, rotaDoAdmin } from "@/lib/admin";
import { cursorDaConsulta } from "@/lib/admin-pedidos";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/empresas/[id]/pedidos?em=&id=: a página seguinte do bloco "Pedidos em aberto"
// do detalhe de um cliente (a primeira vem com a página). Só o admin (guarda `rotaDoAdmin`).
// Todos os pedidos abertos, do mais antigo ao mais novo, sem período. Só leitura.
export const GET = rotaDoAdmin(async ({ req, id }) => {
  const q = req.nextUrl.searchParams;
  const depois = cursorDaConsulta(q.get("em"), q.get("id"));
  if (depois === "invalido") return NextResponse.json({ error: "cursor inválido" }, { status: 400 });
  const pedidos = await pedidosDoCliente(createServiceClient(), id, depois);
  if (!pedidos) return NextResponse.json({ error: "não deu para ler os pedidos agora" }, { status: 500 });
  return NextResponse.json({ pedidos });
});
