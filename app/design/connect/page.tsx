import ConnectionRiskNotice from "@/components/ConnectionRiskNotice";

// Preview de design do aviso de risco da conexão por QR (dev-only, liberado pelo
// proxy). Sem a Evolution no meio: o aviso é só texto e não depende de nada.
export const dynamic = "force-dynamic";

export default function DesignConnectPage() {
  return (
    <div className="flex min-h-screen items-start justify-center bg-canvas p-4 py-10">
      <ConnectionRiskNotice />
    </div>
  );
}
