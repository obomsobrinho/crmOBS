"use client";

import { memo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import {
  CADENCIA_PROVISORIA,
  LINHA_DE_SAIDA,
  ROTULO_DO_ANGULO,
  TETO_MAXIMO_DIARIO,
  anguloDaAbordagem,
  camposDoLead,
  textoDaJanela,
  textoDoToque,
  type Angulo,
  type MomentoDaSaida,
  type Oferta,
  type VozDaCampanha,
} from "@/lib/prospeccao";
import type { ConexaoDisponivel, ConfigDaCampanha, LeadDaCampanha } from "./tipos";

// CAMPANHA: o número que envia (um campo simples, decisão do dono), o que a campanha oferece (site, Atenda ou os dois), a voz de quem
// assina, os textos (a primeira mensagem muda com o ângulo de cada lead, com a
// prévia num lead da lista), a cadência, os limites e a base legal. A linha de
// saída entra sozinha na primeira mensagem e não se edita (D8).

const OFERTAS: { chave: Oferta; rotulo: string }[] = [
  { chave: "site", rotulo: "Sites" },
  { chave: "atenda", rotulo: "Atenda (atendimento com IA)" },
];

const CAMPOS_DA_VOZ: { chave: keyof VozDaCampanha; rotulo: string; dica: string }[] = [
  { chave: "meuNome", rotulo: "Seu nome", dica: "Como você assina" },
  { chave: "minhaEmpresa", rotulo: "Sua empresa", dica: "Por exemplo, OBS" },
  { chave: "oQueFaco", rotulo: "O que você faz", dica: "Uma frase" },
  { chave: "diferencial", rotulo: "Seu diferencial", dica: "O que só você oferece" },
];

const SAIDAS: { chave: MomentoDaSaida; rotulo: string }[] = [
  { chave: "primeira", rotulo: "na primeira mensagem (recomendado)" },
  { chave: "segunda", rotulo: "na segunda" },
];

/** Os ângulos que a campanha pode usar, pelas ofertas marcadas. */
function angulosDas(ofertas: Oferta[]): Angulo[] {
  const site = ofertas.includes("site");
  const atenda = ofertas.includes("atenda");
  const angulos: Angulo[] = [];
  if (site) angulos.push("site");
  if (atenda) angulos.push("atenda");
  if (site && atenda) angulos.push("site_e_atenda");
  return angulos;
}

function Previa({ texto, faltando, nome }: { texto: string; faltando: string[]; nome: string }) {
  return (
    <div className="mt-3">
      <p className="text-rotulo uppercase text-ink-3">Como fica para {nome}</p>
      <p className="mt-1 whitespace-pre-line rounded-lg border border-line-soft bg-raised px-3 py-2 text-apoio text-ink-2">
        {texto}
      </p>
      {faltando.length > 0 && (
        <p className="mt-1 text-legenda text-warn-ink">
          Esta empresa não tem {faltando.map((c) => `{${c}}`).join(", ")}: a fila pede para completar à mão.
        </p>
      )}
    </div>
  );
}

function AbaCampanha({
  config,
  aoSalvar,
  leads,
  conexoes,
}: {
  config: ConfigDaCampanha;
  aoSalvar: (c: ConfigDaCampanha) => void;
  leads: LeadDaCampanha[];
  conexoes: ConexaoDisponivel[];
}) {
  const [rascunho, setRascunho] = useState(config);
  const [recado, setRecado] = useState<string | null>(null);
  const semBaseLegal = rascunho.baseLegalRef.trim().length < 3;
  const semOferta = rascunho.ofertas.length === 0;
  const semNumero = !conexoes.some((c) => c.id === rascunho.conexaoId);
  const tetoValido =
    Number.isInteger(rascunho.tetoDiario) && rascunho.tetoDiario >= 1 && rascunho.tetoDiario <= TETO_MAXIMO_DIARIO;
  const [pMin, pMax] = rascunho.pausaMinutos;
  const pausaValida = pMin >= 1 && pMax >= pMin;

  function mudar(p: Partial<ConfigDaCampanha>) {
    setRascunho((r) => ({ ...r, ...p }));
    setRecado(null);
  }

  function alternarOferta(o: Oferta, marcada: boolean) {
    const ofertas = marcada ? [...rascunho.ofertas, o] : rascunho.ofertas.filter((x) => x !== o);
    mudar({ ofertas: OFERTAS.map((x) => x.chave).filter((x) => ofertas.includes(x)) });
  }

  /** A prévia do texto num lead da lista (para a primeira mensagem, um que cairia neste ângulo). */
  function previaDe(modelo: string, toque: number, angulo: Angulo | null) {
    const l =
      angulo === null
        ? leads[0]
        : leads.find((x) => anguloDaAbordagem(x.sinais, rascunho.ofertas).angulo === angulo);
    if (!l) return null;
    const p = textoDoToque(modelo, camposDoLead(l, rascunho.voz), toque, rascunho.saida);
    return <Previa texto={p.texto} faltando={p.faltando} nome={l.nome} />;
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
              disabled={(semBaseLegal || semOferta || semNumero) && !rascunho.ativa}
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
          <div className="mt-3">
            <span className="text-rotulo uppercase text-ink-3">Número que envia</span>
            <Select value={rascunho.conexaoId ?? ""} onValueChange={(v) => mudar({ conexaoId: v })}>
              <SelectTrigger size="field" aria-label="Número que envia" className="mt-1 w-full">
                <SelectValue placeholder="Escolha a conexão de WhatsApp" />
              </SelectTrigger>
              <SelectContent>
                {conexoes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} {c.conectado ? "(conectado)" : "(desconectado)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-legenda text-ink-3">
              As respostas caem em Conversas da empresa desse número, e a IA dela continua a conversa.
            </p>
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

        <Card variant="secao" data-slot="campanha-oferta">
          <h2 className="text-cartao">O que esta campanha oferece</h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            O raio-X de cada empresa escolhe o ângulo: site com problema puxa a oferta de site; horário curto, muito
            movimento ou venda pelo WhatsApp puxam o Atenda.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            {OFERTAS.map((o) => (
              <label key={o.chave} className="flex cursor-pointer items-center gap-2 text-apoio text-ink">
                <Checkbox
                  checked={rascunho.ofertas.includes(o.chave)}
                  onCheckedChange={(v) => alternarOferta(o.chave, v === true)}
                />
                {o.rotulo}
              </label>
            ))}
          </div>
          {semOferta && (
            <Aviso tom="warn" className="mt-2">
              Marque pelo menos uma oferta.
            </Aviso>
          )}
        </Card>

        <Card variant="secao" data-slot="campanha-ia">
          <h2 className="text-cartao">Para a IA que continua a conversa</h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            Entra no prompt da empresa do número que envia. A empresa só entra no funil quando é abordada.
          </p>
          <label className="mt-3 block">
            <span className="text-rotulo uppercase text-ink-3">O que oferecer e como começar</span>
            <Textarea
              className="mt-1 min-h-20"
              value={rascunho.comoComecar}
              onChange={(e) => mudar({ comoComecar: e.target.value })}
            />
          </label>
          <label className="mt-3 block">
            <span className="text-rotulo uppercase text-ink-3">Quando considerar qualificado</span>
            <Input
              className="mt-1"
              value={rascunho.qualificado}
              onChange={(e) => mudar({ qualificado: e.target.value })}
            />
          </label>
          <p className="mt-3 text-rotulo uppercase text-ink-3">Objeções e respostas</p>
          <ul className="mt-1 flex flex-col gap-3" data-slot="campanha-objecoes">
            {rascunho.objecoes.map((o, i) => (
              <li key={i} className="grid gap-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <Input
                  aria-label={`Objeção ${i + 1}`}
                  value={o.objecao}
                  onChange={(e) =>
                    mudar({ objecoes: rascunho.objecoes.map((x, j) => (j === i ? { ...x, objecao: e.target.value } : x)) })
                  }
                />
                <Input
                  aria-label={`Resposta à objeção ${i + 1}`}
                  value={o.resposta}
                  onChange={(e) =>
                    mudar({ objecoes: rascunho.objecoes.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)) })
                  }
                />
              </li>
            ))}
          </ul>
        </Card>

        <Card variant="secao" data-slot="campanha-voz">
          <h2 className="text-cartao">Sua voz</h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            Entra nos textos como {"{meu_nome}"}, {"{minha_empresa}"}, {"{o_que_faco}"} e {"{diferencial}"}, e guia o
            rascunho da IA na fase 2.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {CAMPOS_DA_VOZ.map((c) => (
              <label key={c.chave}>
                <span className="text-rotulo uppercase text-ink-3">{c.rotulo}</span>
                <Input
                  className="mt-1"
                  placeholder={c.dica}
                  value={rascunho.voz[c.chave]}
                  onChange={(e) => mudar({ voz: { ...rascunho.voz, [c.chave]: e.target.value } })}
                />
              </label>
            ))}
          </div>
        </Card>

        <Card variant="secao" data-slot="campanha-toque">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-cartao">Primeira mensagem</h2>
            <span className="text-legenda text-ink-3">dia 0, uma versão por ângulo</span>
          </div>
          <p className="mt-0.5 text-legenda text-ink-3">
            Campos: {"{nome}"}, {"{cidade}"}, {"{falta_no_site}"} (o que o raio-X achou), {"{horario_curto}"} e os da
            sua voz.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" data-slot="campanha-saida">
            <span className="mr-1 text-apoio text-ink-2">“{LINHA_DE_SAIDA}” entra</span>
            {SAIDAS.map((o) => (
              <Button
                key={o.chave}
                type="button"
                variant="chip"
                size="chip"
                data-ativo={rascunho.saida === o.chave ? "sim" : undefined}
                aria-pressed={rascunho.saida === o.chave}
                onClick={() => mudar({ saida: o.chave })}
              >
                {o.rotulo}
              </Button>
            ))}
          </div>
          {angulosDas(rascunho.ofertas).map((a) => (
            <div key={a} className="mt-4">
              <p className="text-rotulo uppercase text-ink-3">Ângulo {ROTULO_DO_ANGULO[a]}</p>
              <Textarea
                className="mt-1 min-h-24"
                aria-label={`Primeira mensagem, ângulo ${ROTULO_DO_ANGULO[a]}`}
                value={rascunho.textos.primeira[a]}
                onChange={(e) =>
                  mudar({ textos: { ...rascunho.textos, primeira: { ...rascunho.textos.primeira, [a]: e.target.value } } })
                }
              />
              {previaDe(rascunho.textos.primeira[a], 1, a)}
            </div>
          ))}
        </Card>

        {(["segundo", "terceiro"] as const).map((k, i) => (
          <Card variant="secao" key={k} data-slot="campanha-toque">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-cartao">{i === 0 ? "Segundo toque, se não responder" : "Terceiro toque, despedida"}</h2>
              <span className="text-legenda text-ink-3">dia {CADENCIA_PROVISORIA[i + 1]}</span>
            </div>
            <Textarea
              className="mt-2 min-h-24"
              aria-label={i === 0 ? "Segundo toque" : "Terceiro toque"}
              value={rascunho.textos[k]}
              onChange={(e) => mudar({ textos: { ...rascunho.textos, [k]: e.target.value } })}
            />
            {previaDe(rascunho.textos[k], i + 2, null)}
          </Card>
        ))}

        <Card variant="secao">
          <h2 className="text-cartao">Limites</h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            Sai pelo número escolhido acima. O máximo é {TETO_MAXIMO_DIARIO} por dia, acompanhamentos incluídos (sua decisão);
            a pausa e o horário são valores de partida, não medidos.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label>
              <span className="text-rotulo uppercase text-ink-3">Máximo por dia</span>
              <Input
                className="mt-1"
                type="number"
                min={1}
                max={TETO_MAXIMO_DIARIO}
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
            Envios de {textoDaJanela(rascunho.janela)}, horário de São Paulo. Até 3 mensagens por empresa; qualquer
            resposta, SAIR ou falha encerra a sequência.
          </p>
          {(!tetoValido || !pausaValida) && (
            <Aviso tom="warn" className="mt-2">
              {!tetoValido
                ? `O máximo por dia vai de 1 a ${TETO_MAXIMO_DIARIO}.`
                : "A pausa máxima precisa ser maior ou igual à mínima."}
            </Aviso>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="brand" size="control" disabled={!tetoValido || !pausaValida || semOferta || semNumero}>
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
