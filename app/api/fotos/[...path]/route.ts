import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

// A FOTO DE PERFIL GUARDADA (`lib/fotos.ts`), servida pelo app.
//
// O bucket é privado. Em vez de assinar um link por foto a cada tela (link
// assinado muda toda vez e o navegador não guarda), o app serve o arquivo por
// um endereço FIXO: o nome leva o hash da imagem, então foto nova é endereço
// novo, e cada endereço pode ficar no cache do navegador para sempre.
//
// Só quem é do tenant: o primeiro pedaço do caminho é o id dele.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const client = await getMyClient();
  if (!client) return new Response(null, { status: 401 });
  const partes = (await ctx.params).path ?? [];
  if (partes.length !== 3 || partes[0] !== client.id || partes[1] !== "fotos") {
    return new Response(null, { status: 404 });
  }
  const { data, error } = await createServiceClient()
    .storage.from("whatsapp-media")
    .download(partes.join("/"));
  if (error || !data) return new Response(null, { status: 404 });
  return new Response(data, {
    headers: {
      "Content-Type": data.type || "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
