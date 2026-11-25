import TituloDaPagina from "@/components/TituloDaPagina";
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
      <NavRail clientName="Ótica Vision" activeHref="/equipe" role="dono" />
      <Card variant="pagina" className="flex min-w-0 flex-1 flex-col overflow-hidden p-6 max-md:p-4">
        <TituloDaPagina titulo="Equipe" apoio="Quem pode atender pela conta Ótica Vision." className="mb-5" />
        <TeamManager initialMembers={MOCK} myRole="dono" myUserId={ME} preview />
      </Card>
    </div>
  );
}
