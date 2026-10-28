"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Ban,
  Bell,
  BellOff,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessagesSquare,
  Phone,
  Repeat,
  Settings2,
  Sparkles,
  UserRound,
} from "lucide-react";
import AvatarContato from "@/components/AvatarContato";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DAY_LABEL, type BusinessHours } from "@/lib/agent-prompt";
import {
  diaFalado,
  expedienteDoDia,
  faixaHoraria,
  hhmm,
  quandoFalado,
  rotuloDoDia,
  segundaDaSemana,
  type AgendaConfig,
  type ServicoDaAgenda,
} from "@/lib/agenda";
import { inicioDoDia, type BloqueioAgenda, type FonteAgenda, type LinhaAgenda } from "@/lib/agenda-fonte";
import { diaIsoSP, mesAnoDoDia, somarDias } from "@/lib/fuso";
import { prettyPhone } from "@/lib/format";
import { minutosAgoraSP } from "@/lib/horarios";
import { ROTULO_CHAVES, fillDoRotulo } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

// A tela da AGENDA PRÓPRIA (revisão do dono, 28/10/2026): GRADE SEMANAL no
// estilo Google Agenda (referência: Clinic Radar), colunas por dia com
// contador, a linha do "agora", cartões com barra colorida à esquerda e o dia
// de hoje destacado. Na lateral, o minicalendário do mês com a semana exibida
// em destaque (sem a lista de compromissos da referência). Clique num horário
// abre o detalhe com remarcar e cancelar. No celular, um dia por vez.
// Os dados vêm SÓ da `fonte` (banco em `/agenda`, memória em `/design/agenda`).

const HORA_PX = 80;
const DIA_MS = 86_400_000;
const CHAVES_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

export interface PropsAgenda {
  fonte: FonteAgenda;
  agora: number;
  empresa: string;
  dono: boolean;
  /** false = tabelas ausentes (migration não aplicada) ou leitura falhou. */
  disponivel: boolean;
  /** Horário de atendimento cadastrado (fonte única com o agente), ou null. */
  hours: BusinessHours | null;
  config: AgendaConfig;
  servicos: ServicoDaAgenda[];
  inicial: { semana: string; itens: LinhaAgenda[]; bloqueios: BloqueioAgenda[] };
  /** Onde fica a configuração (a tela real e o preview têm endereços diferentes). */
  hrefConfig: string;
  readOnly?: boolean;
}


function corDoServico(servicoId: number | null): string {
  return fillDoRotulo(ROTULO_CHAVES[Math.abs(servicoId ?? 0) % ROTULO_CHAVES.length]);
}

function minutos(ms: number): number {
  return minutosAgoraSP(new Date(ms));
}

/** As horas que a grade mostra: o expediente da semana, esticado para caber o que está marcado. */
function faixaDaGrade(dias: string[], hours: BusinessHours | null, itens: { inicio: number; fim: number }[]): [number, number] {
  let de = 24;
  let ate = 0;
  for (const d of dias) {
    const exp = hours ? expedienteDoDia(d, hours) : null;
    if (!exp) continue;
    de = Math.min(de, Math.floor(minutos(exp.inicio) / 60));
    const fim = exp.fim - exp.inicio >= DIA_MS ? 24 : Math.ceil((minutos(exp.fim) || 1440) / 60);
    ate = Math.max(ate, fim <= de ? 24 : fim);
  }
  for (const x of itens) {
    de = Math.min(de, Math.floor(minutos(x.inicio) / 60));
    ate = Math.max(ate, Math.ceil((minutos(x.fim) || 1440) / 60));
  }
  if (de >= ate) return [8, 18];
  return [de, Math.min(24, ate)];
}

