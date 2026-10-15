import { NextResponse } from "next/server";
import { cobrancasDoCliente, rotaDoAdmin } from "@/lib/admin";
import { AsaasError } from "@/lib/asaas";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/admin/empresas/[id]/cobrancas: as cobranças da assinatura do cliente no
// Asaas, para a aba Financeiro da central do dono (entrega 2). Só o admin (guarda
// `rotaDoAdmin`). Usa SÓ o helper que já existe (`subscriptionPayments`,
// lib/asaas.ts), que devolve a primeira página do Asaas; sem assinatura,
// `{ cobrancas: null }`. Só leitura: nada muda no gateway.
export const GET = rotaDoAdmin(async ({ id }) => {
  try {
    const cobrancas = await cobrancasDoCliente(createServiceClient(), id);
    if (cobrancas === undefined) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
    return NextResponse.json({ cobrancas });
  } catch (e) {
    console.error("admin, cobranças:", e instanceof Error ? e.message : e);
    const status = e instanceof AsaasError ? 502 : 500;
    return NextResponse.json({ error: "não deu para ler as cobranças no Asaas agora" }, { status });
  }
});
