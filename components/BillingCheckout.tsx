"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS, PLAN_ORDER, type PlanKey } from "@/lib/billing";

// Caixa, não vitrine.
//
// A página de vendas mora no site (obomsobrinho), com argumento e comparação.
// Aqui é só a transação: três linhas secas, o documento que o gateway exige, e
// o botão que leva para a página de pagamento do Asaas. Misturar propaganda com
// o sistema que a pessoa já comprou é ruído.
//
// A escolha acontece DENTRO do app de propósito: é aqui que existe sessão, então
// o pagamento fica ligado ao tenant certo. Pagando fora, sobraria casar por
// e-mail digitado no checkout, que é texto que o cliente controla.

export default function BillingCheckout({
  planoAtual,
  temAssinatura,
  nomePadrao,
  emailPadrao,
  planoSugerido,
}: {
  /** Plano já contratado, ou null se nunca assinou. */
  planoAtual: PlanKey | null;
  /** Existe assinatura viva no gateway (então é troca, não contratação). */
  temAssinatura: boolean;
  nomePadrao: string;
  emailPadrao: string;
  /** Veio de `/assinatura?plano=...`, o link do site. */
  planoSugerido: PlanKey | null;
}) {
  const router = useRouter();
  const [escolhido, setEscolhido] = useState<PlanKey>(
    planoSugerido ?? planoAtual ?? "profissional"
  );
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [email, setEmail] = useState(emailPadrao);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const digitos = cpfCnpj.replace(/\D/g, "");
  const documentoOk = digitos.length === 11 || digitos.length === 14;
  const podeEnviar = temAssinatura || (documentoOk && email.trim() !== "");

  async function assinar() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan: escolhido,
          cpfCnpj: digitos,
          name: nomePadrao,
          email: email.trim(),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        invoiceUrl?: string | null;
      };
      if (!res.ok) {
        setError(json.error ?? "não foi possível continuar.");
        setLoading(false);
        return;
      }
      if (json.invoiceUrl) {
        // Sai do app para a página de pagamento do Asaas, onde a pessoa escolhe
        // Pix, boleto ou cartão.
        window.location.href = json.invoiceUrl;
        return;
      }
      router.refresh();
    } catch {
      setError("falha de conexão. Tente de novo.");
    }
    setLoading(false);
  }

  async function cancelar() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "não foi possível cancelar.");
        setLoading(false);
        return;
      }
      setCancelando(false);
      router.refresh();
    } catch {
      setError("falha de conexão. Tente de novo.");
    }
    setLoading(false);
  }

  if (cancelando) {
    return (
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-medium">Cancelar assinatura</p>
        <p className="text-sm text-ink-muted">
          A cobrança para. Suas conversas e configurações continuam salvas, e a
          conta fica em modo leitura.
        </p>
        <div className="space-y-1.5">
          <label htmlFor="motivo" className="text-sm font-medium">
            O que motivou? (opcional)
          </label>
          <textarea
            id="motivo"
            rows={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ajuda a gente a melhorar."
            className="w-full resize-none rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            onClick={cancelar}
            disabled={loading}
            className="rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-[var(--danger-bg)] disabled:opacity-60"
          >
            {loading ? "Cancelando…" : "Confirmar cancelamento"}
          </button>
          <button
            onClick={() => {
              setCancelando(false);
              setError(null);
            }}
            className="rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium">
          {temAssinatura ? "Trocar de plano" : "Escolher plano"}
        </p>
        <div className="overflow-hidden rounded-xl border border-line">
          {PLAN_ORDER.map((k, i) => {
            const p = PLANS[k];
            const ativo = escolhido === k;
            return (
              <button
                key={k}
                onClick={() => setEscolhido(k)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  i > 0 ? "border-t border-line" : ""
                } ${
                  ativo
                    ? "bg-[var(--active-bg)]"
                    : "bg-surface hover:bg-[var(--active-bg)]"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    ativo ? "border-accent" : "border-line-strong"
                  }`}
                >
                  {ativo && <span className="h-2 w-2 rounded-full bg-accent" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {p.seats} {p.seats === 1 ? "atendente" : "atendentes"} além do
                    dono
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  R$ {p.priceBRL}
                  <span className="text-xs font-normal text-ink-muted">/mês</span>
                </span>
                {planoAtual === k && (
                  <span className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-[11px] text-ink-muted">
                    atual
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Documento e e-mail só na primeira contratação: depois o gateway já sabe. */}
      {!temAssinatura && (
        <>
          <div className="space-y-1.5">
            <label htmlFor="doc" className="text-sm font-medium">
              CPF ou CNPJ de quem paga
            </label>
            <input
              id="doc"
              inputMode="numeric"
              autoComplete="off"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
            />
            <p className="text-xs text-ink-muted">
              Exigido para emitir Pix e boleto. Fica só com o meio de pagamento.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email-cobranca" className="text-sm font-medium">
              E-mail de cobrança
            </label>
            <input
              id="email-cobranca"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
            />
          </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={assinar}
        disabled={loading || !podeEnviar}
        className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-60"
      >
        {loading
          ? "Aguarde…"
          : temAssinatura
            ? "Trocar para este plano"
            : "Ir para o pagamento"}
      </button>

      <p className="text-center text-xs text-ink-muted">
        Pix, boleto ou cartão. Você escolhe na próxima tela.
      </p>

      {temAssinatura && (
        <div className="border-t border-line pt-3 text-center">
          <button
            onClick={() => setCancelando(true)}
            className="text-xs text-ink-muted transition-colors hover:text-danger"
          >
            Cancelar assinatura
          </button>
        </div>
      )}
    </div>
  );
}
