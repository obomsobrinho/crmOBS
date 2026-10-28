"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  MessagesSquare,
  Plus,
  Repeat,
  Settings2,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import AvatarContato from "@/components/AvatarContato";
import { Aviso } from "@/components/ui/aviso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DURACAO_MAX,
  DURACAO_MIN,
  OPCOES_DA_AGENDA,
  faixaHoraria,
  hhmm,
  rotuloDoDia,
  textoDoLembrete,
  type AgendaConfig,
  type ServicoDaAgenda,
} from "@/lib/agenda";
import {
  PAGINA_AGENDA,
  inicioDoDia,
  type BloqueioAgenda,
  type FonteAgenda,
  type LinhaAgenda,
  type RecorteAgenda,
} from "@/lib/agenda-fonte";
import { diaIsoSP, diaMes, somarDias } from "@/lib/fuso";
import { prettyPhone } from "@/lib/format";
import { usePaginada } from "@/lib/use-paginada";

// A tela da AGENDA PRÓPRIA (docs/plano-agenda.md, seção 3). Lista por dia ou
// semana (10 por vez, rolagem infinita por (inicio, id)), marcar, remarcar,
// cancelar, bloquear e, para o dono, configurar serviços e regras. Os dados
// vêm SÓ da `fonte` (banco em `/agenda`, memória em `/design/agenda`).
// Sem realtime nesta versão: a lista revalida ao voltar o foco e depois de
// cada ação desta aba (a tabela entra no canal do tenant depois da migration).

type Vista = "dia" | "semana";
type Status = RecorteAgenda["status"];

const DIA_MS = 86_400_000;

export interface PropsAgenda {
  fonte: FonteAgenda;
  agora: number;
  empresa: string;
  dono: boolean;
  /** false = tabelas ausentes (migration não aplicada) ou leitura falhou. */
  disponivel: boolean;
  /** Há horário de atendimento cadastrado (sem ele a IA não marca). */
  temHorario: boolean;
  /** O objetivo "Agendar" está marcado no agente. */
  querAgendar: boolean;
  configInicial: AgendaConfig;
  servicosIniciais: ServicoDaAgenda[];
  inicial: { itens: LinhaAgenda[]; temMais: boolean; bloqueios: BloqueioAgenda[] };
  readOnly?: boolean;
}

