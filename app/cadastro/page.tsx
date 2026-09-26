"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { TRIAL_DAYS } from "@/lib/billing";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-4 max-md:items-stretch max-md:p-0">
        <div className={cn(cardVariants({ variant: "pagina" }), "w-full max-w-sm space-y-5 p-7 max-md:max-w-none max-md:px-5 max-md:pb-8 max-md:pt-12")}>
          <BrandMark />

          <div className="flex items-start gap-2">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-human-ink" />
            <div>
              <h1 className="text-titulo">Confira seu e-mail</h1>
              <p className="text-apoio text-ink-2">
                Mandamos um link para <span className="font-medium">{email}</span>.
                Abra o link para criar sua senha e começar.
              </p>
            </div>
          </div>

          <p className="rounded-lg border border-line bg-bloco px-3 py-2 text-apoio text-ink-2">
            Não chegou em alguns minutos? Confira a caixa de spam. O link vale
            por tempo limitado.
          </p>

          <div className="border-t border-line pt-4 text-center">
            <Link
              href="/login"
              className="text-legenda text-ink-2 transition-colors hover:text-ink"
            >
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4 max-md:items-stretch max-md:p-0">
      <form
        onSubmit={handleSubmit}
        className={cn(cardVariants({ variant: "pagina" }), "w-full max-w-sm space-y-5 p-7 max-md:max-w-none max-md:px-5 max-md:pb-8 max-md:pt-12")}
      >
        <BrandMark />

        <div>
          <h1 className="text-titulo">Criar conta</h1>
          <p className="text-apoio text-ink-2">
            {TRIAL_DAYS} dias para testar, sem cartão.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="company" className="text-apoio font-medium">
            Nome da empresa
          </label>
          <Input
            id="company"
            type="text"
            autoComplete="organization"
            required
            maxLength={80}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
          <p className="text-legenda text-ink-2">
            É o nome que aparece pra sua equipe dentro do sistema.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-apoio font-medium">
            Seu e-mail
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="text-legenda text-ink-2">
            Você escolhe sua senha pelo link que vamos mandar nesse e-mail.
          </p>
        </div>

        {error && <p className="text-apoio text-danger-ink">{error}</p>}

        <Button
          type="submit"
          size="field"
          carregando={loading}
          className="w-full justify-center max-md:h-11"
        >
          {loading ? "Criando conta…" : "Criar conta"}
        </Button>

        <div className="border-t border-line pt-4 text-center">
          <span className="text-legenda text-ink-2">Já tem conta? </span>
          <Link
            href="/login"
            className="text-legenda font-medium text-brand-ink transition-colors hover:underline"
          >
            Entrar
          </Link>
        </div>
      </form>
    </div>
  );
}
