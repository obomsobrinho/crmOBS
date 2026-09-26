"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import { createClient } from "@/lib/supabase/client";

// Fecha o link de e-mail que chega no FLUXO IMPLÍCITO (convite do cadastro e da
// equipe, recuperação de senha), com a sessão depois do `#`:
// `#access_token=...&refresh_token=...&type=invite`.
//
// ⚠️ Existe porque `/auth/confirm` roda no servidor e o navegador nunca manda o
// `#` para lá. Ela redireciona para cá, o `#` vem junto (redirecionamento sem
// fragmento próprio herda o do endereço original), e aqui, no navegador, a
// sessão vira cookie pelo `setSession`. Depois segue para `next`, que no
// convite é `/definir-senha`.
//
// O `#` é apagado da barra de endereço antes de qualquer outra coisa: ele é uma
// sessão válida, e não pode ficar no histórico nem ser copiado junto com o link.
export default function ConcluirLink() {
  const router = useRouter();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const busca = new URLSearchParams(window.location.search);
    window.history.replaceState(null, "", window.location.pathname);

    const nextParam = busca.get("next") ?? "/";
    // Só caminho da mesma origem: `//outro.site` seria redirecionamento aberto.
    const next =
      nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) {
      router.replace("/login?erro=convite");
      return;
    }

    void createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then((r: { error: unknown }) => {
        if (r.error) console.error("setSession falhou:", r.error);
        router.replace(r.error ? "/login?erro=convite" : next);
      });
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas p-4">
      <BrandMark />
      <p className="text-apoio text-ink-2">Abrindo seu acesso…</p>
    </div>
  );
}
