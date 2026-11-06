"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandMark from "@/components/BrandMark";
import { Aviso } from "@/components/ui/aviso";
import PainelMarca from "@/components/PainelMarca";
import { Button } from "@/components/ui/button";
import { CampoComIcone } from "@/components/ui/campo-com-icone";

/** O WhatsApp de atendimento da OBS, para quem travou antes de entrar. */
const AJUDA_WHATSAPP = "https://wa.me/5533984033279";

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
  const [verSenha, setVerSenha] = useState(false);
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
    <div className="flex min-h-dvh flex-col bg-raised lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
      <main className="flex flex-1 flex-col items-center gap-6 px-5 pb-6 pt-10 lg:px-6 lg:py-6">
        <form onSubmit={handleSubmit} className="my-auto w-full max-w-sm space-y-4">
          <div className="flex justify-center pb-1">
            <BrandMark size="lg" empilhada />
          </div>

          <div className="space-y-1 pb-1 text-center">
            <h1 className="text-entrada">Bem-vindo de volta</h1>
            <p className="text-corpo text-ink-2">Entre para ver seus atendimentos.</p>
          </div>

          {linkFalhou && (
            <Aviso role="alert" data-slot="aviso-link">
              {/* ⚠️ "o MAIS RECENTE" (29/09/2026, achado do dono): pedir um link
                  novo invalida os anteriores, e clicar num e-mail antigo prendia
                  a pessoa num ciclo de pedir link e cair aqui de novo. */}
              {/* ⚠️ "Esqueci minha senha" CONFUNDIA quem foi convidado e nunca
                  criou senha (achado do dono, 29/09/2026; resolvido em 02/10). O
                  caminho é o mesmo (link novo pelo Supabase Auth, cai em
                  /definir-senha), mas a tela diz "criar", não "recuperar". */}
              Esse link expirou ou já foi usado.{" "}
              <Link
                href="/recuperar-senha?modo=criar"
                className="font-semibold underline"
              >
                Receber um link novo para criar a senha
              </Link>{" "}
              e abra só o e-mail mais recente: cada link novo cancela os anteriores.
            </Aviso>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-apoio font-medium">
              E-mail
            </label>
            <CampoComIcone
              icone={Mail}
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
            <CampoComIcone
              icone={Lock}
              id="password"
              type={verSenha ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              acao={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-control"
                  onClick={() => setVerSenha((v) => !v)}
                  className="text-ink-3"
                >
                  {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  {/* ⚠️ Texto, e não `aria-label`: `getByLabel("Senha")` dos
                      testes de login casa aria-label por pedaço, e "Mostrar
                      senha" viraria um segundo alvo. */}
                  <span className="sr-only">
                    {verSenha ? "Ocultar senha" : "Mostrar senha"}
                  </span>
                </Button>
              }
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

          <div className="space-y-2 border-t border-line pt-4 text-center">
            <p className="text-apoio text-ink-2">Ainda não tem conta?</p>
            <Button
              asChild
              variant="outline"
              size="field"
              className="w-full justify-center max-md:h-11"
            >
              <Link href="/cadastro">Criar conta grátis</Link>
            </Button>
            <p className="text-legenda text-ink-2">7 dias para testar</p>
          </div>
        </form>

        <p className="text-center text-legenda text-ink-2">
          Precisa de ajuda?{" "}
          <a
            href={AJUDA_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-ink hover:underline"
          >
            Fale com a gente no WhatsApp
          </a>
        </p>
      </main>
      <PainelMarca />
    </div>
  );
}
