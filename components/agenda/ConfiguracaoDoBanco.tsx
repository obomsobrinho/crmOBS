"use client";

import { useMemo } from "react";
import ConfiguracaoDaAgenda from "./ConfiguracaoDaAgenda";
import { createClient } from "@/lib/supabase/client";
import { fonteDoBancoAgenda } from "@/lib/agenda-fonte";

// As configurações da agenda com a fonte do BANCO, montada no navegador.
export default function ConfiguracaoDoBanco({
  clientId,
  ...props
}: Omit<React.ComponentProps<typeof ConfiguracaoDaAgenda>, "fonte"> & { clientId: string }) {
  const fonte = useMemo(() => fonteDoBancoAgenda(createClient(), clientId), [clientId]);
  return <ConfiguracaoDaAgenda fonte={fonte} {...props} />;
}
