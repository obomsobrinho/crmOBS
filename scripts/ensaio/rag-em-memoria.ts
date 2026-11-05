import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { chunkText, embedTexts, extractText } from "@/lib/rag";

// RAG DO ENSAIO (`--documentos`): a base de conhecimento candidata vive só na
// memória. Mesma ingestão de `knowledge/process` (extractText, chunkText, até 400
// trechos por documento, embedTexts) e o mesmo retrieval de `match_knowledge_chunks`
// (similaridade = 1 - distância de cosseno, os 5 melhores). Ligado, o serviço
// somente-leitura responde `knowledge_chunks` e `match_knowledge_chunks` daqui e
// ignora os trechos gravados da empresa: nada é misturado, nada é enviado ao banco.

const MAX_CHUNKS = 400; // o mesmo de app/api/clients/[id]/knowledge/process/route.ts

interface Trecho {
  documento: string;
  content: string;
  embedding: number[];
}

let trechos: Trecho[] | null = null;

export function ragEmMemoriaAtivo(): boolean {
  return trechos !== null;
}

export function quantosTrechos(): number {
  return trechos?.length ?? 0;
}

export async function carregarDocumentos(arquivos: string[], apiKey: string): Promise<string[]> {
  const todos: Trecho[] = [];
  const resumo: string[] = [];
  for (const arquivo of arquivos) {
    const nome = basename(arquivo);
    const texto = await extractText(readFileSync(arquivo), nome);
    const pedacos = chunkText(texto).slice(0, MAX_CHUNKS);
    const vetores = await embedTexts(apiKey, pedacos);
    pedacos.forEach((content, i) => todos.push({ documento: nome, content, embedding: vetores[i] }));
    resumo.push(`${nome}: ${pedacos.length} trechos`);
  }
  trechos = todos;
  return resumo;
}

function cosseno(a: number[], b: number[]): number {
  let p = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    p += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : p / Math.sqrt(na * nb);
}

/** O `match_knowledge_chunks` em memória. O vetor chega como o turno o manda: "[n,n,...]". */
export function buscarTrechos(args: { p_query_embedding?: string; p_match_count?: number }) {
  const consulta = JSON.parse(args.p_query_embedding ?? "[]") as number[];
  const limite = Math.min(Math.max(args.p_match_count ?? 5, 1), 20);
  return (trechos ?? [])
    .map((t, i) => ({ id: i + 1, document_id: t.documento, content: t.content, similarity: cosseno(t.embedding, consulta) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limite);
}
