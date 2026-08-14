import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import Playground from "@/components/Playground";

export const dynamic = "force-dynamic";

// Bancada de teste do agente. Só do dono (a config do agente também é). Carrega
// os nomes dos estágios do funil só para rotular o "estágio que moveria" no
// diagnóstico. Toda a conversa roda em /api/playground (dryRun): nada gravado.
export default async function PlaygroundPage() {
  const client = await requireActiveTenant();
  if (!client || client.role !== "dono") redirect("/inbox");

  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("key, name")
    .eq("client_id", client.id);

  const stageNames: Record<string, string> = {};
  for (const s of (stages ?? []) as { key: string; name: string }[]) {
    stageNames[s.key] = s.name;
  }

  return (
    <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-6">
      <Playground stageNames={stageNames} />
    </div>
  );
}
