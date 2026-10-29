"use client";

import { memo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import { CADENCIA_PROVISORIA, LINHA_DE_SAIDA, camposDoLead, textoDaJanela, textoDoToque } from "@/lib/prospeccao";
import type { ConfigDaCampanha, LeadDaCampanha } from "./tipos";

// CAMPANHA: os textos de cada toque (com campos entre chaves e a prévia com um
// lead de verdade da lista), a cadência, os limites e a base legal. A linha de
// saída entra sozinha na primeira mensagem e não se edita (D8).

const TOQUES = ["Primeira mensagem", "Segundo toque, se não responder", "Terceiro toque, despedida"];

function AbaCampanha({
  config,
  aoSalvar,
  exemplo,
}: {
  config: ConfigDaCampanha;
  aoSalvar: (c: ConfigDaCampanha) => void;
  exemplo: LeadDaCampanha | null;
}) {
  const [rascunho, setRascunho] = useState(config);
  const [recado, setRecado] = useState<string | null>(null);
  const semBaseLegal = rascunho.baseLegalRef.trim().length < 3;
  const tetoValido = Number.isInteger(rascunho.tetoDiario) && rascunho.tetoDiario >= 1 && rascunho.tetoDiario <= 50;
  const [pMin, pMax] = rascunho.pausaMinutos;
  const pausaValida = pMin >= 1 && pMax >= pMin;

  function mudar(p: Partial<ConfigDaCampanha>) {
    setRascunho((r) => ({ ...r, ...p }));
    setRecado(null);
  }

  function mudarTexto(i: number, t: string) {
    const textos = [...rascunho.textos] as ConfigDaCampanha["textos"];
    textos[i] = t;
    mudar({ textos });
  }

  return (
    <AreaRolavel tamanho={DISSOLVER_PADRAO} className="h-full">
      <form
        className="flex max-w-3xl flex-col gap-4 px-4 py-4 md:px-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          aoSalvar(rascunho);
          setRecado("Prévia: salvo só nesta página, nada foi gravado.");
        }}
      >
        <Card variant="secao">
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-0 flex-1">
              <span className="text-rotulo uppercase text-ink-3">Nome da campanha</span>
              <Input className="mt-1" value={rascunho.nome} onChange={(e) => mudar({ nome: e.target.value })} />
            </label>
            <Switch
              checked={rascunho.ativa}
              disabled={semBaseLegal && !rascunho.ativa}
              onCheckedChange={(v) => mudar({ ativa: v })}
              aria-label="Campanha ativa"
              className="flex items-center gap-2 self-end text-apoio"
            >
              <span className={rascunho.ativa ? "text-ink" : "text-ink-3"}>{rascunho.ativa ? "Ativa" : "Pausada"}</span>
              <SwitchTrack checked={rascunho.ativa}>
                <SwitchThumb checked={rascunho.ativa} />
              </SwitchTrack>
            </Switch>
          </div>
          <label className="mt-3 block">
            <span className="text-rotulo uppercase text-ink-3">Base legal (avaliação de legítimo interesse)</span>
            <Input
              className="mt-1"
              placeholder="Onde está a sua avaliação, por exemplo o link do documento"
              value={rascunho.baseLegalRef}
              onChange={(e) => mudar({ baseLegalRef: e.target.value })}
            />
          </label>
          {semBaseLegal && (
            <Aviso tom="warn" icone={ShieldCheck} className="mt-2" data-slot="campanha-sem-base-legal">
              Sem a avaliação de legítimo interesse (LGPD) a campanha não começa. O modelo simplificado está no guia da
              ANPD (anexo II).
            </Aviso>
          )}
        </Card>

        {rascunho.textos.map((t, i) => {
          const previa = exemplo ? textoDoToque(t, camposDoLead(exemplo), i + 1) : null;
          return (
            <Card variant="secao" key={i} data-slot="campanha-toque">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-cartao">{TOQUES[i]}</h2>
                <span className="text-legenda text-ink-3">
                  {CADENCIA_PROVISORIA[i] === 0 ? "dia 0" : `dia ${CADENCIA_PROVISORIA[i]}`}
                </span>
              </div>
              <Textarea
                className="mt-2 min-h-24"
                aria-label={TOQUES[i]}
                value={t}
                onChange={(e) => mudarTexto(i, e.target.value)}
              />
              {i === 0 && (
                <p className="mt-1.5 text-legenda text-ink-3">
                  No fim entra sempre, sem edição: “{LINHA_DE_SAIDA}”
                </p>
              )}
              {previa && (
                <div className="mt-3">
                  <p className="text-rotulo uppercase text-ink-3">Como fica para {exemplo?.nome}</p>
                  <p className="mt-1 whitespace-pre-line rounded-lg border border-line-soft bg-raised px-3 py-2 text-apoio text-ink-2">
                    {previa.texto}
                  </p>
                  {previa.faltando.length > 0 && (
                    <p className="mt-1 text-legenda text-warn-ink">
                      Esta empresa não tem {previa.faltando.map((c) => `{${c}}`).join(", ")}: a fila pede para completar
                      à mão.
                    </p>
                  )}
                </div>
              )}
            </Card>
          );
        })}

        <Card variant="secao">
          <h2 className="text-cartao">Limites</h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            Valores de partida, não medidos. Na primeira semana do número o teto fica em 5 por dia, seja qual for o valor
            aqui.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label>
              <span className="text-rotulo uppercase text-ink-3">Máximo por dia</span>
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={50}
                value={rascunho.tetoDiario}
                onChange={(e) => mudar({ tetoDiario: Number(e.target.value) })}
              />
            </label>
            <label>
              <span className="text-rotulo uppercase text-ink-3">Pausa mínima (min)</span>
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={pMin}
                onChange={(e) => mudar({ pausaMinutos: [Number(e.target.value), pMax] })}
              />
            </label>
            <label>
              <span className="text-rotulo uppercase text-ink-3">Pausa máxima (min)</span>
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={pMax}
                onChange={(e) => mudar({ pausaMinutos: [pMin, Number(e.target.value)] })}
              />
            </label>
          </div>
          <p className="mt-3 text-apoio text-ink-2">
            Envios de {textoDaJanela(rascunho.janela)}, horário de São Paulo. Até 3 mensagens por empresa; qualquer resposta, SAIR ou falha encerra a sequência.
          </p>
          {(!tetoValido || !pausaValida) && (
            <Aviso tom="warn" className="mt-2">
              {!tetoValido ? "O máximo por dia vai de 1 a 50." : "A pausa máxima precisa ser maior ou igual à mínima."}
            </Aviso>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="brand" size="control" disabled={!tetoValido || !pausaValida}>
            Salvar campanha
          </Button>
          {recado && (
            <p role="status" className="text-legenda text-ink-3">
              {recado}
            </p>
          )}
        </div>
      </form>
    </AreaRolavel>
  );
}

export default memo(AbaCampanha);
