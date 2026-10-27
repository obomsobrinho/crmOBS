// ARQUIVOS DO CONTATO (27/10/2026, pedido do dono): as imagens, os vídeos e os
// documentos que a pessoa mandou, no bloco "Arquivos" da ficha do contato
// (`components/ContactArquivos.tsx`), uma aba por tipo. Áudio fica de fora de
// propósito: ele é conversa, não papel que alguém volta para buscar.
//
// Módulo PURO (sem I/O): quem entra na lista, em que aba e com que nome.
// A busca no banco é `lib/arquivos-fonte.ts`; o realtime da ficha usa
// `arquivoDaLinha` para decidir se a linha nova entra.

import type { Tables } from "@/lib/database.types";

/** Os `message_type` que a ficha lista, na ordem das abas. Áudio não entra. */
export const TIPOS_DE_ARQUIVO = ["image", "video", "document"] as const;
export type TipoDeArquivo = (typeof TIPOS_DE_ARQUIVO)[number];

/** O rótulo de cada aba e o vazio dela. */
export const ABAS_DE_ARQUIVO: Record<TipoDeArquivo, { rotulo: string; vazio: string }> = {
  image: { rotulo: "Imagens", vazio: "Nenhuma imagem recebida ainda." },
  video: { rotulo: "Vídeos", vazio: "Nenhum vídeo recebido ainda." },
  document: { rotulo: "Documentos", vazio: "Nenhum documento recebido ainda." },
};

export function ehTipoDeArquivo(t: string | null | undefined): t is TipoDeArquivo {
  return (TIPOS_DE_ARQUIVO as readonly string[]).includes(t ?? "");
}

export type ArquivoDoContato = {
  id: number;
  /** Caminho no bucket `whatsapp-media` (ou URL direta, só no preview). */
  caminho: string;
  tipo: TipoDeArquivo;
  /** Nome que o WhatsApp mandou; `null` quando não veio (imagem e vídeo nunca têm). */
  nome: string | null;
  criadoEm: string;
};

/** A linha de `chat_messages` que a busca e o realtime entregam. */
export type LinhaDeArquivo = Pick<
  Tables<"chat_messages">,
  "id" | "media_url" | "message_type" | "user_message" | "created_at"
>;

export const COLUNAS_DE_ARQUIVO = "id, media_url, message_type, user_message, created_at";

// O n8n escreve o nome do documento no texto da mensagem recebida, no nó
// "Vídeo ou documento": "[Documento enviado: contrato.pdf. O conteúdo não pôde
// ser lido.]", com a legenda da pessoa antes, se houver. Não existe coluna de
// nome; se o texto do n8n mudar, o arquivo cai no nome genérico, nunca some.
const NOME_NO_TEXTO = /\[Documento enviado: (.+?)(?:\. O conteúdo[^\]]*)?\]/;

/** O nome do documento tirado do texto que o n8n gravou, ou `null`. */
export function nomeDoDocumento(texto: string | null): string | null {
  const m = texto ? NOME_NO_TEXTO.exec(texto) : null;
  const nome = m?.[1]?.trim();
  return nome ? nome : null;
}

/** A linha vira item da lista, ou `null` quando não é arquivo listável. */
export function arquivoDaLinha(l: LinhaDeArquivo): ArquivoDoContato | null {
  const tipo = l.message_type;
  if (!ehTipoDeArquivo(tipo)) return null;
  if (!l.media_url || !l.created_at) return null;
  return {
    id: l.id,
    caminho: l.media_url,
    tipo,
    nome: tipo === "document" ? nomeDoDocumento(l.user_message) : null,
    criadoEm: l.created_at,
  };
}

/** Mais recente primeiro; empate no instante decide pelo id (a ordem da busca). */
export function ordenarArquivos(lista: ArquivoDoContato[]): ArquivoDoContato[] {
  return [...lista].sort(
    (a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm) || b.id - a.id
  );
}

/** Extensão do caminho guardado (`.../uuid.pdf` -> `pdf`), ou `null`. */
export function extensaoDoCaminho(caminho: string): string | null {
  const m = /\.([a-z0-9]{1,8})(?:[?#].*)?$/i.exec(caminho);
  return m ? m[1].toLowerCase() : null;
}

/** A extensão que vale: a do arquivo guardado, senão a do nome que veio. */
function extensao(a: ArquivoDoContato): string | null {
  return extensaoDoCaminho(a.caminho) ?? (a.nome ? extensaoDoCaminho(a.nome) : null);
}

/** PDF abre em prévia dentro da janela; o resto só abre em aba nova ou baixa. */
export function ehPdf(a: ArquivoDoContato): boolean {
  return a.tipo === "document" && extensao(a) === "pdf";
}

/**
 * O tipo do documento como a pessoa lê ("PDF", "DOCX"), ou "Arquivo" quando não
 * há extensão. `bin` é o que `/api/inbound-media` grava para mime desconhecido:
 * não é tipo nenhum para quem lê.
 */
export function rotuloDoTipo(a: ArquivoDoContato): string {
  // Aqui o NOME vem primeiro: é o que a pessoa mandou e vai reconhecer, e o
  // caminho guardado pode ter caído em `bin` por um mime que o servidor não conhece.
  const ext = (a.nome ? extensaoDoCaminho(a.nome) : null) ?? extensaoDoCaminho(a.caminho);
  return ext && ext !== "bin" ? ext.toUpperCase() : "Arquivo";
}

/**
 * Nome do arquivo ao baixar. Documento leva o nome que veio; sem nome (toda
 * imagem e todo vídeo) vira `imagem-AAAA-MM-DD.ext` (ou `video-`, `documento-`),
 * com o dia já em São Paulo (`diaIso`, de `diaIsoSP`), que quem chama passa pronto.
 */
export function nomeParaBaixar(a: ArquivoDoContato, diaIso: string): string {
  if (a.nome) return a.nome;
  const ext = extensaoDoCaminho(a.caminho);
  const prefixo = a.tipo === "image" ? "imagem" : a.tipo === "video" ? "video" : "documento";
  const base = `${prefixo}-${diaIso}`;
  return ext ? `${base}.${ext}` : base;
}

/** A aba que abre: a primeira, na ordem das abas, que tem arquivo; senão Imagens. */
export function abaInicial(contagem: Record<TipoDeArquivo, number> | null): TipoDeArquivo {
  if (!contagem) return "image";
  return TIPOS_DE_ARQUIVO.find((t) => contagem[t] > 0) ?? "image";
}
