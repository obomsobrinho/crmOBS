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
  CheckCircle2,
  Clock,
  MessagesSquare,
  Phone,
  Plus,
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
  minutoParaCentralizar,
  trechosFechadosDoDia,
  type TrechoDoDia,
  faixaHoraria,
  hhmm,
  quandoFalado,
  rotuloDoDia,
  HORA_DO_LEMBRETE,
  execucaoDoDia,
  lembreteDoHorario,
  segundaDaSemana,
  feriadoQueFecha,
  type AgendaConfig,
  type ServicoDaAgenda,
} from "@/lib/agenda";
import { inicioDoDia, type BloqueioAgenda, type ContatoDaBusca, type FonteAgenda, type LinhaAgenda } from "@/lib/agenda-fonte";
import { useDebounce } from "@/lib/use-debounce";
import { CampoBusca } from "@/components/ui/campo-busca";
import { diaIsoSP, mesAnoDoDia, somarDias, somarMes } from "@/lib/fuso";
import { prettyPhone } from "@/lib/format";
import { ROTULO_CHAVES, fillDoRotulo } from "@/lib/rotulos";
import { feriadoDoDia } from "@/lib/feriados";
import { cn } from "@/lib/utils";

// A tela da AGENDA PRÓPRIA (revisão do dono, 28/10/2026): GRADE SEMANAL no
// estilo Google Agenda (referência: Clinic Radar), colunas por dia com
// contador, a linha do "agora", cartões com barra colorida à esquerda e o dia
// de hoje destacado. Na lateral, o minicalendário do mês com a semana exibida
// em destaque (sem a lista de compromissos da referência). Clique num horário
// abre o detalhe com remarcar e cancelar. No celular, um dia por vez.
// Os dados vêm SÓ da `fonte` (banco em `/agenda`, memória em `/design/agenda`).

/**
 * A altura de uma hora na grade, SEMPRE a mesma (30 min = nome e horário legíveis).
 * A grade tem as 24 horas do dia (redesenho de 31/10/2026): antes ela só desenhava
 * o horário da agenda e, com poucas horas (a OBS atende das 13h às 18h), acabava no
 * meio da tela com a linha do "agora" solta embaixo, fora da grade.
 */
const HORA_PX = 72;
const HORAS = 24;
const DIA_MS = 86_400_000;
const CHAVES_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"] as const;

