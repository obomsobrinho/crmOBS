import Link from "next/link";
import { CreditCard, ShieldAlert } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import BrandMark from "@/components/BrandMark";
import {
  billableSeats,
  planFor,
  seatState,
  statusLabel,
  type AccessState,
} from "@/lib/billing";

// Tela de assinatura: é o destino do gate do servidor quando a conta não está
// em dia, e também o lugar onde quem está em dia confere o estado. Componente de
// apresentação puro (recebe tudo por prop) para o /design renderizar sem banco.
//
// A cobrança de verdade (checkout, troca de plano, assentos) entra aqui no bloco
// de cobrança, quando o gateway estiver escolhido. Até então esta tela não
// promete botão que não existe.

export interface SubscriptionPanelProps {
  companyName: string;
  email: string;
  access: AccessState;
  status: string;
  trialEndsAt: string | null;
  graceUntil: string | null;
  /** TOTAL de membros do tenant (o dono é descontado aqui dentro). */
  seats: number | null;
  /** Plano assinado (null = ainda no teste, vale o plano do teste). */
  billingPlan: string | null;
  /** dono vê o caminho de pagamento; atendente precisa avisar o dono. */
  isOwner: boolean;
  /** Caixa (BillingCheckout). Só o dono recebe; atendente vê a tela sem ele. */
  children?: React.ReactNode;
}

function fmt(iso: string | null): string {
  if (!iso) return "não definido";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function SubscriptionPanel({
  companyName,
  email,
  access,
  status,
  trialEndsAt,
  graceUntil,
  seats,
  billingPlan,
  isOwner,
  children,
}: SubscriptionPanelProps) {
  const plano = planFor(billingPlan);
  // `seats` chega como total de membros; o dono não conta como atendente.
  const assentos = seatState(plano, billableSeats(seats ?? 0));

  const rows: { label: string; value: string }[] = [
    { label: "Empresa", value: companyName },
    { label: "Estado", value: statusLabel(status) },
    {
      label: "Plano",
      value: plano
        ? `${plano.name}, R$ ${plano.priceBRL} por mês`
        : "nenhum plano escolhido",
    },
  ];
  if (status === "trialing") {
    rows.push({ label: "Teste termina em", value: fmt(trialEndsAt) });
  }
  if (status === "past_due" && graceUntil) {
    rows.push({ label: "Acesso liberado até", value: fmt(graceUntil) });
  }
  rows.push({
    label: "Atendentes",
    value:
      seats === null
        ? "não informado"
        : plano
          ? `${assentos.used} de ${plano.seats} ${
              plano.seats === 1 ? "incluído" : "incluídos"
            }, sem contar o dono`
          : `${assentos.used} além do dono`,
  });
  rows.push({ label: "Conta", value: email });

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="glass w-full max-w-lg space-y-5 rounded-2xl p-7">
        <BrandMark />

        <div className="flex items-start gap-2">
          {access.blocked ? (
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-danger" />
          ) : (
            <CreditCard size={20} className="mt-0.5 shrink-0 text-accent" />
          )}
          <div>
            <h1 className="font-display text-xl font-bold">
              {access.blocked ? "Acesso pausado" : "Assinatura"}
            </h1>
            <p className="text-sm text-ink-muted">{access.message}</p>
          </div>
        </div>

        {access.blocked && (
          <p className="rounded-lg bg-[var(--danger-bg)] px-3 py-2 text-sm text-danger">
            O atendimento automático e o envio de mensagens estão parados
            enquanto a conta não estiver em dia. Suas conversas e configurações
            continuam salvas.
          </p>
        )}

        {!access.blocked && access.warn && (
          <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
            {access.warn}
          </p>
        )}

        {/* Atendente além do incluído: virou adicional pago. Ninguém é removido
            automaticamente, então o aviso é o que resolve. */}
        {assentos.extra > 0 && (
          <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
            {assentos.message}
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <span className="text-sm text-ink-muted">{r.label}</span>
              <span className="text-sm font-medium">{r.value}</span>
            </div>
          ))}
        </div>

        {/* Caixa: só o dono contrata, troca de plano ou cancela. */}
        {isOwner ? (
          children
        ) : (
          <p className="text-sm text-ink-muted">
            Quem resolve a assinatura é a pessoa responsável pela conta da sua
            empresa. Avise essa pessoa para liberar o acesso do time.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-line pt-4">
          {access.blocked ? (
            <span className="text-xs text-ink-muted">
              Assim que o pagamento entrar, o acesso volta sozinho.
            </span>
          ) : (
            <Link
              href="/inbox"
              className="text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Voltar para as conversas
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
