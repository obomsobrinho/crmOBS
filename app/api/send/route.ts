import { NextResponse } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

// Fecha o handoff aberto pela IA (conversations.handoff_at). Best-effort e
// NUNCA lança: a mensagem já saiu, e falhar aqui não pode virar erro para quem
// só quis responder. Vai por service_role porque handoff_at não tem grant de
// UPDATE para o browser (quem abre é o /api/agent, quem fecha é esta rota).
async function clearHandoff(clientId: string, phone: string): Promise<void> {
  try {
    const svc = createServiceClient();
    const { error } = await svc
      .from("conversations")
      .update({ handoff_at: null })
      .eq("client_id", clientId)
      .eq("phone", phone)
      .not("handoff_at", "is", null);
    if (error) console.error("falha ao fechar o handoff:", error.message);
  } catch (e) {
    console.error("falha ao fechar o handoff:", e);
  }
}

// Recebe { phone, text } do composer e repassa para o webhook do n8n.
// NÃO grava nada no banco — quem grava a mensagem 'out' é o n8n, depois de
// confirmar o envio pela Evolution. A URL do webhook fica só no server.
// Multi-tenant: anexa a `instance` do tenant logado para o n8n rotear o envio
// pela instância Evolution correta.
export async function POST(req: Request) {
  const webhookUrl = process.env.N8N_SEND_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_SEND_WEBHOOK_URL não configurado" },
      { status: 500 }
    );
  }

  const client = await getMyClient();
  if (!client) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  // Gate de assinatura no servidor: conta bloqueada não manda mensagem. O layout
  // do app já barra as telas, mas a rota checa por conta própria (é ela que faz
  // o trabalho, e esconder botão no client não é bloqueio).
  if (client.access.blocked) {
    return NextResponse.json(
      { error: client.access.message },
      { status: 402 }
    );
  }
  if (!client.evolution_instance) {
    return NextResponse.json(
      { error: "cliente sem instância WhatsApp conectada" },
      { status: 400 }
    );
  }

  let body: {
    phone?: string;
    text?: string;
    media?: { bucket?: string; path?: string; type?: string; mime?: string; filename?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { phone, text, media } = body;
  const hasMedia = !!(media && media.path);
  if (!phone || (!text && !hasMedia)) {
    return NextResponse.json(
      { error: "phone e (text ou media) são obrigatórios" },
      { status: 400 }
    );
  }

  // O bucket whatsapp-media é privado. Para a Evolution baixar o arquivo, o
  // servidor (service_role) gera uma URL assinada de curta duração e manda
  // pronta pro n8n. O n8n NÃO acessa o Storage: só repassa a URL pra Evolution
  // e grava chat_messages.media_url = path (permanente; o CRM re-assina ao exibir).
  let signedUrl: string | null = null;
  if (hasMedia) {
    const bucket = media!.bucket ?? "whatsapp-media";
    const svc = createServiceClient();
    const { data: signed, error: signErr } = await svc.storage
      .from(bucket)
      .createSignedUrl(media!.path!, 3600);
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { error: "falha ao preparar a mídia para envio" },
        { status: 500 }
      );
    }
    signedUrl = signed.signedUrl;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        // text vira legenda quando há mídia; senão, mensagem de texto normal.
        text: text ?? "",
        instance: client.evolution_instance,
        client_id: client.id,
        // Quando presente, o n8n manda a mídia pela Evolution usando `url`
        // (assinada) e grava chat_messages.media_url = `path` (permanente).
        media: hasMedia
          ? {
              bucket: media!.bucket ?? "whatsapp-media",
              path: media!.path,
              url: signedUrl,
              type: media!.type ?? "document",
              mime: media!.mime ?? null,
              filename: media!.filename ?? null,
            }
          : null,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `n8n respondeu ${res.status}` },
        { status: 502 }
      );
    }
    // Um humano respondeu, então o handoff que a IA abriu está atendido: limpa
    // conversations.handoff_at para a conversa sair de "Precisa de você". É este
    // o gesto que fecha o handoff, e não a chave da IA: responder pelo CRM não
    // quer dizer que o dono queira a IA desligada dali pra frente.
    await clearHandoff(client.id, phone);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "falha ao contatar o n8n" },
      { status: 502 }
    );
  }
}
