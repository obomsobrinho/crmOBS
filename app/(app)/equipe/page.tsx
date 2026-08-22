import { Users } from "lucide-react";
import TeamManager from "@/components/TeamManager";
import { Card } from "@/components/ui/card";
import { requireActiveTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchMembers } from "@/lib/team";

export const dynamic = "force-dynamic";

// Tela de Equipe: quem tem acesso a esta conta e (para o dono) convite/remoção.
export default async function EquipePage() {
  const client = await requireActiveTenant();
  const supabase = await createClient();
  const members = await fetchMembers(supabase);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
      <div className="mb-1 flex items-center gap-2">
        <Users size={20} className="text-brand-ink" />
        <h1 className="text-titulo">Equipe</h1>
      </div>
      <p className="mb-5 text-apoio text-ink-2">
        Quem pode atender pela conta {client?.name ?? ""}.
      </p>

      <TeamManager
        initialMembers={members}
        myRole={client?.role ?? null}
        myUserId={client?.userId ?? ""}
      />
    </Card>
  );
}
