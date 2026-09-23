import NavRail from "@/components/NavRail";
import KnowledgeManager from "@/components/KnowledgeManager";
import { Card } from "@/components/ui/card";
import type { KnowledgeDoc } from "@/lib/crm";

// Preview de design da base de conhecimento (dev-only, liberado pelo proxy).
// Sem banco e sem envio real (preview desativa upload/remoção).
export const dynamic = "force-dynamic";

const MOCK: KnowledgeDoc[] = [
  {
    id: "1",
    title: "tabela-de-precos-2026.pdf",
    status: "ready",
    chunkCount: 12,
    byteSize: 384000,
    error: null,
    createdAt: "2026-08-01T12:00:00Z",
  },
  {
    id: "2",
    title: "perguntas-frequentes.docx",
    status: "processing",
    chunkCount: 0,
    byteSize: 45000,
    error: null,
    createdAt: "2026-08-02T12:00:00Z",
  },
  {
    id: "3",
    title: "catalogo.xlsx",
    status: "error",
    chunkCount: 0,
    byteSize: 128000,
    error: "não encontrei texto legível no arquivo",
    createdAt: "2026-08-02T13:00:00Z",
  },
];

export default function DesignConhecimentoPage() {
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="Ótica Vision" activeHref="/conhecimento" role="dono" />
      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
        <KnowledgeManager
          clientId="preview"
          initialDocs={MOCK}
          keyConfigured
          preview
        />
      </Card>
    </div>
  );
}
