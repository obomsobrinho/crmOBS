import { NextResponse } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { LIMITS } from "@/lib/agent-prompt";

// ORIENTAÇÃO PENDENTE DA IA (a pílula "Orientar a IA" sem pedido aberto, e o
// "Cancelar orientação"). A IA consome o texto uma vez, na próxima mensagem do
// cliente (`processTurn`), e segue sozinha.
//
// POR QUE ESTA ROTA EXISTE (R-40, 01/10/2026): `pending_instruction*` era
// escrita direto do browser, por grant de coluna. Só que o texto entra no system
// prompt como orientação CONFIÁVEL do time, e grant não separa quem pode: o
// papel de banco é o mesmo para qualquer membro, e nada validava o conteúdo nem
// o tamanho. Agora o browser não escreve mais nenhuma das três colunas
// (a migration revoga o grant); quem escreve é esta rota, com service_role
// depois de conferir sessão e tenant.
//
// Qualquer MEMBRO do tenant orienta, como no Resolvido e no `orientar`: quem
// atendeu é quem sabe o que a IA deve dizer.
//
// POST grava a orientação; DELETE cancela. O tenant vem da sessão, nunca do corpo.

/** Corpo comum: o telefone da conversa (e, no POST, o texto). */
async function lerCorpo(
  req: Request
): Promise<{ phone: string; instruction: string } | NextResponse> {
  let body: { phone?: unknown; instruction?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  return {
    phone: typeof body.phone === "string" ? body.phone.trim() : "",
    instruction: typeof body.instruction === "string" ? body.instruction.trim() : "",
  };
}

export async function POST(req: Request) {
  // Gravar orientação é trabalho: conta bloqueada fica em modo leitura.
  const r = await sessaoDaRota({ ativa: true });
  if ("erro" in r) return r.erro;
  const client = r.mine;

  const corpo = await lerCorpo(req);
  if (corpo instanceof NextResponse) return corpo;
  const { phone, instruction } = corpo;
  if (!phone || !instruction) {
    return NextResponse.json(
      { error: "phone e instruction são obrigatórios" },
      { status: 400 }
    );
  }
  // O teto é o do texto livre que a base já aceita no prompt (`details`).
  if (instruction.length > LIMITS.details) {
    return NextResponse.json(
      { error: `a orientação passa de ${LIMITS.details} caracteres` },
      { status: 400 }
    );
  }

  const { data, error } = await createServiceClient()
    .from("conversations")
    .update({
      pending_instruction: instruction,
      pending_instruction_at: new Date().toISOString(),
      pending_instruction_by: client.userId,
    })
    .eq("client_id", client.id)
    .eq("phone", phone)
    .select("phone");
  if (error) {
    return NextResponse.json(
      { error: "falha ao guardar a orientação", detail: error.message },
      { status: 500 }
    );
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  // Cancelar não é trabalho novo: fica aberto mesmo em modo leitura.
  const r = await sessaoDaRota();
  if ("erro" in r) return r.erro;
  const client = r.mine;

  const corpo = await lerCorpo(req);
  if (corpo instanceof NextResponse) return corpo;
  if (!corpo.phone) {
    return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
  }

  const { error } = await createServiceClient()
    .from("conversations")
    .update({
      pending_instruction: null,
      pending_instruction_at: null,
      pending_instruction_by: null,
    })
    .eq("client_id", client.id)
    .eq("phone", corpo.phone);
  if (error) {
    return NextResponse.json(
      { error: "falha ao cancelar a orientação", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
