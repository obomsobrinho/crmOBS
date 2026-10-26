import ConnectionRiskNotice from "@/components/ConnectionRiskNotice";
import ConnectWhatsApp from "@/components/ConnectWhatsApp";

// Preview de design do aviso de risco da conexão por QR (dev-only, liberado pelo
// proxy). Sem a Evolution no meio: o aviso é só texto e não depende de nada.
//
// `?tela=1` mostra a TELA `/connect` inteira (23/10/2026): desde que a montagem
// passou a parar o celular antes do QR, o aviso "abra no computador" só existe
// nela. Sem instância, nada consulta a Evolution até alguém pedir o QR.
export const dynamic = "force-dynamic";

export default async function DesignConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ tela?: string }>;
}) {
  const { tela } = await searchParams;
  if (tela === "1") {
    return <ConnectWhatsApp clientId="preview" clientName="Ótica Vision" hasInstance={false} />;
  }
  return (
    <div className="flex min-h-screen items-start justify-center bg-canvas p-4 py-10">
      <ConnectionRiskNotice />
    </div>
  );
}
