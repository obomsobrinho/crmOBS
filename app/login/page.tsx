"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";

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
        className="glass w-full max-w-sm space-y-5 rounded-2xl p-7"
      >
        <BrandMark />

        <div>
          <h1 className="font-display text-xl font-bold">Entrar</h1>
          <p className="text-sm text-ink-muted">Acesse a conta da sua empresa.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
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
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <Link
              href="/recuperar-senha"
              className="text-xs text-ink-muted transition-colors hover:text-ink"
            >
              Esqueci minha senha
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <div className="border-t border-line pt-4 text-center">
          <span className="text-xs text-ink-muted">Ainda não tem conta? </span>
          <Link
            href="/cadastro"
            className="text-xs font-medium text-accent transition-colors hover:underline"
          >
            Criar conta
          </Link>
        </div>
      </form>
    </div>
  );
}