export default function Agenda(p: PropsAgenda) {
  const hoje = diaIsoSP(p.agora);
  const [vista, setVista] = useState<Vista>("semana");
  const [dia, setDia] = useState(hoje);
  const [status, setStatus] = useState<Status>("confirmado");
  const [config, setConfig] = useState(p.configInicial);
  const [servicos, setServicos] = useState(p.servicosIniciais);
  const [bloqueios, setBloqueios] = useState(p.inicial.bloqueios);
  const [marcar, setMarcar] = useState(false);
  const [remarcar, setRemarcar] = useState<LinhaAgenda | null>(null);
  const [cancelar, setCancelar] = useState<LinhaAgenda | null>(null);
  const [lembrete, setLembrete] = useState<LinhaAgenda | null>(null);
  const [bloquear, setBloquear] = useState(false);
  const [configurar, setConfigurar] = useState(false);

  const recorte = useMemo<RecorteAgenda>(() => {
    const de = inicioDoDia(dia);
    return { de, ate: de + (vista === "dia" ? 1 : 7) * DIA_MS, status };
  }, [dia, vista, status]);

  const { itens, temMais, carregando, fimRef, revalidar } = usePaginada<LinhaAgenda, RecorteAgenda>({
    inicial: p.inicial.itens,
    temMaisInicial: p.inicial.temMais,
    params: recorte,
    buscar: (r, depois, n) => p.fonte.listar(r, depois, n),
    chave: (l) => l.id,
    tamanho: PAGINA_AGENDA,
  });

  const recarregarBloqueios = useCallback(async () => {
    try {
      setBloqueios(await p.fonte.bloqueios(recorte.de, recorte.ate));
    } catch (e) {
      console.error("bloqueios da agenda:", e);
    }
  }, [p.fonte, recorte.de, recorte.ate]);
  // Os bloqueios da semana na tela (poucos por natureza) seguem o recorte.
  // O primeiro recorte já veio do servidor.
  const primeiroRecorte = useRef(true);
  useEffect(() => {
    if (primeiroRecorte.current) {
      primeiroRecorte.current = false;
      return;
    }
    void recarregarBloqueios();
  }, [recarregarBloqueios]);

  const depoisDeAgir = useCallback(() => {
    void revalidar();
    void recarregarBloqueios();
  }, [revalidar, recarregarBloqueios]);

  // Agrupado por dia civil de SP. Os bloqueios entram no dia em que começam.
  const grupos = useMemo(() => {
    const m = new Map<string, { linhas: LinhaAgenda[]; bloqueios: BloqueioAgenda[] }>();
    const de = (d: string) => m.get(d) ?? { linhas: [], bloqueios: [] };
    for (const l of itens) {
      const d = diaIsoSP(l.inicio);
      const g = de(d);
      m.set(d, { ...g, linhas: [...g.linhas, l] });
    }
    if (status === "confirmado") {
      for (const b of bloqueios) {
        const d = diaIsoSP(Math.max(b.inicio, recorte.de));
        const g = de(d);
        m.set(d, { ...g, bloqueios: [...g.bloqueios, b] });
      }
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [itens, bloqueios, status, recorte.de]);

  const passo = vista === "dia" ? 1 : 7;
  const titulo =
    vista === "dia"
      ? rotuloDoDia(dia, hoje)
      : `${diaMes(dia)} a ${diaMes(somarDias(dia, 6))}`;

  const agendaLigada = config.ativa && servicos.length > 0 && p.temHorario && p.querAgendar;

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
      <header className="border-b border-line px-6 pb-3 pt-5 max-md:px-4 max-md:pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-brand-ink" />
            <h1 className="text-titulo">Agenda</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!p.readOnly && (
              <>
                <Button size="control" onClick={() => setMarcar(true)} disabled={servicos.length === 0}>
                  <CalendarPlus size={14} />
                  Marcar horário
                </Button>
                <Button variant="outline" size="control" onClick={() => setBloquear(true)}>
                  <Ban size={14} />
                  Bloquear
                </Button>
              </>
            )}
            {p.dono && !p.readOnly && (
              <Button variant="outline" size="icon-control" aria-label="Configurar a agenda" onClick={() => setConfigurar(true)}>
                <Settings2 size={15} />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1 text-legenda text-ink-3" data-agenda="estado">
          {agendaLigada
            ? "A IA oferece os horários livres e marca sozinha. Compromissos fora daqui: bloqueie o horário para a IA não oferecer."
            : !p.querAgendar
              ? 'A IA não marca: o objetivo "Agendar" está desligado no agente.'
              : !p.temHorario
                ? "A IA não marca: falta o horário de atendimento em Agente, O que ele sabe."
                : servicos.length === 0
                  ? "Cadastre um serviço na configuração para a IA começar a marcar."
                  : "A IA ainda não marca: ligue a agenda na configuração."}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-control" aria-label="Anterior" onClick={() => setDia(somarDias(dia, -passo))}>
              <ChevronLeft size={16} />
            </Button>
            <Button variant="ghost" size="icon-control" aria-label="Próximo" onClick={() => setDia(somarDias(dia, passo))}>
              <ChevronRight size={16} />
            </Button>
            <Button variant="outline" size="chrome" onClick={() => setDia(hoje)} disabled={dia === hoje}>
              Hoje
            </Button>
            <span className="ml-2 text-apoio font-medium" data-agenda="periodo">
              {titulo}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)}>
              <TabsList variant="painel" className="bg-canvas" aria-label="Vista">
                <TabsTrigger value="dia" variant="painel">Dia</TabsTrigger>
                <TabsTrigger value="semana" variant="painel">Semana</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={status} onValueChange={(v) => setStatus(v as Status)}>
              <TabsList variant="painel" className="bg-canvas" aria-label="Situação">
                <TabsTrigger value="confirmado" variant="painel" data-agenda="aba">Marcados</TabsTrigger>
                <TabsTrigger value="cancelado" variant="painel" data-agenda="aba">Cancelados</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      {grupos.length === 0 && !carregando ? (
        <EstadoVazio
          icone={CalendarDays}
          titulo={status === "confirmado" ? "Nenhum horário neste período" : "Nenhum cancelamento neste período"}
          texto={
            status === "confirmado"
              ? "Quando a IA ou o time marcar um horário, ele aparece aqui."
              : "Horários cancelados pelo contato ou pelo time aparecem aqui."
          }
          tamanho="detalhe"
        />
      ) : (
        <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
          <div className="px-6 pb-6 max-md:px-4">
            {grupos.map(([d, g]) => (
              <section key={d} data-agenda="dia" className="pt-4">
                <h2 className="mb-2 text-rotulo uppercase text-ink-3">{rotuloDoDia(d, hoje)}</h2>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {mesclar(g.linhas, g.bloqueios).map((x) =>
                    "phone" in x ? (
                      <Linha
                        key={`a${x.id}`}
                        l={x}
                        passou={x.fim <= p.agora}
                        readOnly={!!p.readOnly}
                        onRemarcar={() => setRemarcar(x)}
                        onCancelar={() => setCancelar(x)}
                        onLembrete={() => setLembrete(x)}
                      />
                    ) : (
                      <LinhaBloqueio
                        key={`b${x.id}`}
                        b={x}
                        readOnly={!!p.readOnly}
                        onDesbloquear={async () => {
                          const r = await p.fonte.desbloquear(x.id);
                          if (r.ok) setBloqueios((bs) => bs.filter((y) => y.id !== x.id));
                        }}
                      />
                    )
                  )}
                </ul>
              </section>
            ))}
            {temMais && <div ref={(el) => { fimRef.current = el; }} className="h-8" aria-hidden />}
          </div>
        </AreaRolavel>
      )}

      <DialogoMarcar
        aberto={marcar}
        onFechar={() => setMarcar(false)}
        fonte={p.fonte}
        servicos={servicos}
        hoje={hoje}
        onFeito={depoisDeAgir}
      />
      <DialogoRemarcar linha={remarcar} onFechar={() => setRemarcar(null)} fonte={p.fonte} hoje={hoje} onFeito={depoisDeAgir} />
      <DialogoBloquear aberto={bloquear} onFechar={() => setBloquear(false)} fonte={p.fonte} hoje={hoje} onFeito={depoisDeAgir} />
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
                  depoisDeAgir();
                }
                return r;
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!lembrete} onOpenChange={(v) => !v && setLembrete(null)}>
        <DialogContent tamanho="confirmacao" className="max-w-md" data-agenda="lembrete">
          {lembrete && <Lembrete l={lembrete} empresa={p.empresa} agora={p.agora} />}
        </DialogContent>
      </Dialog>
      {p.dono && (
        <SheetConfigurar
          aberto={configurar}
          onFechar={() => setConfigurar(false)}
          fonte={p.fonte}
          config={config}
          servicos={servicos}
          onSalvo={(c, s) => {
            setConfig(c);
            setServicos(s);
          }}
        />
      )}
    </Card>
  );
}

