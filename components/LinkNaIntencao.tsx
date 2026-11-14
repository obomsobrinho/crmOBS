"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Link que só pré-carrega na INTENÇÃO (decisão do dono, 14/11/2026, D9 de
 * docs/plano-dados-e-estado.md): mouse em cima, toque ou foco do teclado. Um item
 * de menu visível não carrega nada sozinho; quem está em Conversas não traz a
 * Agenda nem o Painel.
 *
 * O gesto chama `router.prefetch` (a forma manual da doc do Next 16, guia de
 * prefetching). Medido em 14/11/2026 no build de produção: trocar o `prefetch` do
 * `Link` de `false` para `null` no hover baixava a rota mas o clique não usava, e
 * a moldura não aparecia; com `router.prefetch` ela aparece em 83 ms com a
 * navegação atrasada 3 s.
 *
 * `aoPretender`: o que mais vale adiantar no mesmo gesto (a primeira página da
 * consulta principal da tela, 2.4).
 */
export default function LinkNaIntencao({
  aoPretender,
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...props
}: React.ComponentProps<typeof Link> & { aoPretender?: () => void }) {
  const router = useRouter();
  const feito = useRef(false);
  const pretender = () => {
    if (feito.current) return;
    feito.current = true;
    if (typeof props.href === "string") router.prefetch(props.href);
    aoPretender?.();
  };
  return (
    <Link
      {...props}
      prefetch={false}
      onMouseEnter={(e) => {
        pretender();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        pretender();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        pretender();
        onFocus?.(e);
      }}
    />
  );
}
