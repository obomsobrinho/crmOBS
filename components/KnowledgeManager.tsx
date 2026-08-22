"use client";

import { useRef, useState } from "react";
import {
  Upload,
  FileText,
  Trash2,
  Loader2,
  CircleCheck,
  CircleAlert,
  BookOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatBytes, type KnowledgeDoc } from "@/lib/crm";
import { Button } from "@/components/ui/button";

const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md";

export default function KnowledgeManager({
  clientId,
  initialDocs,
  keyConfigured,
  preview = false,
}: {
  clientId: string;
  initialDocs: KnowledgeDoc[];
  /** OPENAI_API_KEY presente no servidor. Sem ela, o upload responde 501. */
  keyConfigured: boolean;
  preview?: boolean;
}) {
  const supabase = createClient();
  const [docs, setDocs] = useState<KnowledgeDoc[]>(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function updateDoc(id: string, patch: Partial<KnowledgeDoc>) {
    setDocs((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // Upload em 3 passos (padrão gatekeeper, compatível com a Vercel):
  // 1) pega URL assinada + cria o registro; 2) sobe o arquivo DIRETO pro Storage;
  // 3) processa (extrai texto, embeda). O arquivo não passa pela função.
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = ""; // permite reenviar o mesmo arquivo
    if (!file || preview) return;

    setUploading(true);
    setError(null);
    try {
      // 1) URL assinada + registro
      const r1 = await fetch(`/api/clients/${clientId}/knowledge/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mime: file.type,
          size: file.size,
        }),
      });
      const d1 = (await r1.json()) as {
        error?: string;
        documentId?: string;
        bucket?: string;
        path?: string;
        token?: string;
        title?: string;
      };
      if (!r1.ok || !d1.documentId || !d1.token || !d1.path || !d1.bucket) {
        setError(d1.error ?? "Falha ao preparar o envio.");
        setUploading(false);
        return;
      }

      const optimistic: KnowledgeDoc = {
        id: d1.documentId,
        title: d1.title ?? file.name,
        status: "processing",
        chunkCount: 0,
        byteSize: file.size,
        error: null,
        createdAt: new Date().toISOString(),
      };
      setDocs((d) => [optimistic, ...d]);

      // 2) upload direto pro Storage (não passa pela função da Vercel)
      const up = await supabase.storage
        .from(d1.bucket)
        .uploadToSignedUrl(d1.path, d1.token, file);
      if (up.error) {
        updateDoc(d1.documentId, { status: "error", error: "falha ao enviar" });
        setError("Falha ao enviar o arquivo.");
        setUploading(false);
        return;
      }

      // 3) processa
      const r3 = await fetch(`/api/clients/${clientId}/knowledge/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: d1.documentId }),
      });
      const d3 = (await r3.json()) as {
        error?: string;
        document?: { chunk_count?: number };
      };
      if (!r3.ok || !d3.document) {
        updateDoc(d1.documentId, {
          status: "error",
          error: d3.error ?? "falha ao processar",
        });
        setError(d3.error ?? "Falha ao processar o arquivo.");
        setUploading(false);
        return;
      }
      updateDoc(d1.documentId, {
        status: "ready",
        chunkCount: d3.document.chunk_count ?? 0,
        error: null,
      });
      setUploading(false);
    } catch {
      setError("Não foi possível contatar o servidor.");
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (preview) return;
    const prev = docs;
    setDocs((d) => d.filter((x) => x.id !== id)); // otimista
    const res = await fetch(`/api/clients/${clientId}/knowledge`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: id }),
    });
    if (!res.ok) {
      setDocs(prev); // reverte
      setError("Falha ao remover o documento.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Base de conhecimento</h1>
        </div>
        <p className="text-apoio text-ink-2">
          Envie documentos (produtos, tabelas, perguntas frequentes) para o agente
          responder com base neles. PDF, Word, planilha, CSV ou texto.
        </p>
      </div>

      {!keyConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
          <CircleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            O processamento de documentos ainda não está ativo no servidor. O envio
            fica disponível quando a chave do modelo estiver configurada.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink">
          {error}
        </div>
      )}

      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-bloco px-4 py-8 text-center transition-colors hover:bg-[var(--active-bg)] ${
          uploading ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          disabled={uploading}
          className="hidden"
        />
        {uploading ? (
          <>
            <Loader2 size={22} className="animate-spin text-brand-ink" />
            <span className="text-apoio font-medium">Processando o documento…</span>
            <span className="text-legenda text-ink-3">
              Extraindo o texto e preparando para o agente.
            </span>
          </>
        ) : (
          <>
            <Upload size={22} className="text-brand-ink" />
            <span className="text-apoio font-medium">
              Arraste um arquivo ou clique para enviar
            </span>
            <span className="text-legenda text-ink-3">
              PDF, DOCX, XLSX, CSV, TXT ou MD, até 8 MB.
            </span>
          </>
        )}
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <div className="py-8 text-center text-apoio text-ink-3">
            Nenhum documento ainda.
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-bloco p-3"
              >
                <FileText size={18} className="shrink-0 text-ink-faint" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-apoio font-medium">{doc.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-legenda text-ink-3">
                    <StatusPill doc={doc} />
                    {doc.byteSize ? <span>{formatBytes(doc.byteSize)}</span> : null}
                  </div>
                </div>
                <Button
                  variant="danger-ghost"
                  size="icon-control"
                  onClick={() => remove(doc.id)}
                  title="Remover"
                  aria-label={`Remover ${doc.title}`}
                >
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ doc }: { doc: KnowledgeDoc }) {
  if (doc.status === "ready") {
    return (
      <span className="flex items-center gap-1 text-human-ink">
        <CircleCheck size={12} />
        {doc.chunkCount} trecho{doc.chunkCount === 1 ? "" : "s"}
      </span>
    );
  }
  if (doc.status === "error") {
    return (
      <span
        className="flex items-center gap-1 text-danger-ink"
        title={doc.error ?? undefined}
      >
        <CircleAlert size={12} />
        Falhou
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-ink-2">
      <Loader2 size={12} className="animate-spin" />
      Processando
    </span>
  );
}
