import { redirect } from "next/navigation";
import NavRail from "@/components/NavRail";
import AvisoMontagem from "@/components/AvisoMontagem";
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
  // Sem WhatsApp conectado não há app: o dono que ainda não publicou vai para o
  // assistente, que começa exatamente por conectar. Atendente segue indo para
  // `/connect`, porque `/montagem` é do dono e o mandaria de volta para cá, o
  // que seria um laço.
  if (!client.evolution_instance) {
    redirect(
      client.role === "dono" && !client.agentPublishedAt
        ? "/montagem"
        : "/connect"
    );
  }

  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName={client.name} role={client.role ?? undefined} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Estado da conta: bloqueio (leitura só) ou aviso (trial acabando,
            pagamento em carência). Vem antes do trilho porque é mais urgente. */}
        <BillingBanner access={client.access} isOwner={client.role === "dono"} />
        {/* Porta de volta para a montagem: uma linha, em toda página, até o
            agente ir ao ar. NÃO conta passos, porque o único contador da conta
            mora dentro do assistente.
            Só para o DONO: atendente não configura agente, e oferecer a ele um
            caminho que responde com redirecionamento seria promessa falsa. */}
        {!client.access.blocked &&
          !client.montagem.completo &&
          client.role === "dono" && <AvisoMontagem />}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
