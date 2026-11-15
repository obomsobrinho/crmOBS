"use client";

import { useEffect } from "react";
import { useSessao } from "@/lib/sessao";
import { pedirConferenciaDasFotos } from "../api/navegador";
import ListaClientes from "./ListaClientes";

/**
 * A lista de Contatos na página de verdade: a sessão vem do layout do `(app)` (D8, sem
 * banco no clique). Conta bloqueada vê em leitura e não cadastra, como antes.
 */
export default function ListaDaSessao() {
  const s = useSessao();
  // Uma conferência das fotos por visita à tela, como o layout fazia no servidor.
  useEffect(() => {
    if (s.temWhatsapp) pedirConferenciaDasFotos();
  }, [s.temWhatsapp]);
  return <ListaClientes clientId={s.clientId} numeroAvisos={s.avisos} podeCadastrar={!s.access.blocked} />;
}
