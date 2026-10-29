"use client";

import { memo } from "react";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Medidor } from "@/components/ui/medidor";
import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import { Indicador } from "@/components/admin/pecas";
import { diaMesHoraSP } from "@/lib/fuso";
import { resumoDaCampanha, textoDaJanela } from "@/lib/prospeccao";
import { SeloDaSituacao } from "./pecas";
import type { ConfigDaCampanha, LeadDaCampanha, NumeroDaProspeccao } from "./tipos";

// RESULTADOS: o que a campanha fez desde o início (contado pelo que aconteceu com
// cada lead, `resumoDaCampanha`), a saúde do número e as respostas recentes. A
// taxa de "pediu para sair" é o sinal de bloqueio que mais importa.

const LEGENDA = "Desde o início da campanha";

function taxa(v: number | null): string {
  return v === null ? "Sem abordagens ainda" : `${v}% dos abordados`;
}

function AbaResultados({
  leads,
  numero,
  teto,
  config,
}: {
  leads: LeadDaCampanha[];
  numero: NumeroDaProspeccao;
  teto: number;
  config: ConfigDaCampanha;
}) {
  const r = resumoDaCampanha(leads);
  const respostas = leads
    .filter((l) => l.respondeuEm !== null && l.ultimaResposta)
    .sort((a, b) => (b.respondeuEm ?? 0) - (a.respondeuEm ?? 0))
    .slice(0, 10);

  return (
    <AreaRolavel tamanho={DISSOLVER_PADRAO} className="h-full">
      <div className="flex flex-col gap-4 px-4 py-4 md:px-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-slot="resultados-numeros">
          <Indicador rotulo="Abordados" valor={r.abordados} frase="Receberam a primeira mensagem" legenda={LEGENDA} />
          <Indicador rotulo="Responderam" valor={r.responderam} frase={taxa(r.taxaDeResposta)} legenda={LEGENDA} />
          <Indicador
            rotulo="Pediram para sair"
            valor={r.sairam}
            frase={taxa(r.taxaDeSaida)}
            legenda={LEGENDA}
            classeDoValor={r.sairam > 0 ? "text-warn-ink" : undefined}
          />
          <Indicador rotulo="Sem WhatsApp" valor={r.semWhatsapp} frase="O número não tem WhatsApp" legenda={LEGENDA} />
          <Indicador rotulo="Cadastraram" valor={r.cadastraram} frase="Viraram teste no Atenda" legenda={LEGENDA} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card variant="secao" data-slot="resultados-respostas">
            <h2 className="text-cartao">Respostas recentes</h2>
            <p className="mt-0.5 text-legenda text-ink-3">
              Quem responde cai em Conversas da empresa de prospecção e a IA continua a conversa.
            </p>
            {respostas.length === 0 ? (
              <EstadoVazio tamanho="compacto" icone={MessageCircle} texto="Ninguém respondeu ainda." />
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line-soft">
                {respostas.map((l) => (
                  <li key={l.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-apoio font-semibold text-ink">{l.nome}</span>
                      <SeloDaSituacao situacao={l.situacao} />
                      <span className="ml-auto text-legenda text-ink-3">{diaMesHoraSP(l.respondeuEm ?? 0)}</span>
                    </div>
                    <p className="mt-0.5 text-apoio text-ink-2">“{l.ultimaResposta}”</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card variant="secao" data-slot="resultados-numero">
            <h2 className="text-cartao">Número dedicado</h2>
            <p className="mt-0.5 text-apoio text-ink-2">
              {numero.conectado ? "Conectado" : "Desconectado: a campanha pausa sozinha"}
              {numero.idadeDias !== null && `, há ${numero.idadeDias} dias`}.
            </p>
            <p className="mt-3 text-rotulo uppercase text-ink-3">Envios de hoje</p>
            <p className="mt-1 text-apoio text-ink">
              {numero.enviadasHoje} de {teto}
            </p>
            <Medidor className="mt-1.5" valor={(numero.enviadasHoje / teto) * 100} rotulo={`Envios de hoje: ${numero.enviadasHoje} de ${teto}`} />
            <p className="mt-3 text-legenda text-ink-3">
              Pausa sozinha se o número desconectar ou se muita gente pedir para sair no mesmo dia (limites a decidir).
              Janela: {textoDaJanela(config.janela)}.
            </p>
          </Card>
        </div>
      </div>
    </AreaRolavel>
  );
}

export default memo(AbaResultados);
