"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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

  if (!aberto) {
    return (
      <div className="max-w-xl">
        <button
          onClick={() => {
            setAberto(true);
            setOk(false);
          }}
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium transition-colors hover:border-line-strong"
        >
          <KeyRound size={15} className="text-accent" />
          Trocar minha senha
        </button>
        {ok && (
          <p className="mt-2 text-sm text-ia">Senha trocada com sucesso.</p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-4 rounded-xl border border-line bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <KeyRound size={15} className="text-accent" />
        <h2 className="text-sm font-medium">Trocar minha senha</h2>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-atual" className="text-sm font-medium">
          Senha atual
        </label>
        <input
          id="pw-atual"
          type="password"
          autoComplete="current-password"
          required
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-nova" className="text-sm font-medium">
          Nova senha
        </label>
        <input
          id="pw-nova"
          type="password"
          autoComplete="new-password"
          required
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
        />
        <p className="text-xs text-ink-muted">Pelo menos {MIN} caracteres.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="pw-nova2" className="text-sm font-medium">
          Repita a nova senha
        </label>
        <input
          id="pw-nova2"
          type="password"
          autoComplete="new-password"
          required
          value={nova2}
          onChange={(e) => setNova2(e.target.value)}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60"
        >
          {loading ? "Salvando…" : "Salvar nova senha"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setError(null);
            limpar();
          }}
          className="rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