export default function Agenda(p: PropsAgenda) {
  const hoje = diaIsoSP(p.agora);
  const [semana, setSemana] = useState(p.inicial.semana);
  const [diaCelular, setDiaCelular] = useState(hoje);
  const [itens, setItens] = useState(p.inicial.itens);
  const [bloqueios, setBloqueios] = useState(p.inicial.bloqueios);
  const [detalhe, setDetalhe] = useState<LinhaAgenda | null>(null);
  const [marcar, setMarcar] = useState(false);
  const [remarcar, setRemarcar] = useState<LinhaAgenda | null>(null);
  const [cancelar, setCancelar] = useState<LinhaAgenda | null>(null);
  const [bloquear, setBloquear] = useState(false);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(semana, i)), [semana]);

  const recarregar = useCallback(async () => {
    const de = inicioDoDia(semana);
    try {
      const [l, b] = await Promise.all([p.fonte.semana(de, de + 7 * DIA_MS), p.fonte.bloqueios(de, de + 7 * DIA_MS)]);
      setItens(l);
      setBloqueios(b);
    } catch (e) {
      console.error("agenda da semana:", e);
    }
  }, [p.fonte, semana]);

  // A primeira semana veio do servidor; as outras, a fonte lê ao navegar.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    void recarregar();
  }, [recarregar]);
  // Voltar para a aba revalida (sem realtime nesta versão).
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === "visible" && void recarregar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [recarregar]);

  const irPara = (dia: string) => {
    setSemana(segundaDaSemana(dia));
    setDiaCelular(dia);
  };

  if (!p.disponivel) {
    return (
      <Card variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col" data-agenda="indisponivel">
        <EstadoVazio
          icone={CalendarDays}
          titulo="Agenda ainda não disponível"
          texto="A agenda precisa ser ativada no banco antes do primeiro uso. Nada foi perdido: o atendimento segue normal."
          tamanho="detalhe"
        />
      </Card>
    );
  }

  const [horaDe, horaAte] = faixaDaGrade(dias, p.hours, [...itens, ...bloqueios]);
  const contagem = (d: string) => itens.filter((l) => diaIsoSP(l.inicio) === d).length;

  return (
    <Card variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-agenda="tela">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 max-md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays size={20} className="shrink-0 text-brand-ink" />
          <h1 className="text-titulo">Agenda</h1>
          <div className="ml-2 flex items-center gap-1">
            <Button variant="ghost" size="icon-control" aria-label="Semana anterior" onClick={() => irPara(somarDias(semana, -7))}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="ghost" size="icon-control" aria-label="Próxima semana" onClick={() => irPara(somarDias(semana, 7))}>
              <ChevronRight size={16} />
            </Button>
            <Button variant="outline" size="chrome" onClick={() => irPara(hoje)} disabled={dias.includes(hoje)}>
              Hoje
            </Button>
          </div>
          <span className="ml-1 truncate text-apoio font-medium first-letter:uppercase" data-agenda="mes">
            {mesAnoDoDia(somarDias(semana, 3))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!p.readOnly && (
            <>
              <Button size="control" onClick={() => setMarcar(true)} disabled={p.servicos.length === 0}>
                <CalendarPlus size={14} />
                Marcar horário
              </Button>
              <Button variant="outline" size="control" onClick={() => setBloquear(true)}>
                <Ban size={14} />
                <span className="max-sm:hidden">Bloquear</span>
              </Button>
            </>
          )}
          {p.dono && (
            <Button variant="outline" size="icon-control" aria-label="Configurações da agenda" asChild>
              <Link href={p.hrefConfig}>
                <Settings2 size={15} />
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[244px] shrink-0 border-r border-line p-4 max-lg:hidden" data-agenda="lateral">
          <MiniCalendario hoje={hoje} semana={semana} onEscolher={irPara} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Celular: um dia por vez, escolhido na faixa da semana. */}
          <div className="grid shrink-0 grid-cols-7 gap-1 border-b border-line px-2 py-2 md:hidden" data-agenda="faixa-dias">
            {dias.map((d, i) => (
              <Button
                key={d}
                variant="alternavel"
                size="none"
                aria-pressed={diaCelular === d}
                onClick={() => setDiaCelular(d)}
                className="flex h-12 flex-col items-center justify-center rounded-lg text-legenda"
              >
                <span className="uppercase">{CHAVES_DA_SEMANA[i]}</span>
                <span className={cn("text-apoio font-semibold", d === hoje && "text-brand-ink")}>{d.slice(8)}</span>
              </Button>
            ))}
          </div>

          <div className="grid shrink-0 grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b border-line max-md:hidden" data-agenda="cabecalho-dias">
            <span />
            {dias.map((d, i) => (
              <div
                key={d}
                data-agenda="cabecalho-dia"
                data-hoje={d === hoje ? "sim" : undefined}
                className={cn("flex items-center justify-center gap-1.5 border-l border-line py-2", d === hoje && "bg-brand-surface")}
              >
                <span className={cn("text-legenda uppercase", d === hoje ? "text-brand-ink" : "text-ink-3")}>
                  {CHAVES_DA_SEMANA[i]}
                </span>
                <span className={cn("text-apoio font-semibold tabular-nums", d === hoje && "text-brand-ink")}>{d.slice(8)}</span>
                {contagem(d) > 0 && (
                  <span className="rounded-md bg-[var(--chip-bg)] px-1.5 text-legenda tabular-nums text-ink-2" data-agenda="contador">
                    {contagem(d)}
                  </span>
                )}
              </div>
            ))}
          </div>

          <AreaRolavel className="min-h-0 flex-1" data-agenda="grade">
            <div
              className="relative grid grid-cols-[52px_repeat(7,minmax(0,1fr))] max-md:grid-cols-[44px_minmax(0,1fr)]"
              style={{ height: (horaAte - horaDe) * HORA_PX }}
            >
              <div className="relative">
                {Array.from({ length: horaAte - horaDe }, (_, i) => (
                  <span
                    key={i}
                    className="absolute right-2 -translate-y-1/2 text-legenda tabular-nums text-ink-3"
                    style={{ top: i * HORA_PX }}
                  >
                    {i === 0 ? "" : `${horaDe + i}h`}
                  </span>
                ))}
              </div>
              {dias.map((d) => (
                <ColunaDoDia
                  key={d}
                  dia={d}
                  hoje={hoje}
                  agora={p.agora}
                  horaDe={horaDe}
                  hours={p.hours}
                  itens={itens.filter((l) => diaIsoSP(l.inicio) === d)}
                  bloqueios={bloqueios.filter((b) => diaIsoSP(b.inicio) === d)}
                  escondidaNoCelular={d !== diaCelular}
                  onAbrir={setDetalhe}
                />
              ))}
            </div>
          </AreaRolavel>
        </div>
      </div>

      <DetalheDoHorario
        linha={detalhe}
        agora={p.agora}
        readOnly={!!p.readOnly}
        onFechar={() => setDetalhe(null)}
        onRemarcar={(l) => {
          setDetalhe(null);
          setRemarcar(l);
        }}
        onCancelar={(l) => {
          setDetalhe(null);
          setCancelar(l);
        }}
      />
      <DialogoMarcar aberto={marcar} onFechar={() => setMarcar(false)} fonte={p.fonte} servicos={p.servicos} hoje={hoje} onFeito={recarregar} />
      <DialogoRemarcar linha={remarcar} onFechar={() => setRemarcar(null)} fonte={p.fonte} hoje={hoje} onFeito={recarregar} />
      <DialogoBloquear aberto={bloquear} onFechar={() => setBloquear(false)} fonte={p.fonte} hoje={hoje} onFeito={recarregar} />
      <Dialog open={!!cancelar} onOpenChange={(v) => !v && setCancelar(null)}>
        <DialogContent tamanho="confirmacao" data-agenda="cancelar">
          {cancelar && (
            <ConfirmarCancelar
              l={cancelar}
              hoje={hoje}
              onConfirmar={async () => {
                const r = await p.fonte.cancelar(cancelar.id);
                if (r.ok) {
                  setCancelar(null);
                  void recarregar();
                }
                return r;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ColunaDoDia({
  dia,
  hoje,
  agora,
  horaDe,
  hours,
  itens,
  bloqueios,
  escondidaNoCelular,
  onAbrir,
}: {
  dia: string;
  hoje: string;
  agora: number;
  horaDe: number;
  hours: BusinessHours | null;
  itens: LinhaAgenda[];
  bloqueios: BloqueioAgenda[];
  escondidaNoCelular: boolean;
  onAbrir: (l: LinhaAgenda) => void;
}) {
  const base = inicioDoDia(dia) + horaDe * 3_600_000;
  const topo = (t: number) => ((t - base) / 60_000 / 60) * HORA_PX;
  const altura = (de: number, ate: number) => Math.max(20, ((ate - de) / 60_000 / 60) * HORA_PX - 2);
  const exp = hours ? expedienteDoDia(dia, hours) : null;
  return (
    <div
      data-agenda="coluna"
      data-dia={dia}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_PX - 1}px, var(--line-soft) ${HORA_PX - 1}px, var(--line-soft) ${HORA_PX}px)`,
      }}
      className={cn(
        "relative border-l border-line",
        dia === hoje && "bg-brand-surface/40",
        escondidaNoCelular && "max-md:hidden"
      )}
    >
      {/* Fora do expediente fica apagado: o time ainda marca ali, a IA não. */}
      {!exp && <div className="absolute inset-0 bg-[var(--chip-bg)] opacity-60" aria-hidden />}
      {exp && topo(exp.inicio) > 0 && (
        <div className="absolute inset-x-0 top-0 bg-[var(--chip-bg)] opacity-60" style={{ height: topo(exp.inicio) }} aria-hidden />
      )}
      {exp && (
        <div className="absolute inset-x-0 bottom-0 bg-[var(--chip-bg)] opacity-60" style={{ top: topo(exp.fim) }} aria-hidden />
      )}

      {bloqueios.map((b) => (
        <div
          key={`b${b.id}`}
          data-agenda="bloqueio"
          className="absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-line-strong bg-bloco px-1.5 py-1 text-legenda text-ink-3"
          style={{ top: topo(b.inicio), height: altura(b.inicio, b.fim) }}
        >
          <span className="flex items-center gap-1 truncate">
            <Ban size={11} className="shrink-0" />
            {b.motivo || "Bloqueado"}
          </span>
        </div>
      ))}

      {itens.map((l) => {
        const passou = l.fim <= agora;
        return (
          <Button
            key={l.id}
            variant="nu"
            size="none"
            data-agenda="cartao"
            data-situacao={l.status}
            onClick={() => onAbrir(l)}
            className={cn(
              "absolute inset-x-1 z-10 flex-col items-start justify-center overflow-hidden rounded-md border border-line bg-raised pl-2.5 pr-1.5 text-left shadow-[var(--panel-shadow)] hover:border-line-strong",
              passou && "opacity-60"
            )}
            style={{ top: topo(l.inicio), height: altura(l.inicio, l.fim) }}
          >
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: corDoServico(l.servicoId) }} aria-hidden />
            <span className="flex w-full items-center gap-1 truncate text-legenda font-semibold text-ink">
              {l.origem === "ia" && <Sparkles size={11} className="shrink-0 text-brand-ink" aria-label="Marcado pela IA" />}
              {/* Cartão baixo (15 min): uma linha só, com a hora na frente. */}
              {altura(l.inicio, l.fim) < 34 && <span className="shrink-0 tabular-nums text-ink-3">{hhmm(l.inicio)}</span>}
              <span className="truncate">{l.nome || prettyPhone(l.phone)}</span>
            </span>
            {altura(l.inicio, l.fim) >= 34 && (
              <span className="w-full truncate text-legenda tabular-nums text-ink-3">
                {hhmm(l.inicio)} {l.servicoNome}
              </span>
            )}
          </Button>
        );
      })}

      {dia === hoje && agora >= base && (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: topo(agora) }} data-agenda="agora">
          <span className="-ml-1 size-2 rounded-full bg-brand" />
          <span className="h-px flex-1 bg-brand" />
        </div>
      )}
    </div>
  );
}

function MiniCalendario({ hoje, semana, onEscolher }: { hoje: string; semana: string; onEscolher: (d: string) => void }) {
  const [mes, setMes] = useState(semana.slice(0, 7));
  const [semanaVista, setSemanaVista] = useState(semana);
  if (semana !== semanaVista) {
    setSemanaVista(semana);
    setMes(somarDias(semana, 3).slice(0, 7));
  }
  const primeiro = `${mes}-01`;
  const inicio = segundaDaSemana(primeiro);
  const semanas = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => somarDias(inicio, w * 7 + d)));
  const visiveis = semanas.filter((s) => s.some((d) => d.slice(0, 7) === mes));
  const trocar = (n: number) => {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div data-agenda="minicalendario">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-apoio font-semibold first-letter:uppercase">{mesAnoDoDia(primeiro)}</span>
        <div className="flex">
          <Button variant="ghost" size="icon-chrome" aria-label="Mês anterior" onClick={() => trocar(-1)}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="ghost" size="icon-chrome" aria-label="Próximo mês" onClick={() => trocar(1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-legenda text-ink-3">
        {CHAVES_DA_SEMANA.map((c) => (
          <span key={c} className="py-1">{DAY_LABEL[c].charAt(0).toUpperCase()}</span>
        ))}
      </div>
      <div className="space-y-0.5">
        {visiveis.map((s) => {
          const exibida = s[0] === semana;
          return (
            <div
              key={s[0]}
              data-agenda="mini-semana"
              data-exibida={exibida ? "sim" : undefined}
              className={cn("grid grid-cols-7 rounded-lg", exibida && "bg-brand-surface")}
            >
              {s.map((d) => (
                <Button
                  key={d}
                  variant="nu"
                  size="none"
                  onClick={() => onEscolher(d)}
                  aria-label={`Ir para a semana de ${d.slice(8)}/${d.slice(5, 7)}`}
                  className={cn(
                    "mx-auto flex size-7 items-center justify-center rounded-full text-legenda tabular-nums hover:bg-[var(--active-bg)]",
                    d.slice(0, 7) !== mes && "text-ink-3",
                    exibida && "text-brand-ink",
                    d === hoje && "bg-primary font-semibold text-primary-foreground hover:bg-primary"
                  )}
                >
                  {Number(d.slice(8))}
                </Button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetalheDoHorario({
  linha,
  agora,
  readOnly,
  onFechar,
  onRemarcar,
  onCancelar,
}: {
  linha: LinhaAgenda | null;
  agora: number;
  readOnly: boolean;
  onFechar: () => void;
  onRemarcar: (l: LinhaAgenda) => void;
  onCancelar: (l: LinhaAgenda) => void;
}) {
  const l = linha;
  const passou = !!l && l.fim <= agora;
  return (
    <Sheet open={!!l} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent data-agenda="detalhe">
        {l && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-line px-6 py-4">
              <AvatarContato phone={l.phone} name={l.nome} size="lg" />
              <div className="min-w-0">
                <SheetTitle className="truncate">{l.nome || prettyPhone(l.phone)}</SheetTitle>
                <SheetDescription className="text-apoio text-ink-3">{l.servicoNome}</SheetDescription>
              </div>
            </div>
            <AreaRolavel className="min-h-0 flex-1">
              <dl className="space-y-4 px-6 py-5 text-apoio">
                <Item icone={Clock} rotulo="Horário">
                  {diaFalado(l.inicio, agora).replace(/^./, (c) => c.toUpperCase())}, {faixaHoraria(l.inicio, l.fim)}
                </Item>
                <Item icone={Phone} rotulo="Telefone">{prettyPhone(l.phone)}</Item>
                <Item icone={l.origem === "ia" ? Sparkles : UserRound} rotulo="Marcado por">
                  {l.origem === "ia" ? "IA, na conversa" : "Time, pela agenda"}
                </Item>
                <Item icone={MessagesSquare} rotulo="Do que se trata">
                  {l.resumo || <span className="text-ink-3">Sem descrição.</span>}
                </Item>
                <Item icone={l.lembreteEm ? Bell : BellOff} rotulo="Lembrete">
                  {l.lembreteEm
                    ? `Automático, ${quandoFalado(l.lembreteEm, agora)}`
                    : "Sem lembrete (desligado ou marcado com menos de 24h)."}
                </Item>
              </dl>
            </AreaRolavel>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3">
              <Button variant="outline" size="field" className="px-4" asChild>
                <Link href={`/inbox/${encodeURIComponent(l.phone)}`}>Abrir conversa</Link>
              </Button>
              {!readOnly && !passou && (
                <>
                  <Button variant="outline" size="field" className="px-4" onClick={() => onRemarcar(l)}>
                    <Repeat size={14} />
                    Remarcar
                  </Button>
                  <Button variant="danger" size="field" className="px-4" onClick={() => onCancelar(l)}>
                    <CalendarX2 size={14} />
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Item({ icone: Icone, rotulo, children }: { icone: typeof Clock; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icone size={16} className="mt-0.5 shrink-0 text-ink-3" />
      <div className="min-w-0">
        <dt className="text-rotulo uppercase text-ink-3">{rotulo}</dt>
        <dd className="mt-0.5 text-ink">{children}</dd>
      </div>
    </div>
  );
}

function ConfirmarCancelar({ l, hoje, onConfirmar }: { l: LinhaAgenda; hoje: string; onConfirmar: () => Promise<{ ok: boolean; erro?: string }> }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <DialogTitle>Cancelar este horário?</DialogTitle>
      <DialogDescription className="mt-2 mb-5">
        {l.nome || prettyPhone(l.phone)}, {rotuloDoDia(diaIsoSP(l.inicio), hoje).toLowerCase()}, {faixaHoraria(l.inicio, l.fim)}. O horário fica livre para a IA oferecer. O contato não é avisado automaticamente.
      </DialogDescription>
      {erro && <p className="mb-3 text-apoio text-danger-ink" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="outline" size="field" className="px-4">Manter</Button>
        </DialogClose>
        <Button
          variant="danger"
          size="field"
          className="px-4"
          carregando={enviando}
          onClick={async () => {
            setEnviando(true);
            const r = await onConfirmar();
            setEnviando(false);
            if (!r.ok) setErro(r.erro ?? "não foi possível cancelar");
          }}
        >
          Cancelar horário
        </Button>
      </div>
    </>
  );
}

/** Os horários livres de um dia, como botões de escolha (regra do time: sem antecedência). */
function EscolherHorario({
  fonte,
  servicoId,
  dia,
  ignorar,
  fora,
  valor,
  onEscolher,
}: {
  fonte: FonteAgenda;
  servicoId: number | null;
  dia: string;
  ignorar?: number;
  fora: boolean;
  valor: number | null;
  onEscolher: (t: number) => void;
}) {
  const [inicios, setInicios] = useState<number[] | null>(null);
  const [chave, setChave] = useState("");
  const pedida = `${servicoId}|${dia}|${ignorar ?? ""}|${fora}`;
  useEffect(() => {
    if (servicoId === null || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
    let vivo = true;
    fonte
      .horarios(servicoId, dia, ignorar, fora)
      .then((hs) => {
        if (!vivo) return;
        setInicios(hs);
        setChave(pedida);
      })
      .catch(() => vivo && setInicios([]));
    return () => {
      vivo = false;
    };
  }, [fonte, servicoId, dia, ignorar, fora, pedida]);
  if (servicoId === null) return null;
  if (inicios === null || chave !== pedida) return <p className="text-legenda text-ink-3">Buscando horários livres...</p>;
  if (inicios.length === 0) return <p className="text-legenda text-ink-3">Nenhum horário livre neste dia.</p>;
  return (
    <AreaRolavel className="max-h-40">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Horários livres" data-agenda="horarios">
        {inicios.map((t) => (
          <Button key={t} variant="alternavel" size="chip" aria-pressed={valor === t} onClick={() => onEscolher(t)}>
            {hhmm(t)}
          </Button>
        ))}
      </div>
    </AreaRolavel>
  );
}

function ForaDoExpediente({ valor, onMudar }: { valor: boolean; onMudar: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-apoio">
      <Checkbox checked={valor} onCheckedChange={(v) => onMudar(v === true)} />
      Mostrar horários fora do expediente
    </label>
  );
}

function DialogoMarcar({
  aberto,
  onFechar,
  fonte,
  servicos,
  hoje,
  onFeito,
}: {
  aberto: boolean;
  onFechar: () => void;
  fonte: FonteAgenda;
  servicos: ServicoDaAgenda[];
  hoje: string;
  onFeito: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [nome, setNome] = useState("");
  const [resumo, setResumo] = useState("");
  const [servicoId, setServicoId] = useState<number | null>(null);
  const [dia, setDia] = useState(hoje);
  const [fora, setFora] = useState(false);
  const [inicio, setInicio] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const servicoAtual = servicoId ?? servicos[0]?.id ?? null;
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent tamanho="confirmacao" className="max-w-md" data-agenda="marcar">
        <DialogTitle>Marcar horário</DialogTitle>
        <DialogDescription className="mt-2 mb-4">O contato não é avisado automaticamente.</DialogDescription>
        <div className="space-y-3">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp com DDD" aria-label="WhatsApp do contato" inputMode="tel" />
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (opcional)" aria-label="Nome do contato" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={servicoAtual === null ? "" : String(servicoAtual)} onValueChange={(v) => { setServicoId(Number(v)); setInicio(null); }}>
              <SelectTrigger aria-label="Serviço" className="w-full"><SelectValue placeholder="Serviço" /></SelectTrigger>
              <SelectContent>
                {servicos.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.nome} ({s.duracaoMin} min)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dia} min={hoje} onChange={(e) => { setDia(e.target.value); setInicio(null); }} aria-label="Dia" />
          </div>
          <ForaDoExpediente valor={fora} onMudar={(v) => { setFora(v); setInicio(null); }} />
          <EscolherHorario fonte={fonte} servicoId={servicoAtual} dia={dia} fora={fora} valor={inicio} onEscolher={setInicio} />
          <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={2} placeholder="Do que se trata (opcional)" aria-label="Do que se trata" maxLength={500} />
        </div>
        {erro && <p className="mt-3 text-apoio text-danger-ink" role="alert">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="field" className="px-4">Cancelar</Button>
          </DialogClose>
          <Button
            size="field"
            className="px-4"
            carregando={enviando}
            disabled={!phone.trim() || servicoAtual === null || inicio === null}
            onClick={async () => {
              if (servicoAtual === null || inicio === null) return;
              setEnviando(true);
              const r = await fonte.marcar({ phone: phone.replace(/\D/g, ""), nome, servicoId: servicoAtual, inicio, resumo });
              setEnviando(false);
              if (!r.ok) return setErro(r.erro);
              setPhone(""); setNome(""); setResumo(""); setInicio(null); setErro(null);
              onFechar();
              onFeito();
            }}
          >
            Marcar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DialogoRemarcar({ linha, onFechar, fonte, hoje, onFeito }: { linha: LinhaAgenda | null; onFechar: () => void; fonte: FonteAgenda; hoje: string; onFeito: () => void }) {
  const [dia, setDia] = useState(hoje);
  const [fora, setFora] = useState(false);
  const [inicio, setInicio] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [vista, setVista] = useState<LinhaAgenda | null>(null);
  if (linha !== vista) {
    setVista(linha);
    if (linha) {
      setDia(diaIsoSP(linha.inicio) < hoje ? hoje : diaIsoSP(linha.inicio));
      setInicio(null);
      setErro(null);
    }
  }
  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent tamanho="confirmacao" className="max-w-md" data-agenda="remarcar">
        {linha && (
          <>
            <DialogTitle>Remarcar</DialogTitle>
            <DialogDescription className="mt-2 mb-4">
              {linha.nome || prettyPhone(linha.phone)}, {linha.servicoNome}. Hoje em {rotuloDoDia(diaIsoSP(linha.inicio), hoje).toLowerCase()}, {faixaHoraria(linha.inicio, linha.fim)}.
            </DialogDescription>
            <div className="space-y-3">
              <Input type="date" value={dia} min={hoje} onChange={(e) => { setDia(e.target.value); setInicio(null); }} aria-label="Novo dia" />
              <ForaDoExpediente valor={fora} onMudar={(v) => { setFora(v); setInicio(null); }} />
              <EscolherHorario fonte={fonte} servicoId={linha.servicoId ?? -1} dia={dia} ignorar={linha.id} fora={fora} valor={inicio} onEscolher={setInicio} />
            </div>
            {erro && <p className="mt-3 text-apoio text-danger-ink" role="alert">{erro}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" size="field" className="px-4">Voltar</Button>
              </DialogClose>
              <Button
                size="field"
                className="px-4"
                carregando={enviando}
                disabled={inicio === null}
                onClick={async () => {
                  if (inicio === null) return;
                  setEnviando(true);
                  const r = await fonte.remarcar(linha.id, inicio);
                  setEnviando(false);
                  if (!r.ok) return setErro(r.erro);
                  onFechar();
                  onFeito();
                }}
              >
                Remarcar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DialogoBloquear({ aberto, onFechar, fonte, hoje, onFeito }: { aberto: boolean; onFechar: () => void; fonte: FonteAgenda; hoje: string; onFeito: () => void }) {
  const [dia, setDia] = useState(hoje);
  const [de, setDe] = useState("12:00");
  const [ate, setAte] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const min = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent tamanho="confirmacao" className="max-w-md" data-agenda="bloquear">
        <DialogTitle>Bloquear horário</DialogTitle>
        <DialogDescription className="mt-2 mb-4">A IA não oferece este trecho. O que já está marcado nele continua.</DialogDescription>
        <div className="space-y-3">
          <Input type="date" value={dia} min={hoje} onChange={(e) => setDia(e.target.value)} aria-label="Dia do bloqueio" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="time" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Das" />
            <Input type="time" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
          </div>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" aria-label="Motivo" maxLength={120} />
        </div>
        {erro && <p className="mt-3 text-apoio text-danger-ink" role="alert">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="field" className="px-4">Cancelar</Button>
          </DialogClose>
          <Button
            size="field"
            className="px-4"
            carregando={enviando}
            disabled={!dia || !de || !ate}
            onClick={async () => {
              const base = inicioDoDia(dia);
              const inicio = base + min(de) * 60_000;
              const fim = base + min(ate) * 60_000;
              if (fim <= inicio) return setErro("O fim precisa ser depois do início.");
              setEnviando(true);
              const r = await fonte.bloquear({ inicio, fim, motivo });
              setEnviando(false);
              if (!r.ok) return setErro(r.erro);
              setMotivo(""); setErro(null);
              onFechar();
              onFeito();
            }}
          >
            Bloquear
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
