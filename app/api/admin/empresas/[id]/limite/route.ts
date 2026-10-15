import { NextResponse } from "next/server";
import { rotaDoAdmin } from "@/lib/admin";
import { limiteValido } from "@/lib/admin-empresas";
import { agoraMs } from "@/lib/periodo";
import { limiaresDoLimite, limiteDaEmpresa, mesSP } from "@/lib/custo-ia";
import { createServiceClient } from "@/lib/supabase/service";

// PUT /api/admin/empresas/[id]/limite: o admin muda o teto de tokens de IA do
// mês de uma empresa (P1 item 6). Corpo `{ limite: number | null }` (tokens;
// null = voltar ao padrão de lib/custo-ia.ts). Só o admin, com a sessão
// reconferida no Auth (escrita sensível, `rotaDoAdmin` com `revalidar`);
// qualquer outro recebe 404.
//
// UMA chamada, UMA transação (`admin_mudar_limite_ia`): trava a linha da
// empresa, grava o teto, registra em `admin_acoes` (antes e depois) e limpa as
// marcas dos avisos do mês que o teto novo deixou para trás (o aviso volta a
// sair se o uso cruzar de novo). Os limiares saem de `limiaresDoLimite`, a
// única fonte da regra. Subir o teto acima do uso reativa a IA no próximo
// turno (a checagem lê o teto a cada mensagem).
export const PUT = rotaDoAdmin(
  async ({ req, admin, id }) => {
    let body: { limite?: unknown };
    try {
      body = (await req.json()) as { limite?: unknown };
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const limite = body.limite;
    if (!limiteValido(limite)) {
      return NextResponse.json(
        { error: "limite inválido: um número inteiro de tokens maior que zero, ou null para o padrão" },
        { status: 400 }
      );
    }

    const limiares = limiaresDoLimite(limiteDaEmpresa(limite));
    const { data, error } = await createServiceClient().rpc("admin_mudar_limite_ia", {
      p_quem: admin,
      p_client: id,
      p_limite: limite,
      p_mes: mesSP(agoraMs()),
      p_limiar_aviso: limiares.aviso,
      p_limiar_parado: limiares.parado,
    });
    if (error) {
      console.error("admin, limite de IA:", error.message);
      return NextResponse.json({ error: "falha ao gravar o limite; nada foi mudado" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, limite });
  },
  { revalidar: true }
);
