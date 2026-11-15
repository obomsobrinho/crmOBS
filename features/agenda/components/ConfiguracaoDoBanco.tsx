"use client";

import { useMemo } from "react";
import ConfiguracaoDaAgenda from "./ConfiguracaoDaAgenda";
import { fonteDaAgendaDoNavegador } from "@/features/agenda/api/navegador";

// As configurações da agenda com a fonte do BANCO, montada no navegador.
export default function ConfiguracaoDoBanco({
  clientId,
  ...props
}: Omit<React.ComponentProps<typeof ConfiguracaoDaAgenda>, "fonte"> & { clientId: string }) {
  const fonte = useMemo(() => fonteDaAgendaDoNavegador(clientId, null), [clientId]);
  return <ConfiguracaoDaAgenda fonte={fonte} {...props} />;
}
