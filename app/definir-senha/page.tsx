"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";

// Convidado define a própria senha depois de abrir o link do e-mail (a sessão
// já foi gravada em /auth/confirm). O CRM nunca define a senha por ninguém.
export default function DefinirSenhaPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setReady(!!data.user);
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("A senha precisa de ao menos 8 caracteres.");
      return;
    }
    if (pw !== pw2) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setError("Não foi possível definir a senha. Abra o link do convite de novo.");
      setLoading(false);
      return;
    }
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
          <h1 className="font-display text-xl font-bold">Definir senha</h1>
          <p className="text-sm text-ink-muted">
            Escolha uma senha para acessar sua conta.
          </p>
        </div>

        {ready === false && (
          <p className="rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
            Sua sessão expirou. Abra novamente o link do convite no seu e-mail.
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="pw" className="text-sm font-medium">
            Nova senha
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pw2" className="text-sm font-medium">
            Repita a senha
          </label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading || ready === false}
          className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-60"
        >
          {loading ? "Salvando…" : "Salvar e entrar"}
        </button>
      </form>
    </div>
  );
}
