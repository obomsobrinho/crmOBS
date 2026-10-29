"use client";

import { useMemo } from "react";
import CentralDeCampanhas from "@/components/admin/campanhas/CentralDeCampanhas";
import type { AbaDeCampanhas } from "@/components/admin/campanhas/tipos";
import { CONEXOES_DE_MENTIRA, CONFIG_DE_MENTIRA, buscarDeMentira, leadsDeMentira } from "./dados";

// A ponte do preview: a busca de mentira é uma função, e função não atravessa do
// servidor para o navegador, então os dados de mentira entram aqui.
export default function PreviaDeCampanhas({
  aba,
  agora,
  vazia,
}: {
  aba: AbaDeCampanhas;
  agora: number;
  vazia: boolean;
}) {
  const leads = useMemo(() => (vazia ? [] : leadsDeMentira(agora)), [vazia, agora]);
  return (
    <CentralDeCampanhas
      abaInicial={aba}
      agora={agora}
      leadsIniciais={leads}
      config={CONFIG_DE_MENTIRA}
      conexoes={vazia ? CONEXOES_DE_MENTIRA.map((c) => ({ ...c, enviadasHoje: 0 })) : CONEXOES_DE_MENTIRA}
      buscar={buscarDeMentira}
    />
  );
}
