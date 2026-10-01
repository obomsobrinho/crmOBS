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
import { createClient } from "@/lib/supabase/client";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import { FUSO, formatEspera, prettyPhone } from "@/lib/format";
import { avatarPair, initials } from "@/lib/inbox";
import { foraDaLista } from "@/lib/inbox-lista";
import { ehNumeroDeAvisos } from "@/lib/avisos";
import { ESPERA_AVISO_MS } from "@/lib/painel";
import { memberName, type Member } from "@/lib/team";
import { useDebounce } from "@/lib/use-debounce";
import { usePaginada } from "@/lib/use-paginada";
import {
  DIAS_DE_RESOLVIDOS,
  PAGINA_PEDIDOS,
  ehAberto,
  encaixarAbertosDaConversa,
  encaixarResolvido,
  type ContatoLinha,
  type PedidoAberto,
  type PedidoItem,
  type PedidoLinha,
  type PedidoResolvido,
  type PedidoResolvidoLinha,
} from "@/lib/pedidos";
import {
  fonteDaMemoria,
  fonteDoBanco,
  type AbaPedidos,
  type ContagensPedidos,
  type FontePedidos,
  type ParamsPedidos,
} from "@/lib/pedidos-fonte";
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

// PAGINAÇÃO E REALTIME (02/10/2026, auditoria F3, R-07; docs/plano-carregamento.md).
// A lista da aba ativa vem de UMA fonte (`lib/pedidos-fonte.ts`, a mesma da
// página do servidor): 10 por vez, mais ao rolar, busca no banco depois de 300ms
// parado. Trocar de aba troca o recorte (primeira página dela). O realtime não
// refaz lista: um evento de `handoffs` busca SÓ a fila da conversa que mexeu (ou
// o pedido que fechou) e encaixa no lugar; os números das abas são agregado.
export default function Pedidos({
  inicial,
  members,
  clientId,
  numeroAvisos,
  readOnly = false,
  previewDados,
  preview = false,
}: {
  /** O que o servidor já buscou: a primeira página da aba que abre, os números e o `?abrir=`. */
  inicial: {
    aba: AbaPedidos;
    itens: PedidoItem[];
    temMais: boolean;
    contagens: ContagensPedidos;
    /** `?abrir=` do link do aviso: o pedido que já nasce selecionado. */
    abrir: PedidoItem | null;
  };
  /** Para nomear quem resolveu. */
  members: Member[];
  /** Tenant logado: o realtime escuta só ele. Ausente no /design. */
  clientId?: string;
  /** Destino dos avisos: esse número nunca é pedido (lib/avisos.ts). */
  numeroAvisos: string | null;
  /** Conta bloqueada: vê a fila e o histórico, não age (as rotas já respondem 402). */
  readOnly?: boolean;
  /** /design: as linhas falsas de onde a fonte de memória tira os pedidos. */
  previewDados?: {
    abertos: PedidoLinha[];
    resolvidos: PedidoResolvidoLinha[];
    contatos: ContatoLinha[];
  };
  /** /design: sem banco, e as ações só simulam. */
  preview?: boolean;
}) {
  const [dadosPreview, setDadosPreview] = useState(previewDados);
  const fonte = useMemo<FontePedidos>(
    () =>
      clientId && !preview
        ? fonteDoBanco(createClient(), clientId)
        : fonteDaMemoria(
            dadosPreview?.abertos ?? [],
            dadosPreview?.resolvidos ?? [],
            dadosPreview?.contatos ?? [],
            numeroAvisos
          ),
    [clientId, preview, dadosPreview, numeroAvisos]
  );
  const fora = useMemo(() => foraDaLista(numeroAvisos), [numeroAvisos]);

  const [aba, setAba] = useState<Aba>(inicial.aba);
  const [selecionado, setSelecionado] = useState<PedidoItem | null>(inicial.abrir);
  const [q, setQ] = useState("");
  // A busca vai ao SERVIDOR, e só depois de a pessoa parar de digitar.
  const busca = useDebounce(q.trim(), 300);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [contagens, setContagens] = useState(inicial.contagens);
  // "Agora" do cálculo da espera, fixado a cada minuto: ler `Date.now()` no
  // render é impuro, e a espera é grossa (minutos, horas).
  const [agora, setAgora] = useState(() => Date.now());

  const params = useMemo<ParamsPedidos>(() => ({ aba, busca, fora }), [aba, busca, fora]);
  const { itens, setItens, temMais, carregando, fimRef, revalidar } = usePaginada<PedidoItem, ParamsPedidos>({
    inicial: inicial.itens,
    temMaisInicial: inicial.temMais,
    params,
    buscar: (p, depois, n) => fonte.pagina(p, depois, n),
    chave: (p) => p.id,
    tamanho: PAGINA_PEDIDOS,
    // Voltar o foco é com o canal (`useCanalTenant`), que também recontar.
    revalidarAoVoltar: false,
  });
  // Trocou de aba e a primeira página dela ainda não chegou: o que está na
  // lista é da outra, e não pode aparecer.
  const linhas = useMemo(() => itens.filter((p) => ehAberto(p) === (aba === "abertos")), [itens, aba]);

  const nomeDeQuem = useMemo(() => {
    const m = new Map(members.map((x) => [x.userId, memberName(x.email)]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [members]);

  // O detalhe segue a linha da lista quando ela existe (o realtime a atualiza);
  // se a busca a tirou da lista, a ficha continua com o que estava na tela.
  const atual = selecionado ? (itens.find((p) => p.id === selecionado.id) ?? selecionado) : null;
  const aberto = atual && ehAberto(atual) ? atual : null;
  const resolvido = atual && !ehAberto(atual) ? atual : null;

  const recontar = useCallback(async () => {
    try {
      setContagens(await fonte.contagens(fora));
    } catch (e) {
      console.error("contagens de pedidos:", e);
    }
  }, [fonte, fora]);

  // O que o realtime precisa saber sem refazer o canal a cada render.
  const vivo = useRef({ aba, busca, temMais, selecionado });
  useEffect(() => {
    vivo.current = { aba, busca, temMais, selecionado };
  });

  /**
   * Encaixa na lista o que mudou numa conversa: a fila aberta dela (posição e
   * total refeitos) quando a aba é a dos abertos, ou os pedidos que fecharam
   * quando é a dos resolvidos. UMA consulta pequena por conversa, nunca a lista.
   */
  const sincronizar = useCallback(
    async (phone: string, ids: number[]) => {
      const v = vivo.current;
      try {
        if (v.aba === "abertos") {
          const novos = await fonte.abertosDoFone(fora, phone);
          setItens((cur) => encaixarAbertosDaConversa(cur, phone, novos, v.busca, v.temMais));
        } else {
          const lidos = await Promise.all(ids.map((id) => fonte.porId(fora, id).then((i) => [id, i] as const)));
          setItens((cur) =>
            lidos.reduce((acc, [id, i]) => encaixarResolvido(acc, id, i, v.busca, v.temMais, Date.now()), cur)
          );
        }
        if (v.selecionado && v.selecionado.phone === phone) {
          const novo = await fonte.porId(fora, v.selecionado.id);
          if (novo) setSelecionado(novo);
        }
        void recontar();
      } catch (e) {
        console.error("pedido do realtime:", e);
      }
    },
    [fonte, fora, setItens, recontar]
  );

  // Uma rajada de eventos vira UMA busca por conversa, depois de 400ms parado.
  const pendentesRef = useRef(new Map<string, Set<number>>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descarregar = useCallback(() => {
    const todos = [...pendentesRef.current.entries()];
    pendentesRef.current.clear();
    for (const [phone, ids] of todos) void sincronizar(phone, [...ids]);
  }, [sincronizar]);
  useEffect(() => {
    if (!clientId || preview) return;
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(relogio);
    };
  }, [clientId, preview]);

  // Tempo real: o canal do tenant (`useCanalTenant`) cuida do status, da volta
  // do foco e da aba escondida; daqui sai só o que é desta tela. Revalidar
  // (reassinatura, volta ao foco) é o ÚNICO lugar que relê a lista inteira.
  useCanalTenant({
    clientId,
    ativo: !!clientId && !preview,
    tabelas: ["handoffs"],
    aoEvento: (ev) => {
      const fone = foneDoEvento(ev);
      if (!fone || ehNumeroDeAvisos(fone, numeroAvisos)) return;
      const ids = pendentesRef.current.get(fone) ?? new Set<number>();
      const id = Number((ev.novo ?? ev.antigo)?.id);
      // Pedido que fechou (ou sumiu) pode ser da aba dos resolvidos.
      if (Number.isFinite(id) && (ev.tipo === "DELETE" || ev.novo?.closed_at != null)) ids.add(id);
      pendentesRef.current.set(fone, ids);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(descarregar, 400);
    },
    revalidar: () => {
      void revalidar();
      void recontar();
    },
  });

  /** O pedido saiu dos abertos: vira resolvido na tela, com o que aconteceu. */
  function concluir(p: PedidoAberto, r: Resultado, como: "ia" | "resolvido", orientacao: string | null) {
    setResultado(r);
    const fechado: PedidoResolvido = {
      id: p.id,
      phone: p.phone,
      openedAt: p.openedAt,
      closedAt: new Date().toISOString(),
      summary: p.summary,
      nome: p.nome,
      como,
      orientacao,
      porQuem: null,
    };
    setItens((cur) => {
      const sem = cur.filter((x) => x.id !== p.id);
      return aba === "resolvidos" ? [fechado, ...sem] : sem;
    });
    setContagens((c) => ({ abertos: Math.max(0, c.abertos - 1), resolvidos: c.resolvidos + 1 }));
    setSelecionado(null);
    if (preview) {
      // O preview não tem banco: a fonte de memória é que precisa saber.
      setDadosPreview((d) =>
        d && {
          ...d,
          abertos: d.abertos.filter((x) => x.id !== p.id),
          resolvidos: [
            {
              id: p.id,
              phone: p.phone,
              opened_at: p.openedAt,
              summary: p.summary,
              instruction: orientacao,
              closed_at: fechado.closedAt,
              closed_how: como,
              closed_by: null,
            },
            ...d.resolvidos,
          ],
        }
      );
    } else {
      // O realtime também vai chegar; aqui a fila da conversa é refeita já.
      void sincronizar(p.phone, [p.id]);
    }
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
                    <span className="ml-1.5 tabular-nums opacity-75">{contagens.abertos}</span>
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
            {linhas.length === 0 && carregando ? (
              <p data-slot="pedidos-carregando" className="px-5 py-10 text-center text-apoio text-ink-3">
                Carregando…
              </p>
            ) : linhas.length === 0 && busca === "" ? (
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
                Nenhum pedido para “{busca}”.
              </p>
            ) : (
              <ul data-slot="pedidos-lista">
                {linhas.map((p) => (
                  <LinhaPedido
                    key={p.id}
                    p={p}
                    agora={agora}
                    ativa={p.id === selecionado?.id}
                    onSelecionar={() => {
                      setResultado(null);
                      setSelecionado(p);
                    }}
                  />
                ))}
                {/* O fim da lista: quando aparece, vem a próxima página. */}
                {temMais && (
                  <li
                    ref={(el) => {
                      fimRef.current = el;
                    }}
                    data-slot="pedidos-mais"
                    aria-hidden
                    className="h-px"
                  />
                )}
                {carregando && (
                  <li data-slot="pedidos-carregando" className="px-5 py-3 text-legenda text-ink-3">
                    Carregando…
                  </li>
                )}
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
      <Button
        variant="ghost"
        size="none"
        onClick={onSelecionar}
        aria-current={ativa ? "true" : undefined}
        className={cn(
          "relative w-full items-start gap-3 border-b border-line-soft py-3 pl-4 pr-4 text-left md:pl-5",
          ativa && "bg-[var(--sel-bg)] hover:bg-[var(--sel-bg)]"
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
      </Button>
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
