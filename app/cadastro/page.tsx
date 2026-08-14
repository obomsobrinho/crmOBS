"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/billing";
import BrandMark from "@/components/BrandMark";

// Cadastro público. O formulário NÃO pede senha de propósito: a senha nunca
// passa pelo nosso servidor. A pessoa recebe um link por e-mail e escolhe a
// própria senha em /definir-senha (mesmo caminho do convite de equipe). Isso
// também deixa a confirmação de e-mail obrigatória por construção.
export default function CadastroPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyName, email }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "não foi possível criar sua conta.");
        setLoading(false);
        return;
      }
      setEnviado(true);
    } catch {
      setError("falha de conexão. Tente de novo.");
    }
    setLoading(false);
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <div className="glass w-full max-w-sm space-y-5 rounded-2xl p-7">
          <BrandMark />

          <div className="flex items-start gap-2">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-ia" />
            <div>
              <h1 className="font-display text-xl font-bold">Confira seu e-mail</h1>
              <p className="text-sm text-ink-muted">
                Mandamos um link para <span className="font-medium">{email}</span>.
                Abra o link para escolher sua senha e começar.
              </p>
            </div>
          </div>

          <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted">
            Não chegou em alguns minutos? Confira a caixa de spam. O link vale
            por tempo limitado.
          </p>

          <div className="border-t border-line pt-4 text-center">
            <Link
              href="/login"
              className="text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        onSubmit={handleSubmit}
        className="glass w-full max-w-sm space-y-5 rounded-2xl p-7"
      >
        <BrandMark />

        <div>
          <h1 className="font-display text-xl font-bold">Criar conta</h1>
          <p className="text-sm text-ink-muted">
            {TRIAL_DAYS} dias para testar, sem cartão.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="company" className="text-sm font-medium">
            Nome da empresa
          </label>
          <input
            id="company"
            type="text"
            autoComplete="organization"
            required
            maxLength={80}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
          />
          <p className="text-xs text-ink-muted">
            É o nome que aparece pra sua equipe dentro do sistema.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Seu e-mail
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
          />
          <p className="text-xs text-ink-muted">
            Você escolhe sua senha pelo link que vamos mandar nesse e-mail.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-60"
        >
          {loading ? "Criando conta…" : "Criar conta"}
        </button>

        <div className="border-t border-line pt-4 text-center">
          <span className="text-xs text-ink-muted">Já tem conta? </span>
          <Link
            href="/login"
            className="text-xs font-medium text-accent transition-colors hover:underline"
          >
            Entrar
          </Link>
        </div>
      </form>
    </div>
  );
}
