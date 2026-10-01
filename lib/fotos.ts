// FOTO DE PERFIL DO CONTATO (F4 do fechamento do P0, 01/10/2026,
// docs/plano-fechar-p0.md, D3 decidida pelo dono: COPIAR a imagem).
//
// Módulo PURO. O link que o WhatsApp devolve para a foto VENCE em dias, então
// mostrar o link direto quebraria a imagem na semana seguinte. O que o mercado
// faz (Chatwoot, `Avatar::AvatarFromUrlJob`) é baixar a foto e guardar no
// próprio armazenamento, e só baixar de novo quando o link MUDA. Aqui:
//
// - a cada `FOTO_RECHECAR_DIAS` o servidor pergunta à Evolution o link atual;
// - "o link mudou" compara só o CAMINHO do endereço: a parte depois do `?`
//   (assinatura e validade) muda a cada consulta mesmo com a foto igual, e
//   compará-la faria baixar a mesma foto toda semana;
// - quem escondeu a foto na privacidade, ou tirou a foto, fica sem foto: a
//   cópia é apagada (a pessoa decidiu não mostrar, e a gente respeita).

export const FOTO_RECHECAR_DIAS = 7;

/** Quantos contatos uma passada confere, no máximo (uma consulta à Evolution cada). */
export const FOTO_LOTE = 15;

/** Teto do arquivo baixado. Foto de perfil do WhatsApp tem dezenas de KB. */
export const FOTO_MAX_BYTES = 2_000_000;

/** A parte estável do link da foto: o caminho, sem a assinatura do `?`. */
export function origemDaFoto(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return null;
  }
}

/** Já passou da hora de conferir a foto deste contato? */
export function precisaConferir(fotoEm: string | null | undefined, agora: number): boolean {
  if (!fotoEm) return true;
  const t = Date.parse(fotoEm);
  if (!Number.isFinite(t)) return true;
  return agora - t >= FOTO_RECHECAR_DIAS * 86_400_000;
}

/**
 * O que fazer com o que a Evolution respondeu.
 * - `manter`: mesma foto (ou não deu para saber), nada a baixar;
 * - `baixar`: foto nova, baixar e trocar;
 * - `apagar`: a pessoa não mostra mais foto.
 */
export function decisaoDaFoto(
  atual: { fotoPath: string | null; fotoOrigem: string | null },
  linkNovo: string | null | undefined
): "manter" | "baixar" | "apagar" {
  const origem = origemDaFoto(linkNovo);
  if (!origem) return atual.fotoPath ? "apagar" : "manter";
  if (atual.fotoPath && origem === atual.fotoOrigem) return "manter";
  return "baixar";
}

/** Endereço da foto guardada, servido pelo app (`/api/fotos/...`). */
export function urlDaFoto(fotoPath: string | null | undefined): string | null {
  if (!fotoPath) return null;
  return `/api/fotos/${fotoPath.split("/").map(encodeURIComponent).join("/")}`;
}
