import { NextResponse } from "next/server";
import { getMyClient } from "@/lib/auth";

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
  if (!client.evolution_instance) {
    return NextResponse.json(
      { error: "cliente sem instância WhatsApp conectada" },
      { status: 400 }
    );
  }

  let body: { phone?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { phone, text } = body;
  if (!phone || !text) {
    return NextResponse.json(
      { error: "phone e text são obrigatórios" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        text,
        instance: client.evolution_instance,
        client_id: client.id,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `n8n respondeu ${res.status}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "falha ao contatar o n8n" },
      { status: 502 }
    );
  }
}
