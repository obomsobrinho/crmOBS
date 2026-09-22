"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";

import type { BusinessHours, DayKey } from "@/lib/agent-prompt";
import { DAY_LABEL } from "@/lib/agent-prompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MOLDURA_LISTA } from "@/components/agente/ui";

const UTEIS: DayKey[] = ["seg", "ter", "qua", "qui", "sex"];

/** "Seg", "Sáb": as três primeiras letras do rótulo que o prompt já usa. */
const curto = (d: DayKey) => cap(DAY_LABEL[d].slice(0, 3));

type Hora = Pick<BusinessHours[DayKey], "from" | "to">;

/**
 * Horário de atendimento em três linhas: os dias úteis como UM grupo, sábado e
 * domingo cada um com a sua (22/09/2026, pedido do dono: "segunda a sexta deve
 * ser um único grupo", sem a lista repetitiva de sete dias).
 *
 * O grupo tem um HORÁRIO PADRÃO e EXCEÇÕES. Segunda rodada do mesmo dia: "eu
 * consigo configurar seg-sexta direto, mas na sexta vou editar somente ela,
 * pois na sexta saio mais cedo". Então a sexta vira uma linha própria dentro do
 * grupo, e mudar o padrão depois não passa por cima dela.
 *
 * ⚠️ NADA DISTO É CAMPO NOVO NO `agent_config`. O banco continua guardando os 7
 * dias (`BusinessHours`), e padrão e exceção são LIDOS dele: o padrão é a faixa
 * mais comum entre os dias úteis abertos, exceção é o dia que foge dela. Guardar
 * "é exceção" como dado criaria uma segunda verdade sobre o mesmo horário, e a
 * primeira divergência apareceria no prompt, que lê só os 7 dias. O único
 * estado local é `extras`: o dia que a pessoa acabou de pôr como exceção e que
 * ainda tem a hora do padrão (senão ele sumiria da lista no mesmo clique).
 */
