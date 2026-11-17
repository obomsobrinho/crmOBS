import { Users } from "lucide-react";
import TeamManager from "@/components/TeamManager";
import TituloDaPagina from "@/components/TituloDaPagina";
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
    <Card variant="pagina" className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 max-md:p-4">
      <TituloDaPagina
        icone={Users}
        titulo="Equipe"
        apoio={<>Quem pode atender pela conta {client?.name ?? ""}.</>}
        className="mb-5"
      />

      <TeamManager
        initialMembers={members}
        myRole={client?.role ?? null}
        myUserId={client?.userId ?? ""}
      />
    </Card>
  );
}
