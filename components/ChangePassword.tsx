"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCelular } from "@/lib/useCelular";

// Troca de senha de quem já está logado. Fala com o Supabase Auth direto do
// browser: nenhuma senha passa pelo nosso servidor nem é gravada por nós.
//
// A senha atual é conferida antes (signInWithPassword com o mesmo e-mail) porque
// updateUser NÃO pede a senha antiga: sem essa checagem, quem senta na máquina
// com a sessão aberta troca a senha do dono e toma a conta.
const MIN = 8;

export default function ChangePassword({ email }: { email: string }) {
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [nova2, setNova2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const celular = useCelular();

  function limpar() {
    setAtual("");
    setNova("");
    setNova2("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);

    if (nova.length < MIN) {
      setError(`A nova senha precisa de ao menos ${MIN} caracteres.`);
      return;
    }
    if (nova !== nova2) {
      setError("As senhas não conferem.");
      return;
    }
    if (nova === atual) {
      setError("A nova senha precisa ser diferente da atual.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: atual,
    });
    if (authErr) {
      setError("A senha atual está incorreta.");
      setLoading(false);
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: nova });
    if (updErr) {
      setError("Não foi possível trocar a senha. Tente de novo.");
      setLoading(false);
      return;
    }

    limpar();
    setOk(true);
    setAberto(false);
    setLoading(false);
  }

  function fechar() {
    setAberto(false);
    setError(null);
    limpar();
  }

  const formulario = (
    <FormularioSenha
      onSubmit={handleSubmit}
      atual={atual}
      setAtual={setAtual}
      nova={nova}
      setNova={setNova}
      nova2={nova2}
      setNova2={setNova2}
      error={error}
      loading={loading}
      onCancelar={fechar}
      naFolha={celular}
    />
  );

  // CELULAR (plano do mobile, fase 2): o formulário abre numa FOLHA de baixo, e
  // não no lugar do botão. Três campos de senha no meio de uma página rolável
  // somem atrás do teclado; na folha eles ficam juntos, acima dele.
  if (!aberto || celular) {
    return (
      <>
      <div className="max-w-xl">
        <Button
          variant="outline"
          size="field"
          onClick={() => {
            setAberto(true);
            setOk(false);
          }}
          className="bg-bloco"
        >
          <KeyRound size={15} className="text-brand-ink" />
          Trocar minha senha
        </Button>
        {ok && (
          <p className="mt-2 text-apoio text-human-ink">
            Senha trocada com sucesso.
          </p>
        )}
      </div>
      {celular && (
        <Sheet open={aberto} onOpenChange={(v) => (v ? setAberto(true) : fechar())}>
          <SheetContent lado="baixo" aria-describedby={undefined}>
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden />
            <SheetTitle className="sr-only">Trocar minha senha</SheetTitle>
            <div className="overflow-y-auto p-4">{formulario}</div>
          </SheetContent>
        </Sheet>
      )}
      </>
    );
  }

  return formulario;
}

function FormularioSenha({
  onSubmit,
  atual,
  setAtual,
  nova,
  setNova,
  nova2,
  setNova2,
  error,
  loading,
  onCancelar,
  naFolha,
}: {
  onSubmit: (e: React.FormEvent) => void;
  atual: string;
  setAtual: (v: string) => void;
  nova: string;
  setNova: (v: string) => void;
  nova2: string;
  setNova2: (v: string) => void;
  error: string | null;
  loading: boolean;
  onCancelar: () => void;
  /** Dentro da folha do celular: sem moldura própria, a folha já é a moldura. */
  naFolha: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={
        naFolha
          ? "space-y-4"
          : "max-w-xl space-y-4 rounded-xl border border-line bg-bloco p-4"
      }
    >
      <div className="flex items-center gap-2">
        <KeyRound size={15} className="text-brand-ink" />
        <h2 className="text-corpo font-semibold">Trocar minha senha</h2>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-atual" className="text-apoio font-medium">
          Senha atual
        </label>
        <Input
          id="pw-atual"
          type="password"
          autoComplete="current-password"
          required
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-nova" className="text-apoio font-medium">
          Nova senha
        </label>
        <Input
          id="pw-nova"
          type="password"
          autoComplete="new-password"
          required
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
        <p className="text-legenda text-ink-2">Pelo menos {MIN} caracteres.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-nova2" className="text-apoio font-medium">
          Repita a nova senha
        </label>
        <Input
          id="pw-nova2"
          type="password"
          autoComplete="new-password"
          required
          value={nova2}
          onChange={(e) => setNova2(e.target.value)}
        />
      </div>

      {error && <p className="text-apoio text-danger-ink">{error}</p>}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="field"
          carregando={loading}
        >
          {loading ? "Salvando…" : "Salvar nova senha"}
        </Button>
        <Button
          variant="outline"
          size="field"
          type="button"
          onClick={onCancelar}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
