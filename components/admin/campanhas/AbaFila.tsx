"use client";

import { memo, useState } from "react";
import { CalendarClock, Inbox, Undo2 } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Textarea } from "@/components/ui/textarea";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { diaMesHoraSP } from "@/lib/fuso";
import {
  ROTULO_DO_ANGULO,
  anguloDaAbordagem,
  camposDoLead,
  modeloDoToque,
  encaixarNaJanela,
  sortearPausaMs,
  textoDaJanela,
  textoDoToque,
  type ItemDaFila,
} from "@/lib/prospeccao";
import { SeloDaPontuacao } from "./pecas";
import type { ConexaoDisponivel, ConfigDaCampanha, LeadDaCampanha } from "./tipos";

// A FILA DO DIA: o que o sistema propõe mandar hoje (toques de acompanhamento
// vencidos primeiro, depois os escolhidos pela pontuação, até o teto). O dono
// lê, edita, pula ou aprova; só o aprovado sai, um por vez, com pausa sorteada.

function AbaFila({
  fila,
  leads,
  config,
  numero,
  teto,
  agora,
  irParaLeads,
}: {
  fila: ItemDaFila[];
  leads: LeadDaCampanha[];
  config: ConfigDaCampanha;
  /** A conexão escolhida na campanha; null = nenhuma escolhida, nada sai. */
  numero: ConexaoDisponivel | null;
  teto: number;
  agora: number;
  irParaLeads: () => void;
}) {
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [aprovados, setAprovados] = useState<Record<string, number>>({});
  const [pulados, setPulados] = useState<Set<string>>(new Set());

  const itens = fila
    .filter((f) => !pulados.has(f.id))
    .map((f) => {
      const lead = leads.find((l) => l.id === f.id)!;
      const angulo = anguloDaAbordagem(lead.sinais, config.ofertas);
      const pronto = textoDoToque(
        modeloDoToque(config.textos, f.toque, angulo.angulo),
        camposDoLead(lead, config.voz),
        f.toque,
        config.saida,
      );
      const texto = editados[f.id] ?? pronto.texto;
      // Campo que o dono já resolveu à mão deixa de faltar.
      const faltando = pronto.faltando.filter((c) => texto.includes(`{${c}}`));
      return { ...f, lead, texto, faltando, angulo };
    });

  const pausa: [number, number] = [config.pausaMinutos[0] * 60_000, config.pausaMinutos[1] * 60_000];

  function aprovar(ids: string[]) {
    setAprovados((atual) => {
      const novo = { ...atual };
      // O próximo horário sai depois do último já marcado, com a pausa sorteada (só atrasa).
      let ultimo = Math.max(agora, ...Object.values(atual));
      for (const id of ids) {
        if (novo[id] !== undefined) continue;
        // Encaixa antes e depois da pausa: nada sai na abertura exata da janela nem depois dela.
        ultimo = encaixarNaJanela(encaixarNaJanela(ultimo, config.janela) + sortearPausaMs(pausa), config.janela);
        novo[id] = ultimo;
      }
      return novo;
    });
  }

  function desfazer(id: string) {
    setAprovados((atual) => {
      const novo = { ...atual };
      delete novo[id];
      return novo;
    });
  }

  const prontosParaAprovar = itens.filter((i) => aprovados[i.id] === undefined && i.faltando.length === 0);
  const restam = numero ? Math.max(0, teto - numero.enviadasHoje) : 0;

  return (
    <AreaRolavel tamanho={DISSOLVER_LISTA} className="h-full">
      <div className="flex flex-col gap-3 px-4 py-4 md:px-5">
        {numero ? (
          <Aviso tom="neutro" icone={CalendarClock} data-slot="fila-ritmo">
            Envia pelo WhatsApp de {numero.nome} ({numero.conectado ? "conectado" : "desconectado"}): teto de{" "}
            <strong>{teto} por dia</strong>, acompanhamentos incluídos. {numero.enviadasHoje}{" "}
            {numero.enviadasHoje === 1 ? "enviada" : "enviadas"} hoje, {restam === 1 ? "resta 1" : `restam ${restam}`}.
            Envios de {textoDaJanela(config.janela)}, com pausa sorteada de {config.pausaMinutos[0]} a{" "}
            {config.pausaMinutos[1]} minutos.
          </Aviso>
        ) : (
          <Aviso tom="warn" icone={CalendarClock} data-slot="fila-sem-numero">
            Escolha o número que envia na aba Campanha. Sem número, nada sai.
          </Aviso>
        )}

        {itens.length === 0 ? (
          <EstadoVazio
            data-slot="fila-vazia"
            icone={Inbox}
            titulo="Nada para hoje"
            texto={
              !numero
                ? "A fila aparece quando a campanha tiver um número que envia."
                : restam === 0
                ? "O teto de hoje já foi usado. Amanhã a fila volta."
                : "Nenhum acompanhamento vencido e nenhum lead escolhido esperando. Escolha empresas em Leads."
            }
          >
            {restam > 0 && (
              <Button variant="outline" size="control" className="mt-2" onClick={irParaLeads}>
                Escolher leads
              </Button>
            )}
          </EstadoVazio>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-apoio text-ink-2">
                {itens.length} {itens.length === 1 ? "mensagem proposta" : "mensagens propostas"} para hoje. Nada sai
                sem aprovação.
              </p>
              {prontosParaAprovar.length > 1 && (
                <Button
                  variant="brand"
                  size="control"
                  className="ml-auto"
                  data-slot="fila-aprovar-todas"
                  onClick={() => aprovar(prontosParaAprovar.map((i) => i.id))}
                >
                  Aprovar {prontosParaAprovar.length === itens.length ? "todas" : `as ${prontosParaAprovar.length} prontas`}
                </Button>
              )}
            </div>
            <ul className="flex flex-col gap-3" data-slot="fila-lista">
              {itens.map((i) => {
                const sai = aprovados[i.id];
                return (
                  <li key={i.id}>
                    <Card variant="secao" data-slot="fila-item" data-aprovado={sai !== undefined ? "sim" : "nao"}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-cartao">{i.lead.nome}</span>
                        <Badge variant={i.toque === 1 ? "contorno" : "dia"}>
                          {i.toque === 1 ? "Primeira mensagem" : `${i.toque}º toque`}
                        </Badge>
                        <SeloDaPontuacao sinais={i.lead.sinais} />
                        <span className="text-legenda text-ink-3">
                          {i.lead.segmento}, {i.lead.bairro}
                        </span>
                      </div>
                      <p className="mt-1 text-apoio text-ink-2" data-slot="fila-angulo">
                        <span className="font-semibold text-ink">
                          {i.angulo.temGancho ? `Oferta: ${ROTULO_DO_ANGULO[i.angulo.angulo]}.` : "Sem gancho claro."}
                        </span>{" "}
                        {i.angulo.porque}.
                      </p>
                      <Textarea
                        className="mt-3 min-h-28"
                        aria-label={`Mensagem para ${i.lead.nome}`}
                        value={i.texto}
                        disabled={sai !== undefined}
                        onChange={(e) => setEditados((a) => ({ ...a, [i.id]: e.target.value }))}
                      />
                      {i.faltando.length > 0 && (
                        <Aviso tom="warn" className="mt-2" data-slot="fila-faltando">
                          Falta o dado {i.faltando.map((c) => `{${c}}`).join(", ")} para esta empresa. Escreva à mão no
                          texto ou pule.
                        </Aviso>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {sai !== undefined ? (
                          <>
                            <Badge variant="estado-bom" data-slot="fila-horario">
                              Aprovada, sai por volta de {diaMesHoraSP(sai)}
                            </Badge>
                            <Button variant="outline" size="control" className="ml-auto" onClick={() => desfazer(i.id)}>
                              <Undo2 size={14} />
                              Desfazer
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="control"
                              className="ml-auto"
                              onClick={() => setPulados((p) => new Set(p).add(i.id))}
                            >
                              Pular hoje
                            </Button>
                            <Button
                              variant="brand"
                              size="control"
                              disabled={i.faltando.length > 0}
                              onClick={() => aprovar([i.id])}
                            >
                              Aprovar
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </AreaRolavel>
  );
}

export default memo(AbaFila);
