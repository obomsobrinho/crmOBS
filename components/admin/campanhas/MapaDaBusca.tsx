"use client";

import { numeroBR } from "@/lib/format";
import { ROTULO_NO_MAPA, type EstadoNoMapa } from "@/lib/prospeccao";
import Mapa from "./Mapa";
import type { PontoNoMapa } from "./tipos";

// O MAPA DE UMA BUSCA (revisão do dono, 30/10/2026): um pino por lead, na cor do
// estado (não contatado, bom, contatado, respondeu; descartado é um anel vazado; as
// cores são os tokens `--mapa-*` de app/globals.css), e a legenda com as contagens.
// Clicar num pino leva a tabela até o lead; "ver no mapa" na tabela destaca o pino.
// O texto de tudo isto é a tabela; o mapa é a vista. O mapa em si é `Mapa`, o mesmo
// da "Nova busca".

export const ESTADOS_NO_MAPA: EstadoNoMapa[] = ["nao_contatado", "bom", "contatado", "respondeu", "descartado"];

export default function MapaDaBusca({
  pontos,
  destaque,
  centralizar,
  aoEscolher,
}: {
  pontos: PontoNoMapa[];
  destaque: string | null;
  centralizar: boolean;
  aoEscolher: (id: string) => void;
}) {
  const contagem = (e: EstadoNoMapa) => pontos.filter((p) => p.estado === e).length;
  return (
    <div className="flex flex-col gap-3">
      <Mapa
        pontos={pontos}
        destaque={destaque}
        centralizar={centralizar}
        aoEscolher={aoEscolher}
        rotulo={`Mapa com ${numeroBR(pontos.length)} leads desta busca`}
        className="h-80"
        data-slot="busca-mapa"
        data-pinos={pontos.length}
      />
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-legenda text-ink-2" data-slot="busca-mapa-legenda">
        {ESTADOS_NO_MAPA.map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span aria-hidden className={`legenda-do-mapa pino-${e} size-2.5 rounded-full`} />
            {ROTULO_NO_MAPA[e]}
            <span className="tabular-nums text-ink-3">{numeroBR(contagem(e))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
