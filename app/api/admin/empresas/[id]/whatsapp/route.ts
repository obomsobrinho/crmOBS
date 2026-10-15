import { NextResponse } from "next/server";
import { rotaDoAdmin, whatsappDoCliente } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/empresas/[id]/whatsapp: o estado AO VIVO do WhatsApp de UM
// cliente (a Evolution responde), para a "Visão geral" da central do dono. Só o
// admin (`ADMIN_USER_IDS`, guarda `rotaDoAdmin`: 404 para outro login, 400 para
// id torto). É chamada pelo NAVEGADOR depois da página abrir: nunca pela lista
// (uma chamada à Evolution por linha) e nunca por um Server Component. Falha da
// Evolution vira `desconhecido`.
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const estado = await whatsappDoCliente(createServiceClient(), id);
    if (!estado) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
    return NextResponse.json({ estado });
  } catch (e) {
    console.error("admin, whatsapp do cliente:", e);
    return NextResponse.json({ error: "falha ao ler o estado do WhatsApp" }, { status: 500 });
  }
});
