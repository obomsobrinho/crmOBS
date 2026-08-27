import { NextResponse } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

// Resolve o handoff de uma conversa: fecha a pendência E devolve o atendimento
// para a IA. Um gesto, duas escritas, de propósito.
//
// POR QUE ESTA ROTA EXISTE: antes o handoff só era fechado como efeito colateral
// do envio manual (`POST /api/send`). Isso deixava dois casos sem saída: quem
// resolveu por fora (ligou para a pessoa, o pedido perdeu sentido) não tinha como
// fechar, e quem respondeu pelo CRM fechava sem querer, mesmo com o pedido ainda
// pendente. Agora responder é ASSUMIR e resolver é FECHAR.
//
// POR QUE DEVOLVE PARA A IA: se resolver apenas limpasse o handoff e deixasse a
// IA pausada, a gente reconstruiria os 46 contatos travados da OBM, que é
// exatamente o defeito que a pausa como porta de mão única já produziu uma vez.
// Quem quer segurar a conversa não resolve, ou desliga a IA na chave.
//
// POR QUE SERVICE_ROLE: `conversations.handoff_at` não tem grant de UPDATE para
// `authenticated` (migration `mt_conversations_column_grants`), justamente para
// ninguém esconder conversa da fila "Precisa de você" pelo browser. O caminho
// para fechar é este, e fica auditável.
//
// Qualquer MEMBRO do tenant pode resolver, não só o dono: quem atendeu é quem
// sabe que acabou.
export async function POST(req: Request) {
  const client = await getMyClient();
  if (!client) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  // Conta bloqueada fica em modo leitura, e resolver é trabalho.
  if (client.access.blocked) {
    return NextResponse.json({ error: client.access.message }, { status: 402 });
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!phone) {
    return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
  }

  const svc = createServiceClient();

  // O tenant vem SEMPRE da sessão, nunca do corpo: é o que impede resolver
  // conversa de outro tenant mandando um phone qualquer.
  const { error: convErr } = await svc
    .from("conversations")
    .update({ handoff_at: null })
    .eq("client_id", client.id)
    .eq("phone", phone);
  if (convErr) {
    return NextResponse.json(
      { error: "falha ao resolver o handoff", detail: convErr.message },
      { status: 500 }
    );
  }

  // Devolve o atendimento para a IA. Best-effort: se falhar, o handoff já está
  // fechado (que é o que a pessoa pediu) e a chave da IA continua na tela.
  const { error: iaErr } = await svc
    .from("dados_cliente")
    .update({ atendimento_ia: "ativa" })
    .eq("client_id", client.id)
    .eq("telefone", phone);
  if (iaErr) console.error("falha ao devolver o atendimento à IA:", iaErr.message);

  return NextResponse.json({ ok: true, iaReativada: !iaErr });
}
