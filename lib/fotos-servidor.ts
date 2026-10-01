import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { linkDaFotoDePerfil } from "@/lib/evolution";
import { telefoneImpossivel } from "@/lib/avisos";
import {
  FOTO_LOTE,
  FOTO_MAX_BYTES,
  FOTO_RECHECAR_DIAS,
  decisaoDaFoto,
  origemDaFoto,
} from "@/lib/fotos";

// FOTO DE PERFIL, o lado do servidor (regra em `lib/fotos.ts`).
//
// QUEM CHAMA: as telas de Conversas e de Clientes, por `after()`, depois de a
// página já ter saído. Ninguém espera a Evolution para ver a lista; a foto
// aparece na próxima vez que a tela carregar. Nada de n8n (produção).
//
// UMA PASSADA = até `FOTO_LOTE` contatos que estão sem conferir há
// `FOTO_RECHECAR_DIAS`. Antes de consultar, a passada CARIMBA `foto_em` nos
// que pegou (só nos que ainda estavam vencidos): duas abas abertas ao mesmo
// tempo não consultam o mesmo contato duas vezes.
//
// Best-effort do começo ao fim: foto é enfeite, e nenhuma falha aqui pode virar
// erro de tela. Nunca lança.

const BUCKET = "whatsapp-media";

export async function atualizarFotos(clientId: string, instancia: string | null): Promise<void> {
  if (!instancia) return;
  try {
    const svc = createServiceClient();
    const corte = new Date(Date.now() - FOTO_RECHECAR_DIAS * 86_400_000).toISOString();

    const { data: candidatos, error } = await svc
      .from("dados_cliente")
      .select("id")
      .eq("client_id", clientId)
      .or(`foto_em.is.null,foto_em.lt.${corte}`)
      .order("foto_em", { ascending: true, nullsFirst: true })
      .limit(FOTO_LOTE);
    if (error || !candidatos?.length) return;

    const { data: pegos, error: errPega } = await svc
      .from("dados_cliente")
      .update({ foto_em: new Date().toISOString() })
      .eq("client_id", clientId)
      .in("id", candidatos.map((c) => c.id))
      .or(`foto_em.is.null,foto_em.lt.${corte}`)
      .select("id, telefone, foto_path, foto_origem");
    if (errPega || !pegos) return;

    for (const c of pegos) {
      await conferirUma(svc, clientId, instancia, c);
    }
  } catch (e) {
    console.error("fotos de perfil:", e);
  }
}

async function conferirUma(
  svc: ReturnType<typeof createServiceClient>,
  clientId: string,
  instancia: string,
  c: { id: number; telefone: string; foto_path: string | null; foto_origem: string | null }
): Promise<void> {
  // Grupo não é contato, e o número impossível dos testes nunca vai à Evolution.
  if (c.telefone.includes("@g.us") || telefoneImpossivel(c.telefone)) return;
  const numero = c.telefone.split("@")[0];

  const link = await linkDaFotoDePerfil(instancia, numero);
  if (link === undefined) return; // não deu para saber: não mexe em nada

  const decisao = decisaoDaFoto({ fotoPath: c.foto_path, fotoOrigem: c.foto_origem }, link);
  if (decisao === "manter") return;

  if (decisao === "apagar") {
    await svc
      .from("dados_cliente")
      .update({ foto_path: null, foto_origem: null })
      .eq("id", c.id)
      .eq("client_id", clientId);
    if (c.foto_path) await svc.storage.from(BUCKET).remove([c.foto_path]);
    return;
  }

  // Baixar a foto nova.
  const res = await fetch(link!, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return;
  const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!tipo.startsWith("image/")) return;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > FOTO_MAX_BYTES) return;

  // O nome leva um pedaço do hash do arquivo: foto nova é endereço novo, e o
  // navegador pode guardar cada endereço para sempre.
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
  const caminho = `${clientId}/fotos/${c.id}-${hash}.${ext}`;

  const { error: errSobe } = await svc.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: tipo, upsert: true });
  if (errSobe) {
    console.error("foto de perfil, upload:", errSobe.message);
    return;
  }
  const { error: errGrava } = await svc
    .from("dados_cliente")
    .update({ foto_path: caminho, foto_origem: origemDaFoto(link) })
    .eq("id", c.id)
    .eq("client_id", clientId);
  if (errGrava) {
    console.error("foto de perfil, gravar:", errGrava.message);
    return;
  }
  if (c.foto_path && c.foto_path !== caminho) {
    await svc.storage.from(BUCKET).remove([c.foto_path]);
  }
}
