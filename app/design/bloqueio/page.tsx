"use client";

import NavRail from "@/components/NavRail";
import BillingBanner from "@/components/BillingBanner";
import MessageComposer from "@/components/MessageComposer";
import { accessState } from "@/lib/billing";

// Preview de design do modo leitura (dev-only, liberado pelo proxy). É o estado
// de uma conta bloqueada: o inbox continua visível e as mensagens seguem
// chegando, mas o envio sai da tela e a IA não atende.
//
// É client component porque o MessageComposer recebe `onSend`, e Server
// Component não passa função como prop.

const BLOQUEADA = accessState({
  subscription_status: "past_due",
  trial_ends_at: null,
  grace_until: "2026-08-05T12:00:00.000Z",
});

export default function DesignBloqueioPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/inbox" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <BillingBanner access={BLOQUEADA} isOwner />
        <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
          <div className="flex-1 p-4 text-sm text-ink-muted">
            Aqui ficam as mensagens da conversa, que continuam chegando.
          </div>
          <MessageComposer
            onSend={async () => {}}
            iaAtiva={false}
            clientId="00000000-0000-0000-0000-000000000000"
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
