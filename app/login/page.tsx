"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
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
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        onSubmit={handleSubmit}
        className={cn(cardVariants(), "w-full max-w-sm space-y-5 p-7")}
      >
        <BrandMark />

        <div>
          <h1 className="text-titulo">Entrar</h1>
          <p className="text-apoio text-ink-2">Acesse a conta da sua empresa.</p>
        </div>

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
          disabled={loading}
          className="w-full justify-center"
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
