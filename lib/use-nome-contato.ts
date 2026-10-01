"use client";

import { useEffect, useRef, useState } from "react";
import { ouvirContato } from "@/lib/contato-bus";

/**
 * O nome que a tela mostra para um contato, corrigido NA HORA quando alguém o
 * renomeia nesta aba (R-15, `lib/contato-bus.ts`), sem `router.refresh()`.
 *
 * `nome` é o que o servidor resolveu ao montar a página; `nomeBase` é o que ele
 * resolveria SEM o apelido (pushName do WhatsApp, ou o melhor nome das
 * mensagens), usado quando o apelido é apagado. Quando o servidor manda outro
 * `nome` (outra conversa, ou uma atualização), ele vence o que estava aqui.
 */
export function useNomeDoContato(
  phone: string,
  nome: string | null,
  nomeBase: string | null
): string | null {
  const [local, setLocal] = useState<{ phone: string; nome: string | null } | null>(null);
  const [nomeVisto, setNomeVisto] = useState(nome);
  if (nomeVisto !== nome) {
    setNomeVisto(nome);
    setLocal(null);
  }

  const baseRef = useRef(nomeBase);
  useEffect(() => {
    baseRef.current = nomeBase;
  });

  useEffect(
    () =>
      ouvirContato((d) => {
        if (d.phone !== phone || d.nome === undefined) return;
        setLocal({ phone, nome: d.nome ?? baseRef.current });
      }),
    [phone]
  );

  return local && local.phone === phone ? local.nome : nome;
}
