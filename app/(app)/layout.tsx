import { redirect } from "next/navigation";
import NavRail from "@/components/NavRail";
import OnboardingBar from "@/components/OnboardingBar";
import BillingBanner from "@/components/BillingBanner";
import { getMyClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Shell autenticado: nav rail + área de conteúdo. Compartilhado por
// Conversas (/inbox), Agente (/agente) e Perfil (/perfil).
//
// Conta bloqueada NÃO é expulsa daqui: ela continua vendo o `/inbox` com as
// mensagens chegando (como um WhatsApp Web aberto), só não trabalha. Quem fecha
// as páginas pagas é `requireActiveTenant()` dentro de cada uma delas (um layout
// de Server Component não conhece a rota atual). O envio (`POST /api/send`) e o
// cérebro (`processTurn`) checam por conta própria, porque o n8n chama um deles
// sem passar por layout nenhum.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await getMyClient();
  if (!client) redirect("/login");
  if (!client.evolution_instance) redirect("/connect");

  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName={client.name} role={client.role ?? undefined} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Estado da conta: bloqueio (leitura só) ou aviso (trial acabando,
            pagamento em carência). Vem antes do trilho porque é mais urgente. */}
        <BillingBanner access={client.access} isOwner={client.role === "dono"} />
        {/* Trilho de configuração: fica em toda página até o agente ser
            publicado, e some sozinho depois (progresso visível de verdade). */}
        {!client.access.blocked && !client.onboarding.complete && (
          <OnboardingBar state={client.onboarding} />
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
