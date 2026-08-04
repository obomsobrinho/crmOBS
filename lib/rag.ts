import "server-only";

// Núcleo do RAG (base de conhecimento). Só de servidor. Extrai texto de arquivos,
// quebra em trechos (chunks) e gera embeddings via OpenAI. Usado pela rota de
// upload (ingestão) e por /api/agent (retrieval).
//
// Parsers carregados sob demanda (dynamic import): unpdf (PDF), mammoth (.docx),
// exceljs (.xlsx). CSV/TXT/MD são decodificados direto, sem lib.

export const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dims (bate com o schema)
export const EMBEDDING_DIMS = 1536;

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 150;

// Formatos aceitos no upload (extensão -> tipo lógico).
const EXT_MAP: Record<string, "pdf" | "docx" | "xlsx" | "text"> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  csv: "text",
  txt: "text",
  md: "text",
};

export function acceptedExtensions(): string[] {
  return Object.keys(EXT_MAP);
}

export class RagError extends Error {}

function extOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

// Extrai o texto de um arquivo. Lança RagError em formato não suportado ou falha.
export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const kind = EXT_MAP[extOf(filename)];
  if (!kind) {
    throw new RagError(
      `formato não suportado (aceitos: ${acceptedExtensions().join(", ")})`
    );
  }

  try {
    if (kind === "pdf") {
      const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await pdfText(pdf, { mergePages: true });
      return Array.isArray(text) ? text.join("\n") : text;
    }
    if (kind === "docx") {
      const mammoth = (await import("mammoth")).default;
      // Cast por causa do Buffer genérico do @types/node vs o tipo do mammoth.
      const { value } = await mammoth.extractRawText(
        { buffer } as unknown as Parameters<typeof mammoth.extractRawText>[0]
      );
      return value;
    }
    if (kind === "xlsx") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      // Cast pelo mesmo motivo do mammoth (Buffer genérico do @types/node).
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
      const lines: string[] = [];
      wb.eachSheet((sheet) => {
        lines.push(`# ${sheet.name}`);
        sheet.eachRow((row) => {
          const values = (row.values as unknown[]).slice(1); // índice 0 é vazio
          lines.push(values.map((v) => (v == null ? "" : String(v))).join("\t"));
        });
      });
      return lines.join("\n");
    }
    // text (csv/txt/md)
    return new TextDecoder("utf-8").decode(buffer);
  } catch (e) {
    if (e instanceof RagError) throw e;
    throw new RagError("não foi possível ler o conteúdo do arquivo");
  }
}

// Quebra o texto em trechos com sobreposição, tentando cortar em limites
// naturais (quebra de linha ou espaço) para não picar frases no meio.
export function chunkText(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const nl = slice.lastIndexOf("\n");
      const sp = slice.lastIndexOf(" ");
      const cut = nl > size * 0.5 ? nl : sp > size * 0.5 ? sp : -1;
      if (cut > 0) end = i + cut;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks;
}

// Gera embeddings para vários textos (em lotes). Retorna na mesma ordem.
export async function embedTexts(
  apiKey: string,
  texts: string[],
  model = EMBEDDING_MODEL
): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < texts.length; i += BATCH) {
    const input = texts.slice(i, i + BATCH);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input }),
      });
    } catch {
      throw new RagError("falha de rede ao gerar embeddings");
    }
    if (!res.ok) {
      throw new RagError(`o modelo de embedding respondeu com erro (${res.status})`);
    }
    const data = (await res.json()) as {
      data?: { embedding: number[]; index: number }[];
    };
    const rows = (data.data ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    if (rows.length !== input.length) {
      throw new RagError("resposta de embedding incompleta");
    }
    out.push(...rows);
  }
  return out;
}

// Formato aceito pelo pgvector num insert via PostgREST: "[n,n,n]".
export function toVector(nums: number[]): string {
  return `[${nums.join(",")}]`;
}
