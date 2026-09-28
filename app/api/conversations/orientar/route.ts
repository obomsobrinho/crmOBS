import { NextResponse } from "next/server";
import { getMyClient } from "@/lib/auth";
import { processTurn } from "@/lib/agent-turn";
import { fecharPedido } from "@/lib/handoffs";
import { createServiceClient } from "@/lib/supabase/service";

// ORIENTAR UM PEDIDO DE AJUDA É RESOLVÊ-LO, E A IA RESPONDE NA HORA
// (27/09/2026, pedido do dono testando com o chip: "se eu já orientei, esse
// handoff está resolvido"). Antes a orientação ficava em
// `conversations.pending_instruction` esperando o cliente escrever de novo, e o
// pedido só fechava depois disso. Agora, num gesto só:
//
// 1. FECHA o pedido (`handoffs` como `ia`, com a orientação guardada) e a
//    pendência (`handoff_at`), devolve a conversa à IA e larga o responsável,
//    pela mesma regra do Resolvido (IA e pessoa não atendem juntas).
// 2. Roda o cérebro num TURNO DE RETOMADA (`processTurn` com `retomada`), sem
//    mensagem nova do cliente, com a orientação como instrução do operador.
// 3. Manda a resposta pelo n8n (`N8N_IA_SEND_WEBHOOK_URL`, fluxo "CRM Envio IA"),
//    que envia pela Evolution e grava a linha em `chat_messages` como resposta
//    DA IA. ⚠️ Não é o envio manual: aquele grava como `manual` (resposta de
//    gente) e pausa a IA.
//
// Se o passo 2 ou 3 não acontecer (agente desligado, n8n fora, modelo falhou),
// a orientação vai para `pending_instruction` e a IA usa na próxima mensagem do
// cliente, que era o comportamento de antes. O pedido continua fechado: quem
// orientou fez a parte do time. `enviado` diz à tela qual dos dois aconteceu.
//
// Qualquer MEMBRO do tenant orienta, como no Resolvido.
export async function POST(req: Request) {
  const client = await getMyClient();
  if (!client) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  if (client.access.blocked) {
    return NextResponse.json({ error: client.access.message }, { status: 402 });
  }

  let body: { phone?: string; instruction?: string; pedidoId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!phone || !instruction) {
    return NextResponse.json(
      { error: "phone e instruction são obrigatórios" },
      { status: 400 }
    );
  }

  const svc = createServiceClient();
  const agora = new Date().toISOString();

  // 1. Fecha O pedido que a caixa mostrava (o mais antigo da fila, ou o
  // `pedidoId` que veio da tela). O tenant vem da sessão, nunca do corpo.
  let fechado: number | null;
  try {
    fechado = await fecharPedido(svc, {
      clientId: client.id,
      phone,
      id: typeof body.pedidoId === "number" ? body.pedidoId : null,
      como: "ia",
      por: client.userId,
      instrucao: instruction,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "falha ao fechar o pedido", detail: (e as Error).message },
      { status: 500 }
    );
  }
  if (fechado == null) {
    // Sem pedido aberto não há o que resolver (outra aba já resolveu, ou a IA
    // nunca pediu). A orientação sem pedido segue pela pílula da caixa de escrita.
    return NextResponse.json({ error: "nenhum pedido de ajuda aberto" }, { status: 409 });
  }

  const [conv, ia] = await Promise.all([
    svc
      .from("conversations")
      .update({
        assigned_user_id: null,
        pending_instruction: null,
        pending_instruction_at: null,
        pending_instruction_by: null,
      })
      .eq("client_id", client.id)
      .eq("phone", phone),
    svc
      .from("dados_cliente")
      .update({ atendimento_ia: "ativa" })
      .eq("client_id", client.id)
      .eq("telefone", phone),
  ]);
  if (conv.error) console.error("falha ao fechar a pendência:", conv.error.message);
  if (ia.error) console.error("falha ao devolver o atendimento à IA:", ia.error.message);

  // 2 e 3. A IA responde agora. Qualquer falha cai na orientação pendente.
  const enviado = await responderAgora(client.id, client.evolution_instance, phone, instruction);
  if (!enviado.ok) {
    const { error } = await svc
      .from("conversations")
      .update({
        pending_instruction: instruction,
        pending_instruction_at: agora,
        pending_instruction_by: client.userId,
      })
      .eq("client_id", client.id)
      .eq("phone", phone);
    if (error) console.error("falha ao guardar a orientação pendente:", error.message);
    return NextResponse.json({ ok: true, enviado: false, motivo: enviado.motivo });
  }
  return NextResponse.json({ ok: true, enviado: true });
}

async function responderAgora(
  clientId: string,
  instance: string | null,
  phone: string,
  instruction: string
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const webhookUrl = process.env.N8N_IA_SEND_WEBHOOK_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!webhookUrl) return { ok: false, motivo: "envio_nao_configurado" };
  if (!apiKey) return { ok: false, motivo: "modelo_nao_configurado" };
  if (!instance) return { ok: false, motivo: "sem_whatsapp" };

  let messages: string[];
  try {
    const { output } = await processTurn({
      clientId,
      phone,
      message: "",
      apiKey,
      retomada: { instruction },
    });
    messages = output.messages;
  } catch (e) {
    console.error("falha no turno de retomada:", e);
    return { ok: false, motivo: "modelo_falhou" };
  }
  // Turno silencioso: agente desligado ou conta bloqueada.
  if (messages.length === 0) return { ok: false, motivo: "agente_desligado" };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, instance, client_id: clientId, messages }),
    });
    if (!res.ok) return { ok: false, motivo: `n8n_${res.status}` };
  } catch {
    return { ok: false, motivo: "n8n_fora" };
  }
  return { ok: true };
}
