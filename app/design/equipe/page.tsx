import { Users } from "lucide-react";
import NavRail from "@/components/NavRail";
import TeamManager from "@/components/TeamManager";
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
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/equipe" />
      <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl p-6">
        <div className="mb-1 flex items-center gap-2">
          <Users size={20} className="text-accent" />
          <h1 className="font-display text-xl font-bold">Equipe</h1>
        </div>
        <p className="mb-5 text-sm text-ink-muted">
          Quem pode atender pela conta Ótica Vision.
        </p>
        <TeamManager initialMembers={MOCK} myRole="dono" myUserId={ME} preview />
      </div>
    </div>
  );
}
