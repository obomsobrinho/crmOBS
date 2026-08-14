import Link from "next/link";
import { AlertTriangle, Eye } from "lucide-react";
import type { AccessState } from "@/lib/billing";

// Estado da conta em cima de toda página do app.
//
// Conta bloqueada não é expulsa do produto: ela continua vendo as conversas
// chegando, só não trabalha. Então precisa de um aviso permanente explicando
// exatamente o que parou, senão a pessoa acha que o sistema quebrou.
export default function BillingBanner({
  access,
  isOwner,
}: {
  access: AccessState;
  isOwner: boolean;
}) {
  if (access.blocked) {
    return (
      <div className="shrink-0 rounded-2xl border border-danger/30 bg-[var(--danger-bg)] px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Eye size={17} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-danger">
              Modo leitura: {access.message}
            </p>
            <p className="text-sm text-ink-muted">
              As mensagens continuam chegando e você acompanha as conversas, mas
              o agente de IA não responde, o envio pelo sistema está parado e as
              outras telas ficam fechadas até a conta ficar em dia.
            </p>
          </div>
          <Link
            href="/assinatura"
            className="btn-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition"
          >
            {isOwner ? "Regularizar" : "Ver assinatura"}
          </Link>
        </div>
      </div>
    );
  }

  if (access.warn) {
    return (
      <div className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-warn/30 bg-[var(--warn-bg)] px-4 py-2.5">
        <AlertTriangle size={16} className="shrink-0 text-warn" />
        <p className="min-w-0 flex-1 truncate text-sm text-warn">{access.warn}</p>
        <Link
          href="/assinatura"
          className="shrink-0 text-xs font-medium text-warn underline transition-opacity hover:opacity-80"
        >
          Ver assinatura
        </Link>
      </div>
    );
  }

  return null;
}
