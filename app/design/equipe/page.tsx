import { Users } from "lucide-react";
import NavRail from "@/components/NavRail";
import TeamManager from "@/components/TeamManager";
import { Card } from "@/components/ui/card";
import type { Member } from "@/lib/team";

// Preview de design da tela de Equipe (dev-only, liberado pelo proxy). Sem banco
// e sem login: usa membros mock e simula as ações em memória (preview).
export const dynamic = "force-dynamic";

const ME = "00000000-0000-0000-0000-000000000001";
const MOCK: Member[] = [
  { userId: ME, email: "ana.dona@oticavision.com", role: "dono" },
  { userId: "u2", email: "carlos.silva@oticavision.com", role: "atendente" },
  { userId: "u3", email: "marina@oticavision.com", role: "atendente" },
];

export default function DesignEquipePage() {
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail clientName="Ótica Vision" activeHref="/equipe" />
      <Card variant="pagina" className="flex min-w-0 flex-1 flex-col overflow-hidden p-6 max-md:p-4">
        <div className="mb-1 flex items-center gap-2">
          <Users size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Equipe</h1>
        </div>
        <p className="mb-5 text-apoio text-ink-2">
          Quem pode atender pela conta Ótica Vision.
        </p>
        <TeamManager initialMembers={MOCK} myRole="dono" myUserId={ME} preview />
      </Card>
    </div>
  );
}
