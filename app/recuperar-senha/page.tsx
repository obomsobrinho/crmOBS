"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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
        className={cn(cardVariants(), "w-full max-w-sm space-y-5 p-7")}
      >
        <BrandMark />

        {enviado ? (
          <div className="flex items-start gap-2">
            <MailCheck size={20} className="mt-0.5 shrink-0 text-human-ink" />
            <div>
              <h1 className="text-titulo">Link enviado</h1>
              <p className="text-apoio text-ink-2">
                Se existir uma conta com esse e-mail, o link para criar uma nova
                senha chega em instantes. Confira também o spam.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-titulo">
                Recuperar senha
              </h1>
              <p className="text-apoio text-ink-2">
                Informe seu e-mail e mandamos um link para você criar uma nova
                senha.
              </p>
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

            <Button
              type="submit"
              size="field"
              disabled={loading}
              className="w-full justify-center"
            >
              {loading ? "Enviando…" : "Enviar link"}
            </Button>
          </>
        )}

        <div className="border-t border-line pt-4 text-center">
          <Link
            href="/login"
            className="text-legenda text-ink-2 transition-colors hover:text-ink"
          >
            Voltar para o login
          </Link>
        </div>
      </form>
    </div>
  );
}
