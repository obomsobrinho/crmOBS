"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, HandHelping, MessagesSquare, Search, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { CabecalhoBloco } from "./ContactFields";
import { assinarComSessao, createClient } from "@/lib/supabase/client";
import { FUSO, formatEspera, prettyPhone } from "@/lib/format";
import { avatarPair, initials } from "@/lib/inbox";
import { ESPERA_AVISO_MS } from "@/lib/painel";
import { memberName, type Member } from "@/lib/team";
import {
  DIAS_DE_RESOLVIDOS,
  casaBuscaPedido,
  inicioDosResolvidos,
  montarFila,
  montarResolvidos,
  type ContatoLinha,
  type PedidoAberto,
  type PedidoLinha,
  type PedidoResolvido,
  type PedidoResolvidoLinha,
} from "@/lib/pedidos";
import { cn } from "@/lib/utils";

// PEDIDOS DE AJUDA (refeita em 30/09/2026, docs/plano-fechar-p0.md, itens 1 e 2).
//
// Lista à esquerda com Abertos e Resolvidos, e o pedido selecionado à direita,
// no molde da tela de Clientes. ⚠️ O DETALHE É A FICHA DO PEDIDO, NUNCA UM CHAT
// (decisão do dono: "como se eu estivesse em Conversas, não faz sentido"). Quem
// quer ver a conversa usa "Abrir conversa". Orientar e Resolvido continuam aqui,
// e passam pelas MESMAS rotas de sempre (`/orientar` e `/resolve`, as duas por
// `fecharPedido`); nenhum caminho novo. Responder é na conversa.

type Aba = "abertos" | "resolvidos";
type Resultado = { tom: "ok" | "aviso" | "erro"; texto: string };
const SEM_SERVIDOR: Resultado = { tom: "erro", texto: "Não foi possível contatar o servidor." };

async function postar(url: string, corpo: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch {
    return null;
  }
}

/** "30 set, 14:05", sempre no fuso de São Paulo. */
function quando(iso: string): string {
  const d = new Date(iso);
  const dia = d
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: FUSO })
    .replace(" de ", " ")
    .replace(".", "");
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
  return `${dia}, ${hora}`;
}

