"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";

// "Esqueci minha senha". Chama o Supabase Auth direto do browser (chave anon):
// nenhuma senha passa pelo nosso servidor. O link do e-mail cai em /auth/confirm
// e de lá em /definir-senha, as duas telas que já existem.
//
// A resposta é sempre a mesma, com e-mail cadastrado ou não: senão a tela vira
// um verificador de quem tem conta aqui.
export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/definir-senha`,
    });
    setEnviado(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form
        onSubmit={handleSubmit}
        className="glass w-full max-w-sm space-y-5 rounded-2xl p-7"
      >
        <BrandMark />

        {enviado ? (
          <div className="flex items-start gap-2">
            <MailCheck size={20} className="mt-0.5 shrink-0 text-ia" />
            <div>
              <h1 className="font-display text-xl font-bold">Link enviado</h1>
              <p className="text-sm text-ink-muted">
                Se existir uma conta com esse e-mail, o link para criar uma nova
                senha chega em instantes. Confira também o spam.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="font-display text-xl font-bold">
                Recuperar senha
              </h1>
              <p className="text-sm text-ink-muted">
                Informe seu e-mail e mandamos um link para você criar uma nova
                senha.
              </p>
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-60"
            >
              {loading ? "Enviando…" : "Enviar link"}
            </button>
          </>
        )}

        <div className="border-t border-line pt-4 text-center">
          <Link
            href="/login"
            className="text-xs text-ink-muted transition-colors hover:text-ink"
          >
            Voltar para o login
          </Link>
        </div>
      </form>
    </div>
  );
}
