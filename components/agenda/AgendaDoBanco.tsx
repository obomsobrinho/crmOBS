"use client";

import { useMemo } from "react";
import Agenda, { type PropsAgenda } from "./Agenda";
import { createClient } from "@/lib/supabase/client";
import { fonteDoBancoAgenda } from "@/lib/agenda-fonte";
import { foraDaLista } from "@/lib/inbox-lista";

// A tela da agenda com a fonte do BANCO, montada no navegador (função não
// atravessa a fronteira servidor/cliente). O preview usa `Agenda` com a memória.
// A busca de contatos deixa de fora o número de avisos (`foraDaLista`).
export default function AgendaDoBanco({
  clientId,
  numeroAvisos,
  ...props
}: Omit<PropsAgenda, "fonte"> & { clientId: string; numeroAvisos: string | null }) {
  const fonte = useMemo(
    () => fonteDoBancoAgenda(createClient(), clientId, foraDaLista(numeroAvisos)),
    [clientId, numeroAvisos]
  );
  return <Agenda fonte={fonte} {...props} />;
}
