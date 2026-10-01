import { redirect } from "next/navigation";
import NavRail from "@/components/NavRail";
import AvisoMontagem from "@/components/AvisoMontagem";
import BillingBanner from "@/components/BillingBanner";
import WhatsAppBanner from "@/components/WhatsAppBanner";
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
  // ⚠️ O DONO ENTRA MESMO SEM WHATSAPP CONECTADO (30/09/2026, achado do dono no
  // celular). Esta guarda mandava o dono sem instância para `/montagem`, de quando
  // conectar era o PRIMEIRO passo. Desde que virou o último (24/09), o "Terminar
  // depois" do assistente leva ao `/inbox`, este layout devolvia ao assistente, e
  // a pessoa ficava presa num laço sem saída. O dono entra; quem lembra de
  // terminar é a linha `AvisoMontagem` no topo. Atendente sem instância segue
  // indo para `/connect` (ele não tem o assistente).
  if (!client.evolution_instance && client.role !== "dono") {
    redirect("/connect");
  }

  return (
    // `h-dvh` e não `h-screen`: no celular a barra do navegador entra e sai, e
    // `100vh` conta com ela escondida, cortando o rodapé. Abaixo de `md` a casca
    // vira coluna sem respiro (o conteúdo encosta nas bordas) e o `NavRail` põe a
    // barra de abas embaixo (plano do mobile, fase 0).
    <div className="flex h-dvh flex-col bg-canvas md:flex-row md:gap-3 md:p-3">
      <NavRail
        clientName={client.name}
        clientId={client.id}
        role={client.role ?? undefined}
        numeroAvisos={client.avisos}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:gap-3">
        {/* Estado da conta: bloqueio (leitura só) ou aviso (trial acabando,
            pagamento em carência). Vem antes do trilho porque é mais urgente. */}
        <BillingBanner access={client.access} isOwner={client.role === "dono"} />
        {/* Estado do WhatsApp: some quando a instância está `open`. A checagem
            é no BROWSER, com intervalo, e nunca aqui: este layout roda em toda
            navegação, e uma chamada à Evolution por página faria a tela inteira
            esperar por API de terceiro (achado A1, latência de troca de
            conversa). */}
        {/* Conta que NUNCA conectou não leva a faixa vermelha de "caiu": o
            WhatsApp não caiu, ele ainda não existe, e quem diz isso é a linha
            da montagem logo abaixo (um sinal por fato). */}
        {client.evolution_instance && <WhatsAppBanner clientId={client.id} />}
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
