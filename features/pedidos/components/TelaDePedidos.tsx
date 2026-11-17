"use client";

import { useSessao } from "@/lib/sessao";
import { fonteDoNavegador } from "../api/navegador";
import Pedidos from "./Pedidos";

/**
 * Pedidos na página de verdade: a sessão vem do layout (D8, sem banco no clique) e
 * os dados, do banco pelo navegador (RLS). Conta bloqueada vê a fila e não age, como
 * antes (`getMyClient` e não `requireActiveTenant`, decisão do dono): as rotas de
 * orientar e resolver respondem 402.
 */
export default function TelaDePedidos() {
  const s = useSessao();
  return (
    <Pedidos
      fonte={fonteDoNavegador(s.clientId)}
      clientId={s.clientId}
      numeroAvisos={s.avisos}
      readOnly={s.access.blocked}
      dono={s.papel === "dono"}
    />
  );
}
