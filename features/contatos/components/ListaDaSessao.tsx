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
  // Uma conferência das fotos ao abrir a tela, como o layout fazia no servidor. Não é
  // leitura de dado (a regra "efeito não busca" é sobre isso): é um aviso ao servidor,
  // fogo e esquece, sem resposta que a tela use, e limitado a um a cada 10 minutos.
  useEffect(() => {
    if (s.temWhatsapp) pedirConferenciaDasFotos();
  }, [s.temWhatsapp]);
  return <ListaClientes clientId={s.clientId} numeroAvisos={s.avisos} podeCadastrar={!s.access.blocked} />;
}
