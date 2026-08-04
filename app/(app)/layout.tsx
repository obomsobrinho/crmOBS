import { redirect } from "next/navigation";
import NavRail from "@/components/NavRail";
import { getMyClient } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Shell autenticado: nav rail + área de conteúdo. Compartilhado por
// Conversas (/inbox), Agente (/agente) e Perfil (/perfil).
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
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
