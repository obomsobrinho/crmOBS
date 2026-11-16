import { NextResponse } from "next/server";
import { apagarCliente, rotaDoAdmin } from "@/lib/admin";
import { respostaDoApagar } from "@/lib/admin-conta";
import { createServiceClient } from "@/lib/supabase/service";
import { lerCorpo } from "@/lib/rota";
import { corpoDoApagar } from "@/features/central/schemas";

// Storage em lotes, gateway e o banco de um cliente inteiro: pode demorar.
export const maxDuration = 300;

// POST /api/admin/empresas/[id]/apagar: APAGAR DE VEZ (aba Ações da central do
// dono; docs/adr/2026-10-15-two-step-company-deletion.md). Corpo `{ nome }`: o
// nome do cliente digitado. Só para cliente DESATIVADO. Só o admin, com a sessão
// reconferida no Auth (`revalidar`); qualquer outro recebe 404. A rotina
// (`apagarCliente`, lib/admin.ts) cancela a assinatura, remove os arquivos,
// desconecta o WhatsApp, apaga o banco numa transação com o registro em
// `admin_acoes` (que sobrevive) e os logins que só eram dele; o que não deu para
// fazer volta em `pendencias`. Uma parada depois de efeitos de fora (assinatura cancelada, arquivos
// removidos) volta com eles nas pendências, também no 500 (`falha_banco`); o 500
// genérico abaixo só acontece antes de qualquer efeito.
export const POST = rotaDoAdmin(
  async ({ req, admin, id }) => {
    // O corpo cruza o esquema (`features/central/schemas.ts`), com as frases de antes.
    const lido = await lerCorpo(req, corpoDoApagar, { motivo: true });
    if ("erro" in lido) return lido.erro;
    const corpo = lido.dados;
    try {
      const r = await apagarCliente(createServiceClient(), { admin, id, nome: corpo.nome });
      if (r.resultado === "ok") return NextResponse.json({ ok: true, pendencias: r.pendencias });
      const parada = respostaDoApagar(r.resultado);
      return NextResponse.json(
        { error: parada.texto, resultado: r.resultado, pendencias: r.pendencias },
        { status: parada.status }
      );
    } catch (e) {
      console.error("admin, apagar cliente:", e);
      return NextResponse.json({ error: "falha ao apagar; veja o log do servidor" }, { status: 500 });
    }
  },
  { revalidar: true }
);
