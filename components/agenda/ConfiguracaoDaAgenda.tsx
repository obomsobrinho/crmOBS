"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarDays, Clock, Copy, Plus, Settings2, Trash2 } from "lucide-react";
import AgentHoursEditor from "@/components/AgentHoursEditor";
import { Field, Hint, MOLDURA_LISTA, SubBloco } from "@/components/agente/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DAY_ORDER, type BusinessHours } from "@/lib/agent-prompt";
import {
  ANTECEDENCIA_MAX,
  DURACAO_MAX,
  DURACAO_MIN,
  OPCOES_INICIO,
  OPCOES_INTERVALO,
  textoDeDuracao,
  type AgendaConfig,
  type InicioDosHorarios,
  type ServicoDaAgenda,
} from "@/lib/agenda";
import type { FonteAgenda } from "@/lib/agenda-fonte";

// CONFIGURAÇÕES DA AGENDA (revisão do dono, 28/10/2026). Um item "Agenda" com
// a caixa de ativar; marcada, abre o resto. Dias e horários são PRÓPRIOS da
// agenda (decisão do dono, 28/10/2026), com "Copiar o horário de atendimento"
// e a cópia já preenchida na primeira ativação. O lembrete segue o horário de
// atendimento. Só o dono chega aqui (a página guarda; esconder não é trava).

type ServicoEditavel = { id: number | null; chave: string; nome: string; duracao: string };
type Unidade = "min" | "h";

/** Sem horário de atendimento para copiar: todos os dias fechados, o dono abre. */
const HORARIO_FECHADO = Object.fromEntries(
  DAY_ORDER.map((d) => [d, { open: false, from: "08:00", to: "18:00" }])
) as BusinessHours;

function antecedenciaParaCampo(min: number): { valor: string; unidade: Unidade } {
  return min % 60 === 0 ? { valor: String(min / 60), unidade: "h" } : { valor: String(min), unidade: "min" };
}

