import { NextResponse } from "next/server";
import { empresaEFinanceiro, mudarConta, rotaDoAdmin } from "@/lib/admin";
import { pedidoDeAcao, respostaDoSql } from "@/lib/admin-conta";
import { AGENT_MODEL } from "@/lib/agent";
import { agoraMs } from "@/lib/periodo";
import { createServiceClient } from "@/lib/supabase/service";

// PUT /api/admin/empresas/[id]/conta: uma ação da central do dono sobre a conta
// de um cliente (docs/plano-central-clientes.md, entrega 2). Corpo
// `{ acao, dias?, plano? }`, ações em `ACOES_DA_CONTA` (lib/admin-conta.ts):
// aba Financeiro (vitalicio, remover_vitalicio, estender_teste, mudar_plano,
// bloquear, liberar) e aba Ações (desativar, reativar). Só o admin, com a sessão
// reconferida no Auth (`revalidar`); qualquer outro recebe 404.
//
// UMA chamada, UMA transação (`admin_mudar_conta`): trava a linha, confere, grava
// e registra em `admin_acoes`. A resposta traz o cliente RELIDO pela mesma leitura
// do detalhe (`empresaEFinanceiro`), para a tela trocar o que mostra sem recontar
// nada. Se a releitura falhar DEPOIS de gravar, a resposta é sucesso com
// `recarregue: true` (a mudança está gravada; só a tela ficou velha).
export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const pedido = pedidoDeAcao(corpo);
    if ("erro" in pedido) return NextResponse.json({ error: pedido.erro }, { status: 400 });

    const svc = createServiceClient();
    let resultado: string;
    try {
      resultado = await mudarConta(svc, admin, id, pedido);
    } catch (e) {
      console.error("admin, ação na conta:", e);
      return NextResponse.json({ error: "falha ao gravar; nada foi mudado" }, { status: 500 });
    }
    const r = respostaDoSql(resultado);
    if (r.status !== 200) return NextResponse.json({ error: r.texto, resultado }, { status: r.status });
    try {
      const relido = await empresaEFinanceiro(svc, id, agoraMs(), AGENT_MODEL);
      if (relido) return NextResponse.json({ ok: true, resultado, ...relido });
    } catch (e) {
      console.error("admin, releitura depois da ação na conta:", e);
    }
    return NextResponse.json({ ok: true, resultado, recarregue: true });
  },
  { revalidar: true }
);