function mesclar(linhas: LinhaAgenda[], bloqueios: BloqueioAgenda[]): (LinhaAgenda | BloqueioAgenda)[] {
  return [...linhas, ...bloqueios].sort((a, b) => a.inicio - b.inicio);
}

function Linha({
  l,
  passou,
  readOnly,
  onRemarcar,
  onCancelar,
  onLembrete,
}: {
  l: LinhaAgenda;
  passou: boolean;
  readOnly: boolean;
  onRemarcar: () => void;
  onCancelar: () => void;
  onLembrete: () => void;
}) {
  const cancelado = l.status === "cancelado";
  const nome = l.nome || prettyPhone(l.phone);
  return (
    <li data-agenda="linha" data-situacao={l.status} className="flex items-center gap-3 px-3 py-2.5 max-sm:flex-wrap">
      <p className={passou || cancelado ? "w-[104px] shrink-0 text-apoio tabular-nums text-ink-3 max-sm:w-auto" : "w-[104px] shrink-0 text-apoio font-semibold tabular-nums max-sm:w-auto"}>
        {faixaHoraria(l.inicio, l.fim)}
      </p>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 max-sm:order-last max-sm:basis-full">
        <AvatarContato phone={l.phone} name={l.nome} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-apoio font-medium">{nome}</p>
          <p className="flex items-center gap-1 truncate text-legenda text-ink-3">
            {l.origem === "ia" ? <Sparkles size={12} /> : <UserRound size={12} />}
            {l.servicoNome}, {l.origem === "ia" ? "marcado pela IA" : "marcado pelo time"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 max-sm:ml-auto">
        {cancelado ? (
          <Badge variant="estado-neutro">{l.canceladoPor === "cliente" ? "Cancelado pelo contato" : "Cancelado pelo time"}</Badge>
        ) : passou ? (
          <Badge variant="estado-neutro">Já passou</Badge>
        ) : (
          <Badge variant="estado-bom">Confirmado</Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-control" aria-label={`Ações do horário de ${nome}`}>
              <Ellipsis size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href={`/inbox/${encodeURIComponent(l.phone)}`}>
                <MessagesSquare size={14} />
                Abrir conversa
              </Link>
            </DropdownMenuItem>
            {!cancelado && !passou && (
              <DropdownMenuItem onSelect={onLembrete}>
                <Copy size={14} />
                Lembrete
              </DropdownMenuItem>
            )}
            {!cancelado && !passou && !readOnly && (
              <>
                <DropdownMenuItem onSelect={onRemarcar}>
                  <Repeat size={14} />
                  Remarcar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="perigo" onSelect={onCancelar}>
                  <CalendarX2 size={14} />
                  Cancelar horário
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function LinhaBloqueio({ b, readOnly, onDesbloquear }: { b: BloqueioAgenda; readOnly: boolean; onDesbloquear: () => void }) {
  return (
    <li data-agenda="bloqueio" className="flex items-center gap-3 bg-bloco px-3 py-2.5 max-sm:flex-wrap">
      <p className="w-[104px] shrink-0 text-apoio max-sm:w-auto tabular-nums text-ink-3">{faixaHoraria(b.inicio, b.fim)}</p>
      <p className="flex min-w-0 flex-1 items-center gap-2 text-apoio text-ink-2">
        <Ban size={14} className="shrink-0 text-ink-3" />
        Bloqueado{b.motivo ? `: ${b.motivo}` : ""}
      </p>
      {!readOnly && (
        <Button variant="danger-ghost" size="control" onClick={onDesbloquear}>
          Desbloquear
        </Button>
      )}
    </li>
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

function Lembrete({ l, empresa, agora }: { l: LinhaAgenda; empresa: string; agora: number }) {
  const texto = textoDoLembrete({ empresa, servico: l.servicoNome, inicio: l.inicio, agora });
  const [copiado, setCopiado] = useState(false);
  return (
    <>
      <DialogTitle>Lembrete</DialogTitle>
      <DialogDescription className="mt-2 mb-3">
        Copie e mande na conversa. O envio automático ainda não existe.
      </DialogDescription>
      <p className="mb-4 rounded-lg border border-line bg-bloco px-3 py-2 text-apoio" data-agenda="texto-lembrete">{texto}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="field" className="px-4" asChild>
          <Link href={`/inbox/${encodeURIComponent(l.phone)}`}>Abrir conversa</Link>
        </Button>
        <Button
          size="field"
          className="px-4"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
            } catch {
              setCopiado(false);
            }
          }}
        >
          {copiado ? "Copiado" : "Copiar texto"}
        </Button>
      </div>
    </>
  );
}

/** Os horários livres de um dia, como botões de escolha. */
function EscolherHorario({
  fonte,
  servicoId,
  dia,
  ignorar,
  valor,
  onEscolher,
}: {
  fonte: FonteAgenda;
  servicoId: number | null;
  dia: string;
  ignorar?: number;
  valor: number | null;
  onEscolher: (t: number) => void;
}) {
  const [inicios, setInicios] = useState<number[] | null>(null);
  const [chave, setChave] = useState("");
  const pedida = `${servicoId}|${dia}|${ignorar ?? ""}`;
  useEffect(() => {
    if (servicoId === null || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
    let vivo = true;
    fonte
      .horarios(servicoId, dia, ignorar)
      .then((hs) => {
        if (!vivo) return;
        setInicios(hs);
        setChave(pedida);
      })
      .catch(() => vivo && setInicios([]));
    return () => {
      vivo = false;
    };
  }, [fonte, servicoId, dia, ignorar, pedida]);
  if (servicoId === null) return null;
  if (inicios === null || chave !== pedida) return <p className="text-legenda text-ink-3">Buscando horários livres...</p>;
  if (inicios.length === 0) return <p className="text-legenda text-ink-3">Nenhum horário livre neste dia.</p>;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Horários livres" data-agenda="horarios">
      {inicios.map((t) => (
        <Button key={t} variant="alternavel" size="chip" aria-pressed={valor === t} onClick={() => onEscolher(t)}>
          {hhmm(t)}
        </Button>
      ))}
    </div>
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
  const [servicoId, setServicoId] = useState<number | null>(servicos[0]?.id ?? null);
  const [dia, setDia] = useState(hoje);
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
          <EscolherHorario fonte={fonte} servicoId={servicoAtual} dia={dia} valor={inicio} onEscolher={setInicio} />
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
              const r = await fonte.marcar({ phone: phone.replace(/\D/g, ""), nome, servicoId: servicoAtual, inicio });
              setEnviando(false);
              if (!r.ok) return setErro(r.erro);
              setPhone(""); setNome(""); setInicio(null); setErro(null);
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
              <EscolherHorario fonte={fonte} servicoId={linha.servicoId ?? -1} dia={dia} ignorar={linha.id} valor={inicio} onEscolher={setInicio} />
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
  const minutos = (s: string) => {
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
              const inicio = base + minutos(de) * 60_000;
              const fim = base + minutos(ate) * 60_000;
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

type ServicoEditavel = { id: number | null; chave: string; nome: string; duracaoMin: number };

function SheetConfigurar({
  aberto,
  onFechar,
  fonte,
  config,
  servicos,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  fonte: FonteAgenda;
  config: AgendaConfig;
  servicos: ServicoDaAgenda[];
  onSalvo: (c: AgendaConfig, s: ServicoDaAgenda[]) => void;
}) {
  const [c, setC] = useState(config);
  const [lista, setLista] = useState<ServicoEditavel[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoVisto, setAbertoVisto] = useState(false);
  if (aberto !== abertoVisto) {
    setAbertoVisto(aberto);
    if (aberto) {
      setC(config);
      setLista(servicos.map((s) => ({ id: s.id, chave: `s${s.id}`, nome: s.nome, duracaoMin: s.duracaoMin })));
      setErro(null);
    }
  }
  const mudar = (p: Partial<AgendaConfig>) => setC((x) => ({ ...x, ...p }));
  const rotuloMin = (m: number) => (m === 0 ? "Sem mínimo" : m < 60 ? `${m} min` : m === 1440 ? "1 dia" : `${m / 60} h`);
  return (
    <Sheet open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent data-agenda="configurar">
        <div className="flex h-full flex-col">
          <div className="border-b border-line px-6 py-4">
            <SheetTitle>Configurar a agenda</SheetTitle>
            <SheetDescription className="mt-1 text-apoio text-ink-3">
              Os horários seguem o horário de atendimento do agente. Os valores sugeridos são padrões, mude como preferir.
            </SheetDescription>
          </div>
          <AreaRolavel className="min-h-0 flex-1">
            <div className="space-y-6 px-6 py-5">
              <Switch
                checked={c.ativa}
                onCheckedChange={(v) => mudar({ ativa: v })}
                aria-label="A IA marca horários"
                className="flex w-full items-center justify-between gap-3 text-left"
                data-agenda="ligar"
              >
                <span>
                  <span className="block text-apoio font-semibold">A IA marca horários</span>
                  <span className="block text-legenda text-ink-3">Ela oferece os livres e confirma na hora.</span>
                </span>
                <SwitchTrack checked={c.ativa}>
                  <SwitchThumb checked={c.ativa} />
                </SwitchTrack>
              </Switch>

              <div>
                <p className="mb-2 text-rotulo uppercase text-ink-3">Serviços e duração</p>
                <div className="divide-y divide-line rounded-xl border border-line">
                  {lista.length === 0 && <p className="px-3 py-2.5 text-legenda text-ink-3">Nenhum serviço ainda.</p>}
                  {lista.map((s, i) => (
                    <div key={s.chave} className="flex items-center gap-2 px-3 py-2" data-agenda="servico">
                      <Input
                        variant="sutil"
                        value={s.nome}
                        onChange={(e) => setLista((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                        aria-label={`Nome do serviço ${i + 1}`}
                        className="min-w-0 flex-1"
                        maxLength={80}
                      />
                      <Select
                        value={String(s.duracaoMin)}
                        onValueChange={(v) => setLista((l) => l.map((x, j) => (j === i ? { ...x, duracaoMin: Number(v) } : x)))}
                      >
                        <SelectTrigger aria-label={`Duração do serviço ${i + 1}`} className="w-[96px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {OPCOES_DA_AGENDA.duracaoMin.map((m) => (
                            <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="danger-ghost" size="icon-control" aria-label={`Remover serviço ${i + 1}`} onClick={() => setLista((l) => l.filter((_, j) => j !== i))}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  variant="link"
                  size="link"
                  className="mt-2"
                  onClick={() => setLista((l) => [...l, { id: null, chave: `n${Date.now()}`, nome: "", duracaoMin: 30 }])}
                >
                  <Plus size={14} />
                  Adicionar serviço
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Escolha rotulo="Antecedência mínima" valor={c.antecedenciaMin} opcoes={OPCOES_DA_AGENDA.antecedenciaMin} texto={rotuloMin} onMudar={(v) => mudar({ antecedenciaMin: v })} />
                <Escolha rotulo="Até quantos dias à frente" valor={c.diasAFrente} opcoes={OPCOES_DA_AGENDA.diasAFrente} texto={(d) => `${d} dias`} onMudar={(v) => mudar({ diasAFrente: v })} />
                <Escolha rotulo="Intervalo entre horários" valor={c.intervaloMin} opcoes={OPCOES_DA_AGENDA.intervaloMin} texto={(m) => (m === 0 ? "Sem intervalo" : `${m} min`)} onMudar={(v) => mudar({ intervaloMin: v })} />
                <Escolha rotulo="Começa de quanto em quanto" valor={c.passoMin} opcoes={OPCOES_DA_AGENDA.passoMin} texto={(m) => `${m} min`} onMudar={(v) => mudar({ passoMin: v })} />
              </div>
              <Aviso tom="neutro">
                Lembrete automático ainda não existe: na lista, &quot;Lembrete&quot; copia um texto pronto para mandar na conversa.
              </Aviso>
            </div>
          </AreaRolavel>
          <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
            {erro && <p className="mr-auto text-apoio text-danger-ink" role="alert">{erro}</p>}
            <Button variant="outline" size="field" className="px-4" onClick={onFechar}>Cancelar</Button>
            <Button
              size="field"
              className="px-4"
              carregando={enviando}
              onClick={async () => {
                const limpos = lista.map((s) => ({ id: s.id, nome: s.nome.trim(), duracaoMin: s.duracaoMin }));
                if (limpos.some((s) => !s.nome || s.duracaoMin < DURACAO_MIN || s.duracaoMin > DURACAO_MAX)) {
                  return setErro("Todo serviço precisa de nome.");
                }
                if (c.ativa && limpos.length === 0) return setErro("Cadastre um serviço para ligar a agenda.");
                setEnviando(true);
                const r = await fonte.salvarConfig(c, limpos);
                setEnviando(false);
                if (!r.ok) return setErro(r.erro);
                onSalvo(r.config, r.servicos);
                onFechar();
              }}
            >
              Salvar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Escolha({
  rotulo,
  valor,
  opcoes,
  texto,
  onMudar,
}: {
  rotulo: string;
  valor: number;
  opcoes: readonly number[];
  texto: (v: number) => string;
  onMudar: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-apoio font-medium">{rotulo}</p>
      <Select value={String(valor)} onValueChange={(v) => onMudar(Number(v))}>
        <SelectTrigger aria-label={rotulo} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => (
            <SelectItem key={o} value={String(o)}>{texto(o)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
