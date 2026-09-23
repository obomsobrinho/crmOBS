"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-4 max-md:items-stretch max-md:p-0">
      <form
        onSubmit={handleSubmit}
        className={cn(cardVariants({ variant: "pagina" }), "w-full max-w-sm space-y-5 p-7 max-md:max-w-none max-md:px-5 max-md:pb-8 max-md:pt-12")}
      >
        <BrandMark />

        <div>
          <h1 className="text-titulo">Definir senha</h1>
          <p className="text-apoio text-ink-2">
            Escolha uma senha para acessar sua conta.
          </p>
        </div>

        {ready === false && (
          <p className="rounded-lg bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
            Sua sessão expirou. Abra novamente o link do convite no seu e-mail.
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="pw" className="text-apoio font-medium">
            Nova senha
          </label>
          <Input
            id="pw"
            type="password"
            autoComplete="new-password"
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="pw2" className="text-apoio font-medium">
            Repita a senha
          </label>
          <Input
            id="pw2"
            type="password"
            autoComplete="new-password"
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
        </div>

        {error && <p className="text-apoio text-danger-ink">{error}</p>}

        <Button
          type="submit"
          size="field"
          disabled={loading || ready === false}
          className="w-full justify-center max-md:h-11"
        >
          {loading ? "Salvando…" : "Salvar e entrar"}
        </Button>
      </form>
    </div>
  );
}