export interface PropsAgenda {
  fonte: FonteAgenda;
  agora: number;
  empresa: string;
  dono: boolean;
  /** false = tabelas ausentes (migration não aplicada) ou leitura falhou. */
  disponivel: boolean;
  /** O horário da AGENDA (próprio, ou a cópia do de atendimento), ou null. */
  hours: BusinessHours | null;
  /** O horário de ATENDIMENTO da loja (decide o dia do lembrete). */
  horarioAtendimento: BusinessHours | null;
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

export default function Agenda(p: PropsAgenda) {
  const hoje = diaIsoSP(p.agora);
  const [semana, setSemana] = useState(p.inicial.semana);
  const [diaCelular, setDiaCelular] = useState(hoje);
  const [itens, setItens] = useState(p.inicial.itens);
  const [bloqueios, setBloqueios] = useState(p.inicial.bloqueios);
  const [detalhe, setDetalhe] = useState<LinhaAgenda | null>(null);
  const [marcar, setMarcar] = useState(false);
  /** Clique num horário vazio da grade: o "Marcar horário" já vem com dia e hora. */
  const [marcarEm, setMarcarEm] = useState<{ dia: string; inicio: number } | null>(null);
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

  // Ao abrir (e a cada semana), a rolagem fica mais ou menos no meio do horário de
  // atendimento, ou na hora de agora quando ela está dentro dele.
  const grade = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = grade.current;
    if (!el) return;
    const minuto = minutoParaCentralizar(dias, p.hours, p.agora, p.config);
    el.scrollTop = Math.max(0, (minuto / 60) * HORA_PX - el.clientHeight / 2);
    // Marca (no DOM, sem estado) que a rolagem inicial já aconteceu: quem clica num cartão
    // logo ao abrir (os testes) espera por ela, para o clique não mudar de lugar.
    el.dataset.centralizada = "sim";
  }, [dias, p.hours, p.agora, p.config]);

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

          {/* ⚠️ O mesmo `scrollbar-gutter: stable` no cabeçalho e na grade (31/10/2026): a barra de rolagem
              só existe na grade, e sem a reserva as colunas de cima saíam mais largas que as de baixo. */}
          <div className="grid shrink-0 grid-cols-[52px_repeat(7,minmax(0,1fr))] overflow-y-hidden border-b border-line [scrollbar-gutter:stable] max-md:hidden" data-agenda="cabecalho-dias">
            <span />
            {dias.map((d, i) => (
              <div
                key={d}
                data-agenda="cabecalho-dia"
                data-hoje={d === hoje ? "sim" : undefined}
                className={cn("flex min-w-0 items-center justify-center gap-1.5 border-l border-line px-1 py-2", d === hoje && "bg-brand-surface")}
              >
                <span className={cn("text-legenda uppercase", d === hoje ? "text-ink" : "text-ink-3")}>
                  {CHAVES_DA_SEMANA[i]}
                </span>
                <span className="text-apoio font-semibold tabular-nums">{d.slice(8)}</span>
                {feriadoDoDia(d) && (
                  <span className="min-w-0 truncate text-legenda text-ink-3" title={feriadoDoDia(d)!.nome} data-agenda="feriado">
                    {feriadoDoDia(d)!.nome}
                  </span>
                )}
              </div>
            ))}
          </div>

          <AreaRolavel ref={grade} className="min-h-0 flex-1 [scrollbar-gutter:stable]" data-agenda="grade">
            <div
              className="relative grid grid-cols-[52px_repeat(7,minmax(0,1fr))] max-md:grid-cols-[44px_minmax(0,1fr)]"
              style={{ height: HORAS * HORA_PX }}
            >
              <div className="relative">
                {/* 0h e 24h aparecem dentro da grade (sem cortar). */}
                {Array.from({ length: HORAS + 1 }, (_, i) => (
                  <span
                    key={i}
                    data-agenda="hora"
                    className={cn(
                      "absolute right-2 text-legenda tabular-nums text-ink-3",
                      i === 0 ? "translate-y-0.5" : i === HORAS ? "-translate-y-full" : "-translate-y-1/2"
                    )}
                    style={{ top: i * HORA_PX }}
                  >
                    {`${i}h`}
                  </span>
                ))}
              </div>
              {dias.map((d) => (
                <ColunaDoDia
                  key={d}
                  dia={d}
                  hoje={hoje}
                  agora={p.agora}
                  fechados={trechosFechadosDoDia(d, p.hours, p.config)}
                  itens={itens.filter((l) => diaIsoSP(l.inicio) === d)}
                  bloqueios={bloqueios.filter((b) => b.inicio < inicioDoDia(d) + DIA_MS && b.fim > inicioDoDia(d))}
                  escondidaNoCelular={d !== diaCelular}
                  onAbrir={setDetalhe}
                  feriado={!!feriadoQueFecha(d, p.config)}
                  onVazio={(dia, inicio) => {
                    if (p.readOnly || p.servicos.length === 0) return;
                    setMarcarEm({ dia, inicio });
                    setMarcar(true);
                  }}
                />
              ))}
            </div>
          </AreaRolavel>
        </div>
      </div>

      <DetalheDoHorario
        linha={detalhe}
        horarioAtendimento={p.horarioAtendimento}
        lembreteLigado={p.config.lembrete}
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
      <DialogoMarcar
        aberto={marcar}
        inicial={marcarEm}
        horasDaAgenda={p.hours}
        onFechar={() => {
          setMarcar(false);
          setMarcarEm(null);
        }}
        fonte={p.fonte}
        servicos={p.servicos}
        hoje={hoje}
        onFeito={recarregar}
      />
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
  fechados,
  itens,
  bloqueios,
  escondidaNoCelular,
  onAbrir,
  feriado,
  onVazio,
}: {
  dia: string;
  hoje: string;
  agora: number;
  /**
   * Fora do horário da agenda (antes, depois, o dia fechado, o feriado que a agenda não
   * atende): UM visual só, o dos dias fechados; o time ainda marca ali, a IA não.
   */
  fechados: TrechoDoDia[];
  itens: LinhaAgenda[];
  bloqueios: BloqueioAgenda[];
  escondidaNoCelular: boolean;
  onAbrir: (l: LinhaAgenda) => void;
  /** Feriado nacional que a agenda não atende neste dia. */
  feriado: boolean;
  onVazio: (dia: string, inicio: number) => void;
}) {
  const base = inicioDoDia(dia);
  const topo = (t: number) => ((t - base) / 60_000 / 60) * HORA_PX;
  const altura = (de: number, ate: number) => Math.max(20, ((ate - de) / 60_000 / 60) * HORA_PX - 2);
  const alturaTotal = HORAS * HORA_PX;
  return (
    <div
      data-agenda="coluna"
      data-dia={dia}
      data-feriado={feriado ? "sim" : undefined}
      className={cn(
        "relative border-l border-line",
        dia === hoje && "bg-brand-surface/40",
        escondidaNoCelular && "max-md:hidden"
      )}
    >
      {/* Clique no vazio: "Marcar horário" com o dia e a hora (de meia em meia hora).
          Um botão no fundo da coluna; os cartões ficam por cima. */}
      <Button
        variant="nu"
        size="none"
        aria-label={`Novo horário no dia ${dia.slice(8)}/${dia.slice(5, 7)}`}
        data-agenda="vazio"
        className="absolute inset-0 z-0 rounded-none"
        onClick={(e) => {
          const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
          const min = Math.floor(((y / HORA_PX) * 60) / 30) * 30;
          onVazio(dia, base + min * 60_000);
        }}
      />
      {/* Linhas só ENTRE as horas: no topo vale a borda do cabeçalho e no fim a
          borda do cartão (ajuste do dono: eram duas linhas coladas). */}
      {Array.from({ length: Math.max(0, HORAS - 1) }, (_, i) => (
        <div key={`h${i}`} className="pointer-events-none absolute inset-x-0 h-px bg-[var(--line-soft)]" style={{ top: (i + 1) * HORA_PX }} aria-hidden />
      ))}
      {fechados.map(([de, ate]) => (
        <div
          key={`f${de}`}
          data-agenda="fechado"
          className="pointer-events-none absolute inset-x-0 bg-[var(--chip-bg)] opacity-60"
          style={{ top: (de / 60) * HORA_PX, height: ((ate - de) / 60) * HORA_PX }}
          aria-hidden
        />
      ))}

      {/* Bloqueio de vários dias aparece em cada dia que cobre, recortado à grade. */}
      {bloqueios.map((b) => {
        const de = Math.max(0, topo(b.inicio));
        const ate = Math.min(alturaTotal, topo(b.fim));
        if (ate <= de) return null;
        return (
          <div
            key={`b${b.id}`}
            data-agenda="bloqueio"
            className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-line-strong bg-bloco px-1.5 py-1 text-legenda text-ink-3"
            style={{ top: de, height: Math.max(20, ate - de - 2) }}
          >
            <span className="flex items-center gap-1 truncate">
              <Ban size={11} className="shrink-0" />
              {b.motivo || "Bloqueado"}
            </span>
          </div>
        );
      })}

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
              {l.confirmadoEm && <CheckCircle2 size={11} className="shrink-0 text-human-ink" aria-label="Presença confirmada" data-agenda="cartao-confirmado" />}
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
  const trocar = (n: number) => setMes(somarMes(mes, n));
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
  horarioAtendimento,
  lembreteLigado,
  agora,
  readOnly,
  onFechar,
  onRemarcar,
  onCancelar,
}: {
  linha: LinhaAgenda | null;
  horarioAtendimento: BusinessHours | null;
  lembreteLigado: boolean;
  agora: number;
  readOnly: boolean;
  onFechar: () => void;
  onRemarcar: (l: LinhaAgenda) => void;
  onCancelar: (l: LinhaAgenda) => void;
}) {
  const l = linha;
  const passou = !!l && l.fim <= agora;
  // Lembrete: às 9h do último dia em que a loja abre antes do horário.
  const textoLembrete = ((): { ok: boolean; texto: string } => {
    if (!l) return { ok: false, texto: "" };
    if (l.lembreteEnviadoEm) return { ok: true, texto: `Enviado ${quandoFalado(l.lembreteEnviadoEm, agora)}` };
    const r = lembreteDoHorario({ inicio: l.inicio, marcadoEm: l.marcadoEm, hours: horarioAtendimento, ligado: lembreteLigado });
    return r
      ? { ok: true, texto: `Automático, ${diaFalado(execucaoDoDia(r.dia), agora)}, às ${HORA_DO_LEMBRETE}h` }
      : { ok: false, texto: "Sem lembrete (desligado ou marcado depois da execução das 9h)." };
  })();
  // Hierarquia (ajuste do dono, 28/10/2026): QUEM e QUANDO em destaque, depois
  // o serviço; telefone e "do que se trata" são apoio; as ações no rodapé.
  return (
    <Sheet open={!!l} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent data-agenda="detalhe">
        {l && (
          <div className="flex h-full flex-col">
            <AreaRolavel className="min-h-0 flex-1">
              <div className="px-6 pb-5 pt-6">
                <div className="flex items-center gap-3">
                  <AvatarContato phone={l.phone} name={l.nome} size="xl" />
                  <SheetTitle className="min-w-0 truncate text-titulo" data-agenda="detalhe-nome">
                    {l.nome || prettyPhone(l.phone)}
                  </SheetTitle>
                </div>
                <div className="mt-5 rounded-xl border border-line bg-bloco px-4 py-3" data-agenda="detalhe-quando">
                  <p className="font-display text-cartao text-ink first-letter:uppercase">{diaFalado(l.inicio, agora)}</p>
                  <p className="mt-0.5 text-titulo tabular-nums">{faixaHoraria(l.inicio, l.fim)}</p>
                  {passou && <p className="mt-1 text-legenda text-ink-3">Este horário já passou.</p>}
                </div>
                <SheetDescription asChild>
                  <p className="mt-4 flex items-center gap-2 text-corpo text-ink" data-agenda="detalhe-servico">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: corDoServico(l.servicoId) }} aria-hidden />
                    {l.servicoNome}
                  </p>
                </SheetDescription>

                <dl className="mt-6 space-y-3 border-t border-line pt-4 text-apoio" data-agenda="detalhe-apoio">
                  <Item icone={Phone} rotulo="Telefone">{prettyPhone(l.phone)}</Item>
                  <Item icone={MessagesSquare} rotulo="Do que se trata">
                    {l.resumo || <span className="text-ink-3">Sem descrição.</span>}
                  </Item>
                  <Item icone={l.origem === "ia" ? Sparkles : UserRound} rotulo="Marcado por">
                    {l.origem === "ia" ? "IA, na conversa" : "Time, pela agenda"}
                  </Item>
                  <Item icone={textoLembrete.ok ? Bell : BellOff} rotulo="Lembrete">{textoLembrete.texto}</Item>
                  {l.lembreteEnviadoEm && (
                    <Item icone={l.confirmadoEm ? CheckCircle2 : Clock} rotulo="Presença">
                      <span data-agenda="detalhe-presenca">
                        {l.confirmadoEm ? `Confirmada pelo contato ${quandoFalado(l.confirmadoEm, agora)}` : "Aguardando confirmação do contato"}
                      </span>
                    </Item>
                  )}
                </dl>
                <Button variant="link" size="link" className="mt-4" asChild>
                  <Link href={`/inbox/${encodeURIComponent(l.phone)}`}>
                    <MessagesSquare size={14} />
                    Abrir conversa
                  </Link>
                </Button>
              </div>
            </AreaRolavel>
            {!readOnly && !passou && (
              <div className="grid grid-cols-2 gap-2 border-t border-line px-6 py-3" data-agenda="detalhe-acoes">
                <Button variant="danger-ghost" size="field" className="justify-center border border-line" onClick={() => onCancelar(l)}>
                  <CalendarX2 size={15} />
                  Cancelar
                </Button>
                <Button size="field" className="justify-center" onClick={() => onRemarcar(l)}>
                  <Repeat size={15} />
                  Remarcar
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Item({ icone: Icone, rotulo, children }: { icone: typeof Clock; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Icone size={14} className="mt-0.5 shrink-0 text-ink-3" />
      <div className="min-w-0">
        <dt className="text-legenda text-ink-3">{rotulo}</dt>
        <dd className="text-ink-2">{children}</dd>
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

/** Campo de data que abre o calendário ao clicar em qualquer parte (não só no ícone). */
function CampoData(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <Input
      {...props}
      type="date"
      className={cn("w-full cursor-pointer", props.className)}
      onClick={(e) => {
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Navegador sem showPicker: o clique segue o padrão dele.
        }
      }}
    />
  );
}

/**
 * Busca de contato do "Marcar horário" (ajuste do dono, 28/10/2026): por nome
 * ou telefone, no SERVIDOR (`fonte.buscarContatos`, a mesma busca da tela
 * Contatos), com debounce e limite; nunca a lista inteira. Sem resultado,
 * segue como contato novo (telefone e nome digitados).
 */
function BuscaDeContato({
  fonte,
  escolhido,
  onEscolher,
  onNovo,
}: {
  fonte: FonteAgenda;
  escolhido: ContatoDaBusca | null;
  onEscolher: (c: ContatoDaBusca | null) => void;
  onNovo: (digitado: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const atrasada = useDebounce(busca, 300);
  const [resultado, setResultado] = useState<{ chave: string; lista: ContatoDaBusca[] } | null>(null);
  useEffect(() => {
    const q = atrasada.trim();
    if (q.length < 2) return;
    let vivo = true;
    fonte
      .buscarContatos(q)
      .then((lista) => vivo && setResultado({ chave: q, lista }))
      .catch(() => vivo && setResultado({ chave: q, lista: [] }));
    return () => {
      vivo = false;
    };
  }, [fonte, atrasada]);

  if (escolhido) {
    return (
      <div className="flex h-[var(--h-field)] items-center gap-2.5 rounded-lg border border-line bg-bloco px-3" data-agenda="contato-escolhido">
        <AvatarContato phone={escolhido.phone} name={escolhido.nome} size="2xs" />
        <span className="min-w-0 flex-1 truncate text-apoio">
          <span className="font-medium">{escolhido.nome || prettyPhone(escolhido.phone)}</span>
          {escolhido.nome && <span className="text-ink-3"> · {prettyPhone(escolhido.phone)}</span>}
        </span>
        <Button variant="link" size="link" onClick={() => onEscolher(null)}>
          Trocar
        </Button>
      </div>
    );
  }

  const q = busca.trim();
  const pronta = resultado && resultado.chave === q ? resultado.lista : null;
  return (
    <div data-agenda="busca-contato">
      <CampoBusca
        valor={busca}
        aoMudar={setBusca}
        placeholder="Buscar contato por nome ou telefone"
        rotulo="Buscar contato"
        className="w-full"
      />
      {q.length >= 2 && (
        <div className="mt-1.5 rounded-lg border border-line" data-agenda="resultados-contato">
          {pronta === null ? (
            <p className="px-3 py-2 text-legenda text-ink-3">Buscando...</p>
          ) : (
            <>
              {pronta.map((c) => (
                <Button
                  key={c.phone}
                  variant="linha"
                  size="linha"
                  className="h-10 w-full gap-2.5"
                  onClick={() => onEscolher(c)}
                >
                  <AvatarContato phone={c.phone} name={c.nome} size="2xs" />
                  <span className="min-w-0 flex-1 truncate text-apoio">{c.nome || prettyPhone(c.phone)}</span>
                  {c.nome && <span className="shrink-0 text-legenda text-ink-3">{prettyPhone(c.phone)}</span>}
                </Button>
              ))}
              {pronta.length === 0 && <p className="px-3 py-2 text-legenda text-ink-3">Nenhum contato encontrado.</p>}
              <Button variant="linha" size="linha" className="h-10 w-full gap-2 border-t border-line text-brand-ink" onClick={() => onNovo(q)}>
                <Plus size={14} />
                Contato novo
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DialogoMarcar({
  aberto,
  inicial,
  horasDaAgenda,
  onFechar,
  fonte,
  servicos,
  hoje,
  onFeito,
}: {
  aberto: boolean;
  /** Veio de um clique num horário vazio da grade: dia e hora já escolhidos. */
  inicial: { dia: string; inicio: number } | null;
  horasDaAgenda: BusinessHours | null;
  onFechar: () => void;
  fonte: FonteAgenda;
  servicos: ServicoDaAgenda[];
  hoje: string;
  onFeito: () => void;
}) {
  const [contato, setContato] = useState<ContatoDaBusca | null>(null);
  const [novo, setNovo] = useState(false);
  const [phone, setPhone] = useState("");
  const [nome, setNome] = useState("");
  const [resumo, setResumo] = useState("");
  const [servicoId, setServicoId] = useState<number | null>(null);
  const [dia, setDia] = useState(hoje);
  const [fora, setFora] = useState(false);
  const [inicio, setInicio] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Aberto por um clique na grade: dia e hora preenchidos; fora do expediente já liga
  // a caixa, para o horário clicado aparecer na lista.
  const [inicialVisto, setInicialVisto] = useState<typeof inicial>(null);
  if (aberto && inicial !== inicialVisto) {
    setInicialVisto(inicial);
    if (inicial) {
      const exp = horasDaAgenda ? expedienteDoDia(inicial.dia, horasDaAgenda) : null;
      setDia(inicial.dia);
      setInicio(inicial.inicio);
      setFora(!exp || inicial.inicio < exp.inicio || inicial.inicio >= exp.fim);
    }
  }
  const servicoAtual = servicoId ?? servicos[0]?.id ?? null;
  const telefone = contato ? contato.phone : phone.replace(/\D/g, "");
  const nomeFinal = contato ? contato.nome ?? "" : nome;
  const limpar = () => {
    setContato(null); setNovo(false); setPhone(""); setNome(""); setResumo(""); setInicio(null); setErro(null);
  };
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) { limpar(); onFechar(); } }}>
      <DialogContent tamanho="confirmacao" className="max-w-md" data-agenda="marcar">
        <DialogTitle>Marcar horário</DialogTitle>
        <DialogDescription className="mt-2 mb-4">O contato não é avisado automaticamente.</DialogDescription>
        <div className="space-y-3">
          {novo ? (
            <div className="space-y-2" data-agenda="contato-novo">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp com DDD" aria-label="WhatsApp do contato" inputMode="tel" />
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (opcional)" aria-label="Nome do contato" />
              <Button variant="link" size="link" onClick={() => { setNovo(false); setPhone(""); setNome(""); }}>
                Buscar um contato existente
              </Button>
            </div>
          ) : (
            <BuscaDeContato
              fonte={fonte}
              escolhido={contato}
              onEscolher={setContato}
              onNovo={(digitado) => {
                setNovo(true);
                // Digitou um telefone: já vem preenchido; um nome, vai para o nome.
                if (/\d{4,}/.test(digitado.replace(/\D/g, ""))) setPhone(digitado);
                else setNome(digitado);
              }}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Select value={servicoAtual === null ? "" : String(servicoAtual)} onValueChange={(v) => { setServicoId(Number(v)); setInicio(null); }}>
              <SelectTrigger size="field" aria-label="Serviço" className="w-full max-md:h-11"><SelectValue placeholder="Serviço" /></SelectTrigger>
              <SelectContent>
                {servicos.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.nome} ({s.duracaoMin} min)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CampoData value={dia} min={hoje} onChange={(e) => { setDia(e.target.value); setInicio(null); }} aria-label="Dia" />
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
            disabled={telefone.length < 10 || servicoAtual === null || inicio === null}
            onClick={async () => {
              if (servicoAtual === null || inicio === null) return;
              setEnviando(true);
              const r = await fonte.marcar({ phone: telefone, nome: nomeFinal, servicoId: servicoAtual, inicio, resumo });
              setEnviando(false);
              if (!r.ok) return setErro(r.erro);
              limpar();
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
              <CampoData value={dia} min={hoje} onChange={(e) => { setDia(e.target.value); setInicio(null); }} aria-label="Novo dia" />
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
  // Dois jeitos (decisão do dono, 28/10/2026): um trecho de um dia (almoço) ou
  // um período de dias inteiros com motivo (feriado local, recesso, férias).
  const [diasInteiros, setDiasInteiros] = useState(false);
  const [dia, setDia] = useState(hoje);
  const [ateDia, setAteDia] = useState(hoje);
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
        <DialogDescription className="mt-2 mb-4">A IA não oferece este período. O que já está marcado nele continua.</DialogDescription>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-apoio">
            <Checkbox checked={diasInteiros} onCheckedChange={(v) => setDiasInteiros(v === true)} />
            Dias inteiros (feriado local, recesso, férias)
          </label>
          {diasInteiros ? (
            <div className="grid grid-cols-2 gap-2">
              <CampoData value={dia} min={hoje} onChange={(e) => { setDia(e.target.value); if (e.target.value > ateDia) setAteDia(e.target.value); }} aria-label="Do dia" />
              <CampoData value={ateDia} min={dia} onChange={(e) => setAteDia(e.target.value)} aria-label="Até o dia" />
            </div>
          ) : (
            <>
              <CampoData value={dia} min={hoje} onChange={(e) => setDia(e.target.value)} aria-label="Dia do bloqueio" />
              <div className="grid grid-cols-2 gap-2">
                <Input type="time" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Das" />
                <Input type="time" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
              </div>
            </>
          )}
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={diasInteiros ? "Motivo (ex.: férias)" : "Motivo (opcional)"} aria-label="Motivo" maxLength={120} />
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
            disabled={!dia || (diasInteiros ? !ateDia : !de || !ate)}
            onClick={async () => {
              const inicio = diasInteiros ? inicioDoDia(dia) : inicioDoDia(dia) + min(de) * 60_000;
              const fim = diasInteiros ? inicioDoDia(somarDias(ateDia, 1)) : inicioDoDia(dia) + min(ate) * 60_000;
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
