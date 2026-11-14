"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessao } from "@/lib/sessao";

/** Para onde vai quem não pode ver a tela, na ordem em que se confere. */
export function destinoDaGuarda(
  s: { contaDesativada: boolean; access: { blocked: boolean }; papel: string | null },
  exige: { ativa?: boolean; dono?: boolean }
): string | null {
  if (s.contaDesativada) return "/conta-desativada";
  if (exige.ativa && s.access.blocked) return "/assinatura";
  if (exige.dono && s.papel !== "dono") return "/inbox";
  return null;
}

/**
 * A guarda de uma tela de área migrada (D8, docs/plano-dados-e-estado.md 2.3): decide
 * no navegador, com a sessão que o layout já leu, sem ir ao banco no clique.
 * Enquanto redireciona não desenha a tela. A trava dos DADOS é o RLS e a das
 * escritas é `sessaoDaRota`; isto só leva a pessoa ao lugar certo.
 *
 * Mesmas regras de `requireActiveTenant` (`ativa`) e das telas do dono (`dono`).
 */
export default function GuardaDaTela({
  ativa = false,
  dono = false,
  children,
}: {
  ativa?: boolean;
  dono?: boolean;
  children: React.ReactNode;
}) {
  const sessao = useSessao();
  const router = useRouter();
  const destino = destinoDaGuarda(sessao, { ativa, dono });
  useEffect(() => {
    if (destino) router.replace(destino);
  }, [destino, router]);
  return destino ? null : children;
}
