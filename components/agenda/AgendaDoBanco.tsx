"use client";

import { useMemo } from "react";
import Agenda, { type PropsAgenda } from "./Agenda";
import { createClient } from "@/lib/supabase/client";
import { fonteDoBancoAgenda } from "@/lib/agenda-fonte";

// A tela da agenda com a fonte do BANCO, montada no navegador (função não
// atravessa a fronteira servidor/cliente). O preview usa `Agenda` com a memória.
export default function AgendaDoBanco({ clientId, ...props }: Omit<PropsAgenda, "fonte"> & { clientId: string }) {
  const fonte = useMemo(() => fonteDoBancoAgenda(createClient(), clientId), [clientId]);
  return <Agenda fonte={fonte} {...props} />;
}
