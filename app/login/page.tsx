"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  // `/auth/confirm` e `/auth/concluir` mandam para cá com `?erro=convite` quando o
  // link do e-mail não abriu a sessão. Sem este aviso a pessoa via só um login
  // e não sabia o que fazer (25/09/2026): o caso comum é o link já usado, porque
  // o Supabase aceita cada link uma vez só.
  const linkFalhou = use(searchParams).erro === "convite";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }
    // O "/" decide o destino (conectar WhatsApp ou inbox).
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4 max-md:items-stretch max-md:p-0">
      <form
        onSubmit={handleSubmit}
        className={cn(cardVariants({ variant: "pagina" }), "w-full max-w-sm space-y-5 p-7 max-md:max-w-none max-md:px-5 max-md:pb-8 max-md:pt-12")}
      >
        <BrandMark />

        <div>
          <h1 className="text-titulo">Entrar</h1>
          <p className="text-apoio text-ink-2">Acesse a conta da sua empresa.</p>
        </div>

        {linkFalhou && (
          <p
            role="alert"
            data-slot="aviso-link"
            className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink"
          >
            Esse link expirou ou já foi usado. Se ainda não criou sua senha,
            peça um novo em{" "}
            <Link href="/recuperar-senha" className="font-semibold underline">
              Esqueci minha senha
            </Link>
            .
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-apoio font-medium">
            E-mail
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-apoio font-medium">
              Senha
            </label>
            <Link
              href="/recuperar-senha"
              className="text-legenda text-ink-2 transition-colors hover:text-ink"
            >
              Esqueci minha senha
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-apoio text-danger-ink">{error}</p>}

        <Button
          type="submit"
          size="field"
          carregando={loading}
          className="w-full justify-center max-md:h-11"
        >
          {loading ? "Entrando…" : "Entrar"}
        </Button>

        <div className="border-t border-line pt-4 text-center">
          <span className="text-legenda text-ink-2">Ainda não tem conta? </span>
          <Link
            href="/cadastro"
            className="text-legenda font-medium text-brand-ink transition-colors hover:underline"
          >
            Criar conta
          </Link>
        </div>
      </form>
    </div>
  );
}
