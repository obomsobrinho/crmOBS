"use client";

import { memo, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Medidor } from "@/components/ui/medidor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Indicador } from "@/components/admin/pecas";
import { numeroBR, plural } from "@/lib/format";
import { AMOSTRA_MINIMA_PROVISORIA, resultadoDaCampanha, type ResultadoDaCampanha } from "@/lib/prospeccao";
import { TopoDeDetalhe, textoDaTaxa } from "./pecas";
import type { Campanha } from "./tipos";

// RESULTADOS: os números de uma campanha (no detalhe dela) ou de todas (visão
// geral, com filtro). As comparações que importam: taxa de resposta por
// variante da mensagem e por hora do envio. Tudo sai de `resultadoDaCampanha`.

/** Os quatro números do topo. */
export function NumerosDoResultado({ r, legenda }: { r: ResultadoDaCampanha; legenda: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-slot="resultado-numeros">
      <Indicador
        variant="elevado"
        rotulo="Enviadas"
        valor={numeroBR(r.enviados)}
        frase={r.total > 0 ? `de ${numeroBR(r.total)} ${plural(r.total, "lead", "leads")}` : "Nenhum lead ainda"}
        legenda={legenda}
      />
      <Indicador
        variant="elevado"
        rotulo="Responderam"
        valor={numeroBR(r.responderam)}
        frase="Caíram em Conversas e a IA continuou"
        legenda={legenda}
      />
      <Indicador
        variant="elevado"
        rotulo="Taxa de resposta"
        valor={r.taxa === null ? "Sem dados" : `${r.taxa}%`}
        frase={r.taxa === null ? "Sem envios ainda" : "Das mensagens enviadas"}
        legenda={legenda}
      />
      <Indicador
        variant="elevado"
        rotulo="Pediram para parar"
        valor={numeroBR(r.pararam)}
        frase={r.falharam > 0 ? `${numeroBR(r.falharam)} ${plural(r.falharam, "envio falhou", "envios falharam")}` : "Fora de toda lista futura"}
        legenda={legenda}
        classeDoValor={r.pararam > 0 ? "text-warn-ink" : undefined}
      />
    </div>
  );
}

/** Uma linha de comparação: rótulo, barra e "3 de 9 (33%)". A maior taxa ganha a cor da marca. */
function LinhaDeTaxa({
  rotulo,
  enviados,
  responderam,
  taxa,
  melhor,
  slot,
}: {
  rotulo: string;
  enviados: number;
  responderam: number;
  taxa: number | null;
  melhor: boolean;
  slot: string;
}) {
  return (
    <li className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3" data-slot={slot} data-taxa={taxa ?? ""}>
      <span className="text-apoio text-ink-2">{rotulo}</span>
      <Medidor
        valor={taxa ?? 0}
        tom={melhor ? "marca" : "neutro"}
        rotulo={`${rotulo}: ${responderam} de ${enviados} responderam`}
      />
      <span className="min-w-[96px] text-right text-apoio tabular-nums text-ink">
        {enviados === 0 ? (
          <span className="text-ink-3">sem envios</span>
        ) : (
          <>
            {textoDaTaxa(taxa)} <span className="text-ink-3">· {responderam} de {enviados}</span>
          </>
        )}
      </span>
    </li>
  );
}

function maiorTaxa(linhas: { taxa: number | null; enviados: number }[]): number | null {
  const comEnvio = linhas.filter((l) => l.enviados > 0 && l.taxa !== null);
  return comEnvio.length < 2 ? null : Math.max(...comEnvio.map((l) => l.taxa as number));
}

function AvisoDeAmostra({ enviados }: { enviados: number }) {
  if (enviados >= AMOSTRA_MINIMA_PROVISORIA) return null;
  return (
    <p className="mt-1 text-legenda text-ink-3">
      Ainda pouco para comparar ({numeroBR(enviados)} de {AMOSTRA_MINIMA_PROVISORIA} envios). A 10 por dia, leva algumas
      semanas.
    </p>
  );
}

