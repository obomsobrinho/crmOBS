import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import { buildInbox, type ConvRow, type ContatoRow } from "@/lib/inbox";
import {
  buildCards,
  lastQualByPhone,
  rowToStage,
  type StageRow,
} from "@/lib/pipeline";
import PipelineBoard from "@/components/PipelineBoard";

export const dynamic = "force-dynamic";

// Pipeline (funil) do tenant. Colunas = estágios (pipeline_stages), cards =
// conversas (mesma fonte do inbox). O gate de auth/instância roda no layout do
// route group (app). A RLS restringe tudo ao tenant logado.
export default async function PipelinePage() {
  const client = await requireActiveTenant();
  const supabase = await createClient();

  const [{ data: stages }, { data: convs }, { data: contatos }, { data: quals }] =
    await Promise.all([
      supabase
        .from("pipeline_stages")
        .select(
          "id, key, name, position, is_canonical, is_default, archived, color"
        )
        .order("position"),
      supabase
        .from("conversations")
        .select(
          "phone, last_message_at, last_message_preview, last_message_from, unread_count, assigned_user_id, stage, handoff_at, stage_source"
        )
        .order("last_message_at", { ascending: false })
        .limit(500),
      supabase
        .from("dados_cliente")
        .select("telefone, nomewpp, atendimento_ia, display_name"),
      supabase
        .from("conversation_qualifications")
        .select("phone, summary")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  const { items, ia } = buildInbox(
    (convs ?? []) as ConvRow[],
    (contatos ?? []) as ContatoRow[]
  );
  const qual = lastQualByPhone(
    (quals ?? []) as { phone: string; summary: string | null }[]
  );
  // Quem pôs cada card na coluna em que está. Vem da MESMA consulta, então não
  // custa viagem nenhuma.
  const source: Record<string, "human" | "ia" | null> = {};
  for (const c of (convs ?? []) as { phone: string; stage_source?: string | null }[])
    source[c.phone] =
      c.stage_source === "human" || c.stage_source === "ia" ? c.stage_source : null;

  return (
    <PipelineBoard
      clientId={client?.id ?? ""}
      myRole={client?.role ?? null}
      initialStages={((stages ?? []) as StageRow[]).map(rowToStage)}
      initialCards={buildCards(items, ia, qual, source)}
    />
  );
}