export default function Pedidos({
  initialAbertos,
  initialResolvidos,
  initialContatos,
  members,
  clientId,
  numeroAvisos,
  readOnly = false,
  abrirId = null,
  preview = false,
}: {
  initialAbertos: PedidoLinha[];
  initialResolvidos: PedidoResolvidoLinha[];
  initialContatos: ContatoLinha[];
  /** Para nomear quem resolveu. */
  members: Member[];
  /** Tenant logado: o realtime escuta só ele. Ausente no /design. */
  clientId?: string;
  /** Destino dos avisos: esse número nunca é pedido (lib/avisos.ts). */
  numeroAvisos: string | null;
  /** Conta bloqueada: vê a fila e o histórico, não age (as rotas já respondem 402). */
  readOnly?: boolean;
  /** `?abrir=` do link do aviso: o pedido que já nasce selecionado. */
  abrirId?: number | null;
  /** /design: sem banco, e as ações só simulam. */
  preview?: boolean;
}) {
  const supabase = useMemo(() => (preview ? null : createClient()), [preview]);
  const [abertosRaw, setAbertosRaw] = useState(initialAbertos);
  const [resolvidosRaw, setResolvidosRaw] = useState(initialResolvidos);
  const [contatos, setContatos] = useState(initialContatos);
  const [aba, setAba] = useState<Aba>(
    abrirId != null && !initialAbertos.some((p) => p.id === abrirId) &&
      initialResolvidos.some((p) => p.id === abrirId)
      ? "resolvidos"
      : "abertos"
  );
  const [selecionado, setSelecionado] = useState<number | null>(abrirId);
  const [q, setQ] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // "Agora" do cálculo da espera, fixado a cada carga e a cada minuto: ler
  // `Date.now()` no render é impuro, e a espera é grossa (minutos, horas).
  const [agora, setAgora] = useState(() => Date.now());

  const abertos = useMemo(
    () => montarFila(abertosRaw, contatos, numeroAvisos),
    [abertosRaw, contatos, numeroAvisos]
  );
  const resolvidos = useMemo(
    () => montarResolvidos(resolvidosRaw, contatos, numeroAvisos),
    [resolvidosRaw, contatos, numeroAvisos]
  );
  const nomeDeQuem = useMemo(() => {
    const m = new Map(members.map((x) => [x.userId, memberName(x.email)]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [members]);

  const lista = aba === "abertos" ? abertos : resolvidos;
  const linhas = lista.filter((p) => casaBuscaPedido(p, q));
  const aberto = abertos.find((p) => p.id === selecionado) ?? null;
  const resolvido = resolvidos.find((p) => p.id === selecionado) ?? null;

  const refetch = useCallback(async () => {
    if (!supabase) return;
    const agoraMs = Date.now();
    const [{ data: hs }, { data: rs }] = await Promise.all([
      supabase
        .from("handoffs")
        .select("id, phone, opened_at, summary")
        .is("closed_at", null)
        .order("opened_at", { ascending: true }),
      supabase
        .from("handoffs")
        .select("id, phone, opened_at, summary, instruction, closed_at, closed_how, closed_by")
        .not("closed_at", "is", null)
        .gte("closed_at", inicioDosResolvidos(agoraMs))
        .order("closed_at", { ascending: false }),
    ]);
    // Nomes só dos telefones da fila e do histórico, nunca a base inteira.
    const fones = [...new Set([...(hs ?? []), ...(rs ?? [])].map((h) => (h as { phone: string }).phone))];
    const { data: cs } = fones.length
      ? await supabase.from("dados_cliente").select("telefone, nomewpp, display_name").in("telefone", fones)
      : { data: [] };
    setAbertosRaw((hs ?? []) as PedidoLinha[]);
    setResolvidosRaw((rs ?? []) as PedidoResolvidoLinha[]);
    setContatos((cs ?? []) as ContatoLinha[]);
    setAgora(agoraMs);
  }, [supabase]);

  // Tempo real nas regras da casa (CLAUDE.md, "Realtime cai", e
  // docs/plano-carregamento.md): só o tenant, uma rajada de eventos vira UMA
  // busca, aba escondida não busca (anota e busca ao voltar), primeira
  // assinatura PULADA (a lista acabou de vir do servidor) e re-busca a cada
  // reassinatura e ao voltar o foco (no máximo a cada 10s).
  const primeira = useRef(true);
  useEffect(() => {
    if (!supabase || !clientId) return;
    let atrasada = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ultima = Date.now();
    const agendar = () => {
      if (document.visibilityState !== "visible") {
        atrasada = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetch(), 500);
    };
    const canalSair = assinarComSessao((sb) =>
      sb
      .channel(`pedidos-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "handoffs", filter: `client_id=eq.${clientId}` }, agendar)
      .subscribe((status: string) => {
        if (status !== "SUBSCRIBED") return;
        if (primeira.current) {
          primeira.current = false;
          return;
        }
        agendar();
      })
    );
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (!atrasada && Date.now() - ultima < 10_000) return;
      ultima = Date.now();
      atrasada = false;
      void refetch();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => {
      if (timer) clearTimeout(timer);
      canalSair();
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      clearInterval(relogio);
    };
  }, [supabase, clientId, refetch]);

  /** O pedido saiu dos abertos: vira resolvido na tela, com o que aconteceu. */
  function concluir(p: PedidoAberto, r: Resultado, como: "ia" | "resolvido", orientacao: string | null) {
    setResultado(r);
    setAbertosRaw((ps) => ps.filter((x) => x.id !== p.id));
    setResolvidosRaw((rs) => [
      {
        id: p.id,
        phone: p.phone,
        opened_at: p.openedAt,
        summary: p.summary,
        instruction: orientacao,
        closed_at: new Date().toISOString(),
        closed_how: como,
        closed_by: null,
      },
      ...rs.filter((x) => x.id !== p.id),
    ]);
    setSelecionado(null);
    if (!preview) void refetch();
  }

  async function orientar(p: PedidoAberto, texto: string) {
    if (preview) {
      concluir(p, { tom: "ok", texto: "Orientado. A IA respondeu ao cliente." }, "ia", texto);
      return;
    }
    const res = await postar("/api/conversations/orientar", {
      phone: p.phone,
      instruction: texto,
      pedidoId: p.id,
    });
    if (!res) return setResultado(SEM_SERVIDOR);
    if (res.status === 409) {
      concluir(p, { tom: "aviso", texto: "Esse pedido já tinha sido resolvido." }, "resolvido", null);
      return;
    }
    if (!res.ok) {
      setResultado({ tom: "erro", texto: "Não foi possível orientar. Tente de novo." });
      return;
    }
    const data = (await res.json()) as { enviado?: boolean };
    concluir(
      p,
      data.enviado
        ? { tom: "ok", texto: "Orientado. A IA respondeu ao cliente." }
        : {
            tom: "aviso",
            texto:
              "Orientado. A IA não conseguiu responder agora e usa a orientação na próxima mensagem do cliente.",
          },
      "ia",
      texto
    );
  }

  async function marcarResolvido(p: PedidoAberto) {
    if (preview) {
      concluir(p, { tom: "ok", texto: "Marcado como resolvido." }, "resolvido", null);
      return;
    }
    const res = await postar("/api/conversations/resolve", { phone: p.phone, pedidoId: p.id });
    if (!res) return setResultado(SEM_SERVIDOR);
    if (!res.ok) {
      setResultado({ tom: "erro", texto: "Não foi possível resolver. Tente de novo." });
      return;
    }
    concluir(p, { tom: "ok", texto: "Marcado como resolvido." }, "resolvido", null);
  }

  const temDetalhe = aberto != null || resolvido != null;

  return (
    <div className="flex min-h-0 flex-1 md:gap-3">
      <Card
        asChild
        variant="pagina"
        className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", temDetalhe && "max-md:hidden")}
      >
        <section aria-label="Pedidos de ajuda">
          <div className="border-b border-line px-4 pb-3 pt-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HandHelping size={20} className="text-brand-ink" />
                <h1 className="text-titulo">Pedidos de ajuda</h1>
              </div>
              <Tabs
                value={aba}
                onValueChange={(v) => {
                  setAba(v as Aba);
                  setSelecionado(null);
                }}
              >
                <TabsList variant="painel" className="bg-canvas" aria-label="Pedidos">
                  <TabsTrigger value="abertos" variant="painel" data-slot="pedidos-aba">
                    Abertos
                    <span className="ml-1.5 tabular-nums opacity-75">{abertos.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="resolvidos" variant="painel" data-slot="pedidos-aba">
                    Resolvidos
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <p className="mt-1 text-apoio text-ink-2">
              {aba === "abertos"
                ? "O que a IA passou para o time e ainda espera resposta, de quem espera há mais tempo para o mais recente."
                : `O que foi resolvido nos últimos ${DIAS_DE_RESOLVIDOS} dias, do mais recente para o mais antigo.`}
            </p>
            <div className="mt-3 flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-2.5 transition-colors focus-within:border-brand-line md:max-w-[420px]">
              <Search size={15} className="shrink-0 text-ink-faint" />
              <Input
                variant="limpo"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por cliente ou pelo que foi pedido"
                aria-label="Buscar pedidos"
                className="text-apoio"
              />
            </div>
          </div>

          {resultado && (
            <p
              role="status"
              data-slot="pedidos-resultado"
              className={cn(
                "mx-4 mt-3 rounded-lg border px-3 py-2 text-apoio md:mx-5",
                resultado.tom === "ok" && "border-human-line bg-human-surface text-human-ink",
                resultado.tom === "aviso" && "border-warn-line bg-warn-surface text-warn-ink",
                resultado.tom === "erro" && "border-danger-line bg-danger-surface text-danger-ink"
              )}
            >
              {resultado.texto}
            </p>
          )}

          <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
            {lista.length === 0 ? (
              <div
                data-slot="pedidos-vazio"
                className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center"
              >
                <HandHelping size={28} className="text-ink-faint" aria-hidden />
                <p className="text-corpo font-semibold">
                  {aba === "abertos" ? "Nenhum pedido esperando." : "Nenhum pedido resolvido ainda."}
                </p>
                <p className="max-w-sm text-apoio text-ink-3">
                  {aba === "abertos"
                    ? "Quando a IA pedir ajuda, o pedido aparece aqui e no WhatsApp de avisos."
                    : `Os pedidos resolvidos nos últimos ${DIAS_DE_RESOLVIDOS} dias ficam aqui, com o que foi feito.`}
                </p>
              </div>
            ) : linhas.length === 0 ? (
              <p data-slot="pedidos-vazio" className="px-5 py-10 text-center text-apoio text-ink-3">
                Nenhum pedido para “{q.trim()}”.
              </p>
            ) : (
              <ul data-slot="pedidos-lista">
                {linhas.map((p) => (
                  <LinhaPedido
                    key={p.id}
                    p={p}
                    agora={agora}
                    ativa={p.id === selecionado}
                    onSelecionar={() => {
                      setResultado(null);
                      setSelecionado(p.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </AreaRolavel>
        </section>
      </Card>

      <Card
        asChild
        variant="pagina"
        className={cn(
          "flex w-[400px] shrink-0 flex-col overflow-hidden max-md:w-full max-md:flex-1",
          !temDetalhe && "max-md:hidden"
        )}
      >
        <aside aria-label="Pedido selecionado">
          {aberto ? (
            <FichaPedido
              key={`a-${aberto.id}`}
              p={aberto}
              agora={agora}
              readOnly={readOnly}
              onVoltar={() => setSelecionado(null)}
              onOrientar={(t) => orientar(aberto, t)}
              onResolvido={() => marcarResolvido(aberto)}
            />
          ) : resolvido ? (
            <FichaPedido
              key={`r-${resolvido.id}`}
              p={resolvido}
              agora={agora}
              readOnly
              quemResolveu={nomeDeQuem(resolvido.porQuem)}
              onVoltar={() => setSelecionado(null)}
            />
          ) : (
            <div
              data-slot="pedido-nenhum"
              className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <HandHelping size={28} className="text-ink-faint" aria-hidden />
              <p className="max-w-[260px] text-apoio text-ink-2" style={{ textWrap: "pretty" }}>
                Escolha um pedido na lista para ver o que foi pedido e o que fazer.
              </p>
            </div>
          )}
        </aside>
      </Card>
    </div>
  );
}

function LinhaPedido({
  p,
  agora,
  ativa,
  onSelecionar,
}: {
  p: PedidoAberto | PedidoResolvido;
  agora: number;
  ativa: boolean;
  onSelecionar: () => void;
}) {
  const ehAberto = "posicao" in p;
  const longa = ehAberto && agora - Date.parse(p.openedAt) >= ESPERA_AVISO_MS;
  const quem = p.nome ?? prettyPhone(p.phone);
  const ref = useRef<HTMLLIElement>(null);

  // O pedido do link do aviso nasce selecionado; rola até ele uma vez.
  useEffect(() => {
    if (ativa) ref.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <li ref={ref} data-slot="pedido-linha" data-pedido={p.id}>
      <button
        type="button"
        onClick={onSelecionar}
        aria-current={ativa ? "true" : undefined}
        className={cn(
          "relative flex w-full items-start gap-3 border-b border-line-soft py-3 pl-4 pr-4 text-left transition-colors md:pl-5",
          ativa ? "bg-[var(--sel-bg)]" : "hover:bg-[var(--active-bg)]"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-[3px]",
            ativa ? "bg-[var(--sel-bar)]" : longa ? "bg-[var(--warn-fill)]" : "bg-transparent"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-corpo font-semibold text-ink">{quem}</span>
            {ehAberto && p.total > 1 && (
              <span data-slot="pedido-posicao" className="text-legenda text-ink-3">
                {p.posicao} de {p.total} nesta conversa
              </span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 text-apoio text-ink-2">
            {p.summary?.trim() || "A IA não soube responder e passou para o time."}
          </span>
        </span>
        <span
          data-slot="pedido-espera"
          data-longa={longa ? "sim" : undefined}
          suppressHydrationWarning
          className={cn(
            "mt-0.5 shrink-0 whitespace-nowrap text-legenda font-semibold tabular-nums",
            longa ? "text-warn-ink" : "text-ink-3"
          )}
        >
          {ehAberto ? `há ${formatEspera(p.openedAt, agora)}` : quando(p.closedAt)}
        </span>
      </button>
    </li>
  );
}

/** Um par rótulo e valor da ficha, no desenho da tabela de Dados do contato. */
function Par({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-line-soft py-2">
      <span className="w-[112px] shrink-0 text-legenda text-ink-3">{rotulo}</span>
      <span className="min-w-0 flex-1 text-right text-apoio font-semibold text-ink" suppressHydrationWarning>
        {children}
      </span>
    </div>
  );
}

function FichaPedido({
  p,
  agora,
  readOnly,
  quemResolveu = null,
  onVoltar,
  onOrientar,
  onResolvido,
}: {
  p: PedidoAberto | PedidoResolvido;
  agora: number;
  readOnly: boolean;
  quemResolveu?: string | null;
  onVoltar: () => void;
  onOrientar?: (t: string) => Promise<void>;
  onResolvido?: () => Promise<void>;
}) {
  const ehAberto = "posicao" in p;
  const quem = p.nome ?? prettyPhone(p.phone);
  const [texto, setTexto] = useState("");
  const [orientando, setOrientando] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);
  const longa = ehAberto && agora - Date.parse(p.openedAt) >= ESPERA_AVISO_MS;

  async function enviarOrientacao() {
    const t = texto.trim();
    if (!t || !onOrientar) return;
    setOrientando(true);
    try {
      await onOrientar(t);
    } finally {
      setOrientando(false);
    }
  }

  return (
    <div data-slot="pedido-detalhe" data-pedido={p.id} className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-4 py-2 md:hidden">
        <Button variant="ghost" size="control" onClick={onVoltar} className="-ml-2">
          <ArrowLeft size={16} />
          Pedidos
        </Button>
      </div>
      <AreaRolavel className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2.5">
            <Avatar size="lg" style={avatarPair(p.phone)}>
              {initials(p.nome) ?? <User size={16} />}
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-corpo font-semibold text-ink">{quem}</span>
              {p.nome && <span className="truncate text-legenda text-ink-3">{prettyPhone(p.phone)}</span>}
            </div>
            <Button asChild variant="outline" size="control">
              <Link href={`/inbox/${encodeURIComponent(p.phone)}`}>
                <MessagesSquare size={14} />
                Abrir conversa
              </Link>
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <CabecalhoBloco rotulo="O que foi pedido" />
            <p data-slot="pedido-resumo" className="text-corpo text-ink" style={{ textWrap: "pretty" }}>
              {p.summary?.trim() || "A IA não soube responder e passou para o time."}
            </p>
          </div>

          <div className="flex flex-col">
            <Par rotulo="Aberto em">{quando(p.openedAt)}</Par>
            {ehAberto ? (
              <>
                <Par rotulo="Esperando há">
                  <span className={longa ? "text-warn-ink" : undefined}>{formatEspera(p.openedAt, agora)}</span>
                </Par>
                {p.total > 1 && (
                  <Par rotulo="Nesta conversa">
                    {p.posicao} de {p.total} pedidos
                  </Par>
                )}
              </>
            ) : (
              <>
                <Par rotulo="Resolvido em">{quando(p.closedAt)}</Par>
                <Par rotulo="Esperou">{formatEspera(p.openedAt, Date.parse(p.closedAt))}</Par>
                <Par rotulo="Como">
                  <span data-slot="pedido-como">
                    {p.como === "ia"
                      ? "A IA respondeu com a orientação do time"
                      : quemResolveu
                        ? `Resolvido por ${quemResolveu}`
                        : "Resolvido pelo time"}
                  </span>
                </Par>
              </>
            )}
          </div>

          {!ehAberto && p.orientacao && (
            <div className="flex flex-col gap-2">
              <CabecalhoBloco rotulo="Orientação dada" />
              <p
                data-slot="pedido-orientacao"
                className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-ink"
                style={{ textWrap: "pretty" }}
              >
                {p.orientacao}
              </p>
            </div>
          )}

          {ehAberto && !readOnly && (
            <div data-slot="pedido-acoes" className="flex flex-col gap-2">
              <CabecalhoBloco rotulo="Orientar a IA" />
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviarOrientacao();
                  }
                }}
                placeholder="O que a IA deve dizer ao cliente"
                aria-label="Orientação para a IA"
                rows={3}
              />
              <p className="text-legenda text-ink-3">
                A IA responde ao cliente na hora, seguindo a orientação, e o pedido fica resolvido.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="warn"
                  size="primary"
                  onClick={() => void enviarOrientacao()}
                  carregando={orientando}
                  disabled={!texto.trim() || resolvendo}
                >
                  Orientar a IA
                </Button>
                <Button
                  variant="outline"
                  size="primary"
                  onClick={async () => {
                    if (!onResolvido) return;
                    setResolvendo(true);
                    try {
                      await onResolvido();
                    } finally {
                      setResolvendo(false);
                    }
                  }}
                  carregando={resolvendo}
                  disabled={orientando}
                >
                  Resolvido
                </Button>
              </div>
            </div>
          )}
        </div>
      </AreaRolavel>
    </div>
  );
}
