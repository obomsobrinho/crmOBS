// Regra da mídia recebida do contato (`/api/inbound-media`, chamada pelo n8n).
// Pura: sem I/O, para a rota e os testes usarem a mesma leitura.
//
// Dois modos (27/10/2026):
// - "base64": o n8n manda o arquivo inteiro no corpo e a rota sobe. É o modo
//   antigo; fica para o fluxo nunca quebrar entre o deploy e a troca no n8n.
//   Esbarra no limite de corpo da Vercel (4,5 MB, ou ~3,3 MB de arquivo depois
//   do base64), então vídeo e PDF grande se perdiam em silêncio.
// - "assinar": o n8n manda só os dados do arquivo (`assinar: true`, sem
//   base64), a rota devolve o caminho e uma URL de upload assinada, e o n8n
//   sobe o binário direto no Storage. O corpo para a Vercel fica pequeno.

export type PedidoDeMidia =
  | { modo: "nada" }
  | { modo: "base64"; clientId: string; bytes: Buffer; mime: string; filename: string; type: string }
  | { modo: "assinar"; clientId: string; mime: string; filename: string; type: string };

// mime -> extensão de arquivo (os tipos comuns do WhatsApp).
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

export function extensaoDaMidia(mime: string, filename: string): string {
  // ⚠️ O WhatsApp manda "audio/ogg; codecs=opus": sem tirar os parâmetros, o
  // áudio era salvo como ".oggcodec" (visto em 01/10/2026).
  const base = mime.split(";")[0].trim().toLowerCase();
  const byMime = EXT[base];
  if (byMime) return byMime;
  const byName = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  if (byName) return byName[1];
  const sub = base.split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 8);
  return sub || "bin";
}

/** `{client_id}/in/{uuid}.{ext}`: o prefixo do tenant é o que a RLS do bucket confere. */
export function caminhoDaMidia(clientId: string, mime: string, filename: string, id: string): string {
  return `${clientId}/in/${id}.${extensaoDaMidia(mime, filename)}`;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Lê o corpo do n8n. Qualquer coisa inválida vira "nada" (a rota responde path null). */
export function lerPedidoDeMidia(body: unknown): PedidoDeMidia {
  if (!body || typeof body !== "object") return { modo: "nada" };
  const b = body as Record<string, unknown>;
  const clientId = texto(b.client_id);
  if (!clientId) return { modo: "nada" };
  const mime = texto(b.mime) || "application/octet-stream";
  const filename = texto(b.filename);
  const type = texto(b.type) || "document";

  if (b.assinar === true) return { modo: "assinar", clientId, mime, filename, type };

  const base64 = texto(b.base64);
  if (!base64) return { modo: "nada" };
  // O base64 pode vir como data URI (com prefixo "data:...;base64,").
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const bytes = Buffer.from(clean, "base64");
  if (bytes.byteLength === 0) return { modo: "nada" };
  return { modo: "base64", clientId, bytes, mime, filename, type };
}
