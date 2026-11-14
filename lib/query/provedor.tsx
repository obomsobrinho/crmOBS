"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { criarClienteDeDados } from "./cliente";

function Cliente({ children }: { children: React.ReactNode }) {
  // `useState` e não um módulo: um cliente por montagem, nunca compartilhado.
  const [qc] = useState(criarClienteDeDados);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/**
 * O provedor do cliente de dados (docs/plano-dados-e-estado.md, 2.4). A `key` é
 * a identidade (usuário e empresa): quando ela muda, o React monta um cliente
 * novo e o cache da conta anterior some junto, sem depender de ninguém lembrar
 * de limpar.
 */
export function ProvedorDeDados({
  identidade,
  children,
}: {
  identidade: string;
  children: React.ReactNode;
}) {
  return <Cliente key={identidade}>{children}</Cliente>;
}
