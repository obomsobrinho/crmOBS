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
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatBytes,
  KNOWLEDGE_MAX_LABEL,
  type KnowledgeDoc,
} from "@/lib/crm";
import { Button } from "@/components/ui/button";
import {
  AreaRolavel,
  DISSOLVER_LISTA,
} from "@/components/ui/dissolver-rolagem";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { CabecalhoBloco, MOLDURA_LISTA } from "@/components/agente/ui";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md";

/** Quantos documentos a apresentação compacta mostra antes de "ver todos". */
const RESUMO = 3;

export default function KnowledgeManager({
  clientId,
  initialDocs,
  keyConfigured,
  apresentacao = "pagina",
  preview = false,
}: {
  clientId: string;
  initialDocs: KnowledgeDoc[];
  /** OPENAI_API_KEY presente no servidor. Sem ela, o upload responde 501. */
  keyConfigured: boolean;
  /**
   * `pagina` = a tela `/conhecimento` (título, área de arraste grande, lista
   * inteira). `bloco` = dentro do grupo "O que ele sabe" do `/agente`:
   * inventário curto, com o envio e a lista completa no painel lateral.
   *
   * É a MESMA instância nos dois casos, e isso não é detalhe: `docs` é estado
   * local, então renderizar duas instâncias (uma embutida e uma no painel) faria
   * as duas divergirem no primeiro upload.
   */
  apresentacao?: "pagina" | "bloco";
  preview?: boolean;
}) {
  const supabase = createClient();
  const [docs, setDocs] = useState<KnowledgeDoc[]>(initialDocs);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function updateDoc(id: string, patch: Partial<KnowledgeDoc>) {
    setDocs((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function escolherArquivo() {
    inputRef.current?.click();
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

  // Um input só, na raiz, acionado pelo botão embutido E pela área de arraste do
  // painel. Dois inputs seriam dois caminhos para o mesmo handler.
  const campoArquivo = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      onChange={onPick}
      disabled={uploading}
      className="hidden"
    />
  );

  const avisoChave = !keyConfigured && (
    <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
      <CircleAlert size={15} className="mt-0.5 shrink-0" />
      <span>
        O processamento de documentos ainda não está ativo no servidor. O envio
        fica disponível quando a chave do modelo estiver configurada.
      </span>
    </div>
  );

  const avisoErro = error && (
    <div className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink">
      {error}
    </div>
  );

  // Era um <label> envolvendo o input; virou <button> porque agora existe um
  // input só, na raiz, e dois gatilhos apontando para ele.
  const areaArraste = (
    <button
      type="button"
      onClick={escolherArquivo}
      disabled={uploading}
      className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-bloco px-4 py-8 text-center transition-colors hover:bg-[var(--active-bg)] disabled:pointer-events-none disabled:opacity-60"
    >
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
            PDF, DOCX, XLSX, CSV, TXT ou MD, até {KNOWLEDGE_MAX_LABEL}.
          </span>
        </>
      )}
    </button>
  );

  // A linha de UM documento, em duas densidades: `cartao` é a lista do painel e
  // da tela `/conhecimento` (cada documento numa caixa), `linha` é o cartão-lista
  // do `/agente`, onde a moldura é do cartão e o documento é só uma linha dele.
  // Uma marcação só, para as duas não divergirem na próxima ação ou estado.
  function linhaDoc(doc: KnowledgeDoc, densidade: "cartao" | "linha") {
    return (
      <li
        key={doc.id}
        className={
          densidade === "cartao"
            ? "flex items-center gap-3 rounded-xl border border-line bg-bloco p-3"
            : "flex items-center gap-3 px-4 py-2.5"
        }
      >
        <FileText
          size={densidade === "cartao" ? 18 : 16}
          className="shrink-0 text-ink-faint"
        />
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
    );
  }

  function lista() {
    if (docs.length === 0) {
      return (
        <p className="py-4 text-center text-apoio text-ink-3">
          Nenhum documento ainda.
        </p>
      );
    }
    return (
      <ul className="space-y-2">{docs.map((d) => linhaDoc(d, "cartao"))}</ul>
    );
  }

  const painel = (
    <Sheet open={painelAberto} onOpenChange={setPainelAberto}>
      <SheetContent>
        <div className="flex items-start justify-between gap-2 border-b border-line px-5 py-3">
          <div>
            <SheetTitle>Documentos</SheetTitle>
            <SheetDescription>
              Produtos, tabelas de preço, perguntas frequentes, contratos.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-control" aria-label="Fechar">
              <X size={16} />
            </Button>
          </SheetClose>
        </div>
        {/* Regra da casa: área rolável dissolve nas bordas. Formulário mais
            lista, então o degrau é o padrão. */}
        <AreaRolavel className="flex min-h-0 flex-1 flex-col gap-4 p-5">
          {avisoChave}
          {avisoErro}
          {areaArraste}
          {lista()}
        </AreaRolavel>
      </SheetContent>
    </Sheet>
  );

  // ——— Dentro do /agente: inventário, não entrada de formulário ———
  //
  // A diferença precisa estar ESCRITA: nesta tela o Salvar publica, e o
  // documento NÃO passa por ele (as 3 chamadas do upload gravam na hora). Sem a
  // frase, a pessoa envia um arquivo, não clica em Salvar, e fica sem saber se
  // valeu. É a mesma honestidade do "Salvar já publica no WhatsApp" do rodapé.
  if (apresentacao === "bloco") {
    return (
      <div className="flex h-full flex-col gap-4">
        {campoArquivo}
        {/* O MESMO cabeçalho dos outros blocos do construtor (ícone, título
            `text-cartao`, subtítulo). Título de nível 2 e não rótulo: ele
            encabeça um bloco COM ESTRUTURA PRÓPRIA. Ver
            docs/design-system/fundamentos-tipografia.md.
            ⚠️ O "Enviar documento" SAIU DA LINHA DO TÍTULO (22/09/2026, pedido
            do dono: "estamos quebrando a linha sem necessidade"): ele espremia o
            subtítulo para duas linhas numa coluna que é metade da tela. Foi para
            o pé da lista, que é onde se acrescenta item numa lista.
            O subtítulo diz o TETO (21/09/2026: "é um anexo e precisa de um
            limite de tamanho") e NÃO promete "custa menos token":
            `match_knowledge_chunks` não tem limiar de similaridade, então com
            um documento no tenant os 5 melhores trechos entram no prompt em
            TODO turno, relevantes ou não. */}
        <CabecalhoBloco
          icone={FileText}
          titulo="Documentos"
          descricao={`Tabela de preço, catálogo, contrato. Até ${KNOWLEDGE_MAX_LABEL} por arquivo.`}
        />
        {avisoChave}
        {avisoErro}
        {/* UM cartão de lista, com a mesma moldura do horário ao lado: os dois
            blocos da linha falam a mesma língua. Documento é linha, e não
            cartão dentro de cartão; o pé é a linha de acrescentar. */}
        <div
          data-slot="docs-lista"
          className={cn(MOLDURA_LISTA, "flex flex-1 flex-col")}
        >
          {docs.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-4 py-6 text-center text-apoio text-ink-3">
              Nenhum documento ainda.
            </p>
          ) : (
            <ul className="flex-1 divide-y divide-line">
              {docs.slice(0, RESUMO).map((d) => linhaDoc(d, "linha"))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
            <Button variant="ghost" onClick={escolherArquivo} carregando={uploading}>
              <Upload size={14} />
              {uploading ? "Processando…" : "Enviar documento"}
            </Button>
            <p className="ml-auto px-2 text-legenda text-ink-3">
              Entra no ar quando termina de processar.
            </p>
            {docs.length > 0 && (
              <Button variant="ghost" onClick={() => setPainelAberto(true)}>
                {docs.length > RESUMO
                  ? `Ver todos (${docs.length})`
                  : "Gerenciar documentos"}
              </Button>
            )}
          </div>
        </div>
        {painel}
      </div>
    );
  }

  // ——— Tela /conhecimento: segue existindo como rota, fora do menu ———
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {campoArquivo}
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

      {avisoChave}
      {avisoErro}
      {areaArraste}

      {/* Lista de documentos: o degrau de LISTA, porque o item tem titulo,
          estado e tamanho em tres linhas. */}
      <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
        {lista()}
      </AreaRolavel>
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
