import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import KnowledgeManager from "@/components/KnowledgeManager";
import { Card } from "@/components/ui/card";
import type { KnowledgeDoc } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function ConhecimentoPage() {
  const client = await requireActiveTenant();
  // A base de conhecimento é do dono, igual à configuração do agente.
  if (!client || client.role !== "dono") redirect("/inbox");

  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge_documents")
    .select("id, title, status, chunk_count, byte_size, error, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const docs: KnowledgeDoc[] = (
    (data ?? []) as {
      id: string;
      title: string;
      status: "processing" | "ready" | "error";
      chunk_count: number;
      byte_size: number | null;
      error: string | null;
      created_at: string;
    }[]
  ).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    chunkCount: d.chunk_count,
    byteSize: d.byte_size,
    error: d.error,
    createdAt: d.created_at,
  }));

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
      <KnowledgeManager
        clientId={client.id}
        initialDocs={docs}
        keyConfigured={!!process.env.OPENAI_API_KEY}
      />
    </Card>
  );
}