export default function AgentHoursEditor({
  value,
  onChange,
  className,
}: {
  value: BusinessHours;
  onChange: (next: BusinessHours) => void;
  /** Para esticar até a altura do bloco vizinho na grade. */
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [extras, setExtras] = useState<DayKey[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);

  const abertos = UTEIS.filter((d) => value[d].open);
  const padrao = horaDoGrupo(value, abertos, extras);
  const excecoes = abertos.filter(
    (d) =>
      extras.includes(d) ||
      value[d].from !== padrao.from ||
      value[d].to !== padrao.to,
  );
  const noPadrao = abertos.filter((d) => !excecoes.includes(d));

  function setDay(day: DayKey, patch: Partial<BusinessHours[DayKey]>) {
    onChange({ ...value, [day]: { ...value[day], ...patch } });
  }

  /** Muda o padrão só nos dias que estão NELE: exceção não é atropelada. */
  function setPadrao(patch: Partial<Hora>) {
    const next = { ...value };
    noPadrao.forEach((d) => {
      next[d] = { ...next[d], ...patch };
    });
    onChange(next);
  }

  function alternarDia(d: DayKey) {
    if (value[d].open) {
      setDay(d, { open: false });
      setExtras((xs) => xs.filter((x) => x !== d));
    } else {
      // Dia que abre entra no padrão, e não com a hora antiga que tinha.
      setDay(d, { open: true, ...padrao });
    }
  }

  function adicionarExcecao(d: DayKey) {
    setExtras((xs) => [...xs, d]);
    setEscolhendo(false);
  }

  function removerExcecao(d: DayKey) {
    setDay(d, { ...padrao });
    setExtras((xs) => xs.filter((x) => x !== d));
  }

  function concluir() {
    setEditando(false);
    setEscolhendo(false);
    // Exceção que ficou igual ao padrão deixa de ser exceção.
    setExtras([]);
  }

  return (
    <div
      data-slot="horario"
      className={cn(MOLDURA_LISTA, className)}
    >
      <div data-slot="horario-semana" className="px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-apoio font-medium text-ink">Segunda a sexta</p>
          <Button
            variant="ghost"
            onClick={() => (editando ? concluir() : setEditando(true))}
            aria-expanded={editando}
            className="-mr-2"
          >
            {editando ? (
              "Concluir"
            ) : (
              <>
                <Pencil size={14} />
                Editar
              </>
            )}
          </Button>
        </div>

        {/* Fechado, cada faixa é uma linha: os dias do padrão e, embaixo, a
            exceção com o nome dela. É o que a pessoa confere ("na sexta saio
            mais cedo") sem abrir nada. */}
        {!editando && (
          <ul className="mt-1 space-y-1 text-apoio tabular-nums">
            {abertos.length === 0 && (
              <li className="text-ink-3">Nenhum dia aberto</li>
            )}
            {noPadrao.length > 0 && (
              <Resumo
                dias={noPadrao.map(curto).join(" • ")}
                hora={padrao}
              />
            )}
            {excecoes.map((d) => (
              <Resumo key={d} dias={cap(DAY_LABEL[d])} hora={value[d]} />
            ))}
          </ul>
        )}

        {editando && (
          <div className="mt-3 space-y-3">
            <div
              role="group"
              aria-label="Dias de atendimento"
              className="flex flex-wrap gap-1.5"
            >
              {UTEIS.map((d) => {
                const on = value[d].open;
                return (
                  <Button
                    key={d}
                    variant="alternavel"
                    aria-pressed={on}
                    onClick={() => alternarDia(d)}
                    className="min-w-12 rounded-full"
                  >
                    {curto(d)}
                  </Button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Linha rotulo="Horário">
                <Faixa
                  rotulo="dias úteis"
                  hora={padrao}
                  disabled={noPadrao.length === 0}
                  onChange={setPadrao}
                />
              </Linha>
              {excecoes.map((d) => (
                <Linha key={d} rotulo={cap(DAY_LABEL[d])}>
                  <Faixa
                    rotulo={DAY_LABEL[d]}
                    hora={value[d]}
                    onChange={(p) => setDay(d, p)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-control"
                    onClick={() => removerExcecao(d)}
                    aria-label={`${cap(DAY_LABEL[d])} volta ao horário padrão`}
                    title="Voltar ao horário padrão"
                  >
                    <X size={14} />
                  </Button>
                </Linha>
              ))}
            </div>

            {noPadrao.length > 1 &&
              (escolhendo ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-apoio text-ink-3">Qual dia?</span>
                  {noPadrao.map((d) => (
                    <Button
                      key={d}
                      variant="outline"
                      onClick={() => adicionarExcecao(d)}
                      className="min-w-12 rounded-full"
                    >
                      {curto(d)}
                    </Button>
                  ))}
                  <Button variant="ghost" onClick={() => setEscolhendo(false)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setEscolhendo(true)}>
                  <Plus size={14} />
                  Horário diferente em um dia
                </Button>
              ))}
          </div>
        )}
      </div>

      {(["sab", "dom"] as const).map((d) => {
        const dia = value[d];
        const nome = cap(DAY_LABEL[d]);
        return (
          <div
            key={d}
            data-slot={`horario-${d}`}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
          >
            <p
              className={cn(
                "text-apoio font-medium",
                dia.open ? "text-ink" : "text-ink-3",
              )}
            >
              {nome}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Faixa
                rotulo={DAY_LABEL[d]}
                hora={dia}
                disabled={!dia.open}
                onChange={(p) => setDay(d, p)}
              />
              <Switch
                checked={dia.open}
                onCheckedChange={(v) => setDay(d, { open: v })}
                aria-label={`${nome} aberto`}
                className="flex w-24 items-center justify-end gap-2 text-apoio"
              >
                <span className={dia.open ? "text-ink" : "text-ink-3"}>
                  {dia.open ? "Aberto" : "Fechado"}
                </span>
                <SwitchTrack checked={dia.open}>
                  <SwitchThumb checked={dia.open} />
                </SwitchTrack>
              </Switch>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Resumo({ dias, hora }: { dias: string; hora: Hora }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span className="text-ink-2">{dias}</span>
      <span className="font-medium text-ink">
        {hora.from} às {hora.to}
      </span>
    </li>
  );
}

/** Rótulo numa coluna fixa, para padrão e exceções alinharem os campos. */
function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-apoio text-ink-3">{rotulo}</span>
      {children}
    </div>
  );
}

function Faixa({
  rotulo,
  hora,
  disabled = false,
  onChange,
}: {
  rotulo: string;
  hora: Hora;
  disabled?: boolean;
  onChange: (p: Partial<Hora>) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Degrau de controle (32px), não o de campo (40px): três linhas com
          dois campos de 40px viram uma parede. */}
      <Input
        type="time"
        aria-label={`Abre às (${rotulo})`}
        value={hora.from}
        disabled={disabled}
        onChange={(e) => onChange({ from: e.target.value })}
        className="h-[var(--h-control)] w-auto px-2"
      />
      <span className="text-apoio text-ink-3">às</span>
      <Input
        type="time"
        aria-label={`Fecha às (${rotulo})`}
        value={hora.to}
        disabled={disabled}
        onChange={(e) => onChange({ to: e.target.value })}
        className="h-[var(--h-control)] w-auto px-2"
      />
    </div>
  );
}

/**
 * O horário padrão do grupo. Os `extras` ficam de fora da conta (acabaram de
 * virar exceção e ainda têm a hora do padrão); se TODOS os abertos forem
 * exceção, conta com eles; sem nenhum aberto, vale a hora gravada da segunda,
 * para que marcar um dia não o abra com hora vazia.
 */
function horaDoGrupo(
  v: BusinessHours,
  abertos: DayKey[],
  extras: DayKey[],
): Hora {
  return (
    faixaPadrao(v, abertos.filter((d) => !extras.includes(d))) ??
    faixaPadrao(v, abertos) ?? { from: v.seg.from, to: v.seg.to }
  );
}

/**
 * A faixa mais comum entre os dias dados; empate fica com a do dia que vem
 * primeiro na semana. `null` sem dias.
 */
function faixaPadrao(v: BusinessHours, dias: DayKey[]): Hora | null {
  let melhor: Hora | null = null;
  let max = 0;
  for (const d of dias) {
    const n = dias.filter(
      (x) => v[x].from === v[d].from && v[x].to === v[d].to,
    ).length;
    if (n > max) {
      max = n;
      melhor = { from: v[d].from, to: v[d].to };
    }
  }
  return melhor;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
