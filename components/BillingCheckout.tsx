"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLANS, PLAN_ORDER, type PlanKey } from "@/lib/billing";
import type { FraseValor } from "@/lib/valor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  frasesAcumuladas = [],
}: {
  /** Plano já contratado, ou null se nunca assinou. */
  planoAtual: PlanKey | null;
  /** Existe assinatura viva no gateway (então é troca, não contratação). */
  temAssinatura: boolean;
  nomePadrao: string;
  emailPadrao: string;
  /** Veio de `/assinatura?plano=...`, o link do site. */
  planoSugerido: PlanKey | null;
  /**
   * Acumulado de valor desde o início, mostrado só no passo de cancelar.
   * Vazio quando não há histórico: frase com zero não segura ninguém.
   */
  frasesAcumuladas?: FraseValor[];
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
      <div className="space-y-3 rounded-xl border border-line bg-bloco p-4">
        <p className="text-apoio font-medium">Cancelar assinatura</p>

        {/* Antídoto do cancelamento: o acumulado desde o início, na hora exata
            em que a pessoa pensa em sair. O valor deste produto é invisível (a
            IA responde dentro do WhatsApp), e este é o único momento em que ela
            para para olhar. Números reais, nunca inflados. */}
        {frasesAcumuladas.length > 0 && (
          <div className="space-y-2 rounded-lg border border-line bg-conteudo p-3">
            <p className="text-legenda uppercase text-ink-3">
              O que a IA já fez nesta conta
            </p>
            <ul className="space-y-1.5">
              {frasesAcumuladas.map((f) => (
                <li key={f.key} className="flex gap-2 text-apoio">
                  <span className="shrink-0 font-semibold tabular-nums">
                    {f.numero}
                  </span>
                  <span className="text-ink-2">{f.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-apoio text-ink-2">
          A cobrança para. Suas conversas e configurações continuam salvas, e a
          conta fica em modo leitura.
        </p>
        <div className="space-y-1.5">
          <label htmlFor="motivo" className="text-apoio font-medium">
            O que motivou? (opcional)
          </label>
          <Textarea
            id="motivo"
            rows={3}
            maxLength={500}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ajuda a gente a melhorar."
            className="resize-none"
          />
        </div>
        {error && <p className="text-apoio text-danger-ink">{error}</p>}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="field"
            onClick={cancelar}
            disabled={loading}
            className="border-danger-line text-danger-ink hover:bg-danger-surface"
          >
            {loading ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
          <Button
            variant="outline"
            size="field"
            onClick={() => {
              setCancelando(false);
              setError(null);
            }}
          >
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-apoio font-medium">
          {temAssinatura ? "Trocar de plano" : "Escolher plano"}
        </p>
        <div className="overflow-hidden rounded-xl border border-line">
          {PLAN_ORDER.map((k, i) => {
            const p = PLANS[k];
            const ativo = escolhido === k;
            return (
              // Seleção única desenhada com <button>, e não com RadioGroup: a
              // troca seria de composição, não de vocabulário, e a decisão desta
              // rodada é não redesenhar. `aria-pressed` é o que faltava.
              <button
                key={k}
                type="button"
                aria-pressed={ativo}
                onClick={() => setEscolhido(k)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  i > 0 ? "border-t border-line" : ""
                } ${
                  ativo
                    ? "bg-[var(--active-bg)]"
                    : "bg-bloco hover:bg-[var(--active-bg)]"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    ativo ? "border-primary" : "border-line-strong"
                  }`}
                >
                  {ativo && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-apoio font-medium">{p.name}</span>
                  <span className="ml-2 text-legenda text-ink-2">
                    {p.seats} {p.seats === 1 ? "atendente" : "atendentes"} além do
                    dono
                  </span>
                </span>
                <span className="shrink-0 text-apoio font-medium tabular-nums">
                  R$ {p.priceBRL}
                  <span className="text-legenda font-normal text-ink-2">/mês</span>
                </span>
                {planoAtual === k && (
                  <span className="shrink-0 rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-legenda text-[var(--chip-fg)]">
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
            <label htmlFor="doc" className="text-apoio font-medium">
              CPF ou CNPJ de quem paga
            </label>
            <Input
              id="doc"
              inputMode="numeric"
              autoComplete="off"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
            />
            <p className="text-legenda text-ink-2">
              Exigido para emitir Pix e boleto. Fica só com o meio de pagamento.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email-cobranca" className="text-apoio font-medium">
              E-mail de cobrança
            </label>
            <Input
              id="email-cobranca"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </>
      )}

      {error && <p className="text-apoio text-danger-ink">{error}</p>}

      <Button
        size="field"
        onClick={assinar}
        disabled={loading || !podeEnviar}
        className="w-full justify-center"
      >
        {loading
          ? "Aguarde…"
          : temAssinatura
            ? "Trocar para este plano"
            : "Ir para o pagamento"}
      </Button>

      <p className="text-center text-legenda text-ink-2">
        Pix, boleto ou cartão. Você escolhe na próxima tela.
      </p>

      {temAssinatura && (
        <div className="flex justify-center border-t border-line pt-3">
          <Button
            variant="danger-ghost"
            size="none"
            onClick={() => setCancelando(true)}
            className="text-legenda"
          >
            Cancelar assinatura
          </Button>
        </div>
      )}
    </div>
  );
}
