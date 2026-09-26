import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";

// Transcreve o áudio gravado na bancada de teste (26/09/2026). Dono-only, como o
// `/api/playground`.
//
// ⚠️ ESPELHA O WHATSAPP DE VERDADE, e é por isso que existe. No n8n o áudio que
// chega passa pelo nó "Whisper" (OpenAI, transcrição) e o agente recebe o TEXTO,
// nunca o som. A bancada faz igual: grava no navegador, transcreve aqui e manda
// o texto ao agente pelo `/api/playground` de sempre. Se a bancada mandasse o
// áudio para um modelo que ouve, o teste mostraria um agente que não existe.
//
// O modelo é `whisper-1`, o mesmo que o nó do n8n usa (ele não expõe outro).
// Sem `language` de propósito: o nó também não passa, e forçar "pt" aqui faria a
// bancada entender melhor do que o WhatsApp entende.
//
// Nada é gravado: o áudio vai para a OpenAI e a transcrição volta para o browser.

export const maxDuration = 60;

/** ~2 min de voz em opus cabem com folga; o limite de corpo da Vercel é 4,5 MB. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const client = await getMyClient();
  if (!client) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  if (client.role !== "dono") {
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "transcrição indisponível neste ambiente" },
      { status: 501 }
    );
  }

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("audio");
    if (f instanceof File) audio = f;
  } catch {
    return NextResponse.json({ error: "envio inválido" }, { status: 400 });
  }
  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "áudio vazio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "áudio longo demais" }, { status: 413 });
  }

  const corpo = new FormData();
  corpo.append("file", audio, audio.name || "audio.webm");
  corpo.append("model", "whisper-1");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: corpo,
    });
  } catch {
    return NextResponse.json(
      { error: "não foi possível transcrever o áudio" },
      { status: 502 }
    );
  }
  if (!res.ok) {
    // Só o status, nunca o corpo bruto nem a chave.
    return NextResponse.json(
      { error: `não foi possível transcrever o áudio (${res.status})` },
      { status: 502 }
    );
  }

  const data = (await res.json()) as { text?: string };
  const texto = (data.text ?? "").trim();
  if (!texto) {
    return NextResponse.json(
      { error: "não deu para entender o áudio" },
      { status: 422 }
    );
  }
  return NextResponse.json({ texto });
}