/** Taxa por variante e por hora do envio, lado a lado. */
export function Comparacoes({ r, variantes }: { r: ResultadoDaCampanha; variantes: string[] }) {
  const melhorVariante = maiorTaxa(r.porVariante);
  const melhorHora = maiorTaxa(r.porHoraDoEnvio);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card variant="conteudo" className="p-6" data-bloco="resultado-variantes">
        <h3 className="text-cartao text-ink">Por mensagem</h3>
        <p className="mt-0.5 text-apoio text-ink-2">Qual variante faz mais gente responder.</p>
        <AvisoDeAmostra enviados={r.enviados} />
        <ul className="mt-5 flex flex-col gap-4">
          {r.porVariante.map((v, i) => (
            <LinhaDeTaxa
              key={i}
              rotulo={`Variante ${i + 1}`}
              {...v}
              melhor={melhorVariante !== null && v.taxa === melhorVariante}
              slot="resultado-variante"
            />
          ))}
        </ul>
        {variantes.length > 0 && (
          <details className="mt-5 text-apoio text-ink-2">
            <summary className="cursor-pointer text-ink-3">Ver os textos</summary>
            <ol className="mt-2 flex flex-col gap-2">
              {variantes.map((t, i) => (
                <li key={i}>
                  <span className="font-semibold text-ink">{i + 1}.</span> {t}
                </li>
              ))}
            </ol>
          </details>
        )}
      </Card>

      <Card variant="conteudo" className="p-6" data-bloco="resultado-horas">
        <h3 className="text-cartao text-ink">Por hora do envio</h3>
        <p className="mt-0.5 text-apoio text-ink-2">
          Os envios se espalham das 8h às 18h de propósito, para esta comparação ter todas as horas.
        </p>
        <AvisoDeAmostra enviados={r.enviados} />
        <ul className="mt-5 flex flex-col gap-2.5">
          {r.porHoraDoEnvio.map((h) => (
            <LinhaDeTaxa
              key={h.hora}
              rotulo={`${h.hora}h`}
              {...h}
              melhor={melhorHora !== null && h.taxa === melhorHora}
              slot="resultado-hora"
            />
          ))}
        </ul>
        {r.porHoraDaResposta.length > 0 && (
          <p className="mt-4 text-legenda text-ink-3" data-slot="resultado-hora-resposta">
            As respostas chegaram mais às{" "}
            {[...r.porHoraDaResposta]
              .sort((a, b) => b.respostas - a.respostas)
              .slice(0, 2)
              .map((h) => `${h.hora}h`)
              .join(" e ")}
            .
          </p>
        )}
      </Card>
    </div>
  );
}

/** A visão geral: todas as campanhas que já enviaram, ou uma, pelo filtro. */
function ResultadosGerais({ campanhas, voltar }: { campanhas: Campanha[]; voltar: () => void }) {
  const comEnvio = campanhas.filter((c) => c.envios.some((e) => e.enviadoEm !== null));
  const [filtro, setFiltro] = useState<string>("todas");
  const escolhidas = filtro === "todas" ? comEnvio : comEnvio.filter((c) => c.id === filtro);
  const r = useMemo(() => resultadoDaCampanha(escolhidas.flatMap((c) => c.envios), 3), [escolhidas]);
  const variantes = escolhidas.length === 1 ? escolhidas[0].variantes : [];
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6" data-slot="resultados-gerais">
      <TopoDeDetalhe
        voltar={voltar}
        rotuloDoVoltar="Campanhas"
        titulo="Resultados"
        apoio="Somando as campanhas que já enviaram. Variante 1, 2 e 3 são a posição do texto em cada campanha."
      >
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-64" aria-label="Campanha" data-slot="resultados-filtro">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as campanhas</SelectItem>
            {comEnvio.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TopoDeDetalhe>
      <NumerosDoResultado r={r} legenda={filtro === "todas" ? "Todas as campanhas" : "Desde o início da campanha"} />
      <Comparacoes r={r} variantes={variantes} />
    </div>
  );
}

export default memo(ResultadosGerais);