export default function ConfiguracaoDaAgenda({
  fonte,
  configInicial,
  servicosIniciais,
  horarioAtendimento,
  hrefHorario,
  hrefAgenda,
}: {
  fonte: FonteAgenda;
  configInicial: AgendaConfig;
  servicosIniciais: ServicoDaAgenda[];
  /** O horário de atendimento do agente: para copiar (e preencher na primeira ativação). */
  horarioAtendimento: BusinessHours | null;
  /** Onde se vê e edita o horário de atendimento do agente. */
  hrefHorario: string;
  hrefAgenda: string;
}) {
  const [c, setC] = useState(configInicial);
  // Primeira ativação: já vem preenchido com a cópia do horário de atendimento.
  const [horario, setHorario] = useState<BusinessHours>(
    () => configInicial.horario ?? horarioAtendimento ?? HORARIO_FECHADO
  );
  const [servicos, setServicos] = useState<ServicoEditavel[]>(() =>
    servicosIniciais.map((s) => ({ id: s.id, chave: `s${s.id}`, nome: s.nome, duracao: String(s.duracaoMin) }))
  );
  const inicial = antecedenciaParaCampo(configInicial.antecedenciaMin);
  const [antValor, setAntValor] = useState(inicial.valor);
  const [antUnidade, setAntUnidade] = useState<Unidade>(inicial.unidade);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const mudar = (p: Partial<AgendaConfig>) => {
    setC((x) => ({ ...x, ...p }));
    setSalvo(false);
  };

  const antMin = Math.round(Number(antValor.replace(",", ".")) * (antUnidade === "h" ? 60 : 1));
  const antValida = Number.isFinite(antMin) && antMin >= 0 && antMin <= ANTECEDENCIA_MAX && antValor.trim() !== "";

  const salvar = async () => {
    setErro(null);
    const lista = servicos.map((s) => ({ id: s.id, nome: s.nome.trim(), duracaoMin: Number(s.duracao) }));
    if (c.ativa && lista.length === 0) return setErro("Cadastre pelo menos um serviço para ligar a agenda.");
    if (lista.some((s) => !s.nome || !Number.isInteger(s.duracaoMin) || s.duracaoMin < DURACAO_MIN || s.duracaoMin > DURACAO_MAX)) {
      return setErro(`Todo serviço precisa de nome e de uma duração entre ${DURACAO_MIN} e ${DURACAO_MAX} minutos.`);
    }
    if (!antValida) return setErro("Antecedência mínima inválida.");
    setEnviando(true);
    if (c.ativa && !DAY_ORDER.some((d) => horario[d].open)) return setErro("Abra pelo menos um dia nos dias e horários da agenda.");
    const r = await fonte.salvarConfig({ ...c, antecedenciaMin: antMin, horario }, lista);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    setC(r.config);
    setServicos(r.servicos.map((s) => ({ id: s.id, chave: `s${s.id}`, nome: s.nome, duracao: String(s.duracaoMin) })));
    setSalvo(true);
  };

  return (
    <Card variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-agenda="configuracoes">
      <AreaRolavel className="min-h-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-5 max-md:px-4">
          <div className="mb-5 flex items-center gap-2">
            <Settings2 size={20} className="text-brand-ink" />
            <h1 className="text-titulo">Configurações</h1>
          </div>

          <section className="rounded-xl border border-line bg-bloco p-4" data-agenda="item-agenda">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox checked={c.ativa} onCheckedChange={(v) => mudar({ ativa: v === true })} className="mt-1" aria-label="Agenda ativa" />
              <span>
                <span className="flex items-center gap-1.5 font-display text-cartao">
                  <CalendarDays size={16} className="text-brand-ink" />
                  Agenda
                </span>
                <span className="mt-0.5 block text-apoio text-ink-3">
                  Para quem atende com horário marcado. Ative para a IA marcar, remarcar e cancelar horários pela conversa.
                </span>
              </span>
            </label>

            {c.ativa && (
              <div className="mt-5 space-y-5 border-t border-line pt-5" data-agenda="config-aberta">
                <SubBloco
                  primeiro
                  titulo="Dias e horários"
                  icone={CalendarClock}
                  descricao="Quando a agenda aceita horários. É deles que a IA tira os horários livres."
                >
                  {/* O copiar vem ANTES dos dias (ajuste do dono): quem só o vê depois de
                      configurar tudo perde o trabalho. */}
                  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1" data-agenda="copiar-horario">
                    {horarioAtendimento ? (
                      <Button
                        variant="link"
                        size="link"
                        onClick={() => {
                          setHorario(horarioAtendimento);
                          setSalvo(false);
                        }}
                      >
                        <Copy size={14} />
                        Copiar o horário de atendimento
                      </Button>
                    ) : (
                      <span className="text-legenda text-ink-3">O agente ainda não tem horário de atendimento para copiar.</span>
                    )}
                    <Button variant="link-discreto" size="link" asChild>
                      <Link href={hrefHorario}>Ver o horário de atendimento</Link>
                    </Button>
                  </div>
                  <div data-agenda="horario-agenda">
                    <AgentHoursEditor value={horario} onChange={(h) => { setHorario(h); setSalvo(false); }} />
                  </div>
                </SubBloco>

                <SubBloco titulo="Serviços" icone={Clock} descricao="Cada um com quanto tempo ocupa. Com um serviço só, a IA não pergunta qual.">
                  <div className={MOLDURA_LISTA} data-agenda="servicos">
                    {servicos.length === 0 && <p className="px-3 py-2.5 text-legenda text-ink-3">Nenhum serviço ainda.</p>}
                    {servicos.map((s, i) => (
                      <div key={s.chave} className="flex items-center gap-2 px-3 py-2" data-agenda="servico">
                        <Input
                          variant="sutil"
                          value={s.nome}
                          placeholder="Nome do serviço"
                          onChange={(e) => {
                            setServicos((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)));
                            setSalvo(false);
                          }}
                          aria-label={`Nome do serviço ${i + 1}`}
                          className="min-w-0 flex-1"
                          maxLength={80}
                        />
                        <div className="flex items-center gap-1.5">
                          <Input
                            variant="sutil"
                            inputMode="numeric"
                            value={s.duracao}
                            onChange={(e) => {
                              setServicos((l) => l.map((x, j) => (j === i ? { ...x, duracao: e.target.value.replace(/\D/g, "") } : x)));
                              setSalvo(false);
                            }}
                            aria-label={`Duração em minutos do serviço ${i + 1}`}
                            className="w-16 text-right tabular-nums"
                            maxLength={3}
                          />
                          <span className="text-legenda text-ink-3">min</span>
                        </div>
                        <Button
                          variant="danger-ghost"
                          size="icon-control"
                          aria-label={`Remover serviço ${i + 1}`}
                          onClick={() => {
                            setServicos((l) => l.filter((_, j) => j !== i));
                            setSalvo(false);
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="link"
                    size="link"
                    className="mt-2"
                    onClick={() => setServicos((l) => [...l, { id: null, chave: `n${l.length}-${Math.random()}`, nome: "", duracao: "30" }])}
                  >
                    <Plus size={14} />
                    Adicionar serviço
                  </Button>
                </SubBloco>

                <SubBloco titulo="Como os horários se encaixam" icone={CalendarClock}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Intervalo entre horários">
                      <Select value={String(c.intervaloMin)} onValueChange={(v) => mudar({ intervaloMin: Number(v) })}>
                        <SelectTrigger aria-label="Intervalo entre horários" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPCOES_INTERVALO.map((m) => (
                            <SelectItem key={m} value={String(m)}>{m === 0 ? "Sem intervalo" : `${m} min`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Os horários começam">
                      <Select value={c.inicio} onValueChange={(v) => mudar({ inicio: v as InicioDosHorarios })}>
                        <SelectTrigger aria-label="Os horários começam" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPCOES_INICIO.map((o) => (
                            <SelectItem key={o.valor} value={o.valor}>
                              {o.rotulo} · {o.exemplo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {c.intervaloMin > 0 && (
                    <div className="mt-2" data-agenda="nota-intervalo">
                      <Hint>O intervalo de {c.intervaloMin} min entre horários já entra na conta.</Hint>
                    </div>
                  )}
                </SubBloco>

                <SubBloco titulo="Antecedência mínima" icone={Clock}>
                  <div className="flex items-center gap-2">
                    <Input
                      value={antValor}
                      onChange={(e) => {
                        setAntValor(e.target.value.replace(/[^\d,.]/g, ""));
                        setSalvo(false);
                      }}
                      inputMode="decimal"
                      aria-label="Antecedência mínima"
                      className="w-20 text-right tabular-nums"
                      maxLength={5}
                    />
                    <Select value={antUnidade} onValueChange={(v) => { setAntUnidade(v as Unidade); setSalvo(false); }}>
                      <SelectTrigger aria-label="Unidade da antecedência" className="w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="h">horas</SelectItem>
                        <SelectItem value="min">minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-2 text-apoio text-ink-2" data-agenda="texto-antecedencia">
                    {antValida
                      ? `A IA só marca sozinha com pelo menos ${textoDeDuracao(antMin)} de antecedência. Se o cliente pedir um horário mais próximo, ela avisa que vai confirmar e chama você.`
                      : "Digite um número."}
                  </p>
                </SubBloco>

                <SubBloco titulo="Lembrete" icone={CalendarClock}>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <Checkbox checked={c.lembrete} onCheckedChange={(v) => mudar({ lembrete: v === true })} className="mt-0.5" aria-label="Lembrete automático" />
                    <span className="text-apoio">
                      Lembrete automático pelo WhatsApp, às 9h do dia anterior ao horário marcado (no último dia em que a loja abre antes dele).
                    </span>
                  </label>
                </SubBloco>
              </div>
            )}
          </section>

          {!c.ativa && (
            <p className="mt-3 text-legenda text-ink-3" data-agenda="desligada">
              Desligada, a Agenda some do menu e do funil, e a IA não marca horários.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {erro && <p className="mr-auto text-apoio text-danger-ink" role="alert">{erro}</p>}
            {salvo && !erro && <p className="mr-auto text-apoio text-ink-2" role="status">Salvo.</p>}
            {salvo && c.ativa && (
              <Button variant="outline" size="field" className="px-4" asChild>
                <Link href={hrefAgenda}>Ver a agenda</Link>
              </Button>
            )}
            <Button size="field" className="px-4" carregando={enviando} onClick={salvar}>
              Salvar
            </Button>
          </div>
        </div>
      </AreaRolavel>
    </Card>
  );
}
