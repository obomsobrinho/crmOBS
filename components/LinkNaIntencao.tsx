"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import type { PrefetchOptions } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Rotas de área MIGRADA (o bloco "State" de .claude/rules/dados-estado-desempenho.md):
 * a página não lê o banco no servidor (D8), então o gesto pré-carrega a rota INTEIRA
 * (`kind: "full"`, a mesma da prop `prefetch={true}` do `Link`), e o clique abre sem
 * nenhuma requisição (B2). As outras continuam até a moldura (`loading.tsx`): um
 * pré-carregamento inteiro delas leria o banco. Campanhas fica fora (D16: lê no servidor).
 */
const PRE_CARGA_INTEIRA = new Set(["/pedidos", "/contatos"]);

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
    if (typeof props.href !== "string") return aoPretender?.();
    if (PRE_CARGA_INTEIRA.has(props.href)) {
      // O menu fica montado o dia todo: quando o Next descarta o pré-carregamento (5 min),
      // o próximo gesto pede outro.
      router.prefetch(props.href, {
        kind: "full" as PrefetchOptions["kind"],
        onInvalidate: () => {
          feito.current = false;
        },
      });
    } else router.prefetch(props.href);
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
