"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, HandHelping, MessagesSquare } from "lucide-react";
import AvatarContato from "@/components/AvatarContato";
import SecoesDoPedido from "@/features/pedidos/components/SecoesDoPedido";
import SolucaoBadge from "@/components/SolucaoBadge";
import SalvarComoRegra from "@/components/SalvarComoRegra";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatRotulo } from "@/components/ui/stat";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { CabecalhoBloco } from "@/components/ContactFields";
import { formatEspera, prettyPhone } from "@/lib/format";
import { diaMesCurtoHoraSP, horaNoDiaDe, mesmoDiaSP } from "@/lib/fuso";
import { foraDaLista } from "@/lib/inbox-lista";
import { ESPERA_AVISO_MS } from "@/lib/painel";
import { memberName } from "@/lib/team";
import { useDebounce } from "@/lib/use-debounce";
import {
  DIAS_DE_RESOLVIDOS,
  ehAberto,
  podeVirarRegra,
  type PedidoAberto,
  type PedidoItem,
  type PedidoResolvido,
} from "@/features/pedidos/regras";
import type { FontePedidos } from "@/features/pedidos/api/fonte";
import { chavesDePedidos } from "@/features/pedidos/api/chaves";
import {
  useConcluirPedido,
  useContagensDePedidos,
  useFimDaLista,
  useListaDePedidos,
  useMembrosDePedidos,
  usePedidoPorId,
} from "@/features/pedidos/hooks/usePedidos";
import { usePedidosNaUrl } from "./na-url";
import { MOTIVOS, ehMotivo, rotuloDoMotivo } from "@/lib/motivos";
import { SOLUCAO_DA_PORTA, solucaoDoBanco, type Solucao } from "@/lib/solucoes";
import { cn } from "@/lib/utils";
import { TEXTO_ORIENTAR_NO_LIMITE } from "@/lib/custo-ia";

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

/** "30 set, 14:05", sempre no fuso de São Paulo (lib/fuso.ts). */
const quando = diaMesCurtoHoraSP;

// DADOS (passo 3a de docs/plano-dados-e-estado.md): a tela não recebe nada do servidor.
// Cada bloco lê pelo cache (`hooks/usePedidos.ts`): a lista infinita da aba, os
// números das abas, a equipe, o pedido do link, a história do pedido aberto. O
// realtime não mora aqui: a ponte do layout (`lib/realtime/`) encaixa no cache a
// fila da conversa que mexeu, e a tela só desenha o que está nele. Aba, busca,
// motivo e o pedido aberto ficam na URL (`na-url.ts`).
export default function Pedidos({
  fonte,
  clientId,
  numeroAvisos,
  readOnly = false,
  dono = false,
  preview = false,
}: {
  /** De onde vêm os dados: o banco (a página) ou a memória (/design). */
  fonte: FontePedidos;
  /** Tenant logado. Ausente no /design. */
  clientId?: string;
  /** Destino dos avisos: esse número nunca é pedido (lib/avisos.ts). */
  numeroAvisos: string | null;
  /** Conta bloqueada: vê a fila e o histórico, não age (as rotas já respondem 402). */
  readOnly?: boolean;
  /**
   * Papel `dono`: só ele vê "Salvar como regra" (P1 item 5). A rota
   * `agent-rules` barra o atendente de novo; esconder não é barrar.
   */
  dono?: boolean;
  /** /design: sem banco, e as ações só simulam. */
  preview?: boolean;
}) {
  const qc = useQueryClient();
  const fora = useMemo(() => foraDaLista(numeroAvisos), [numeroAvisos]);
  const url = usePedidosNaUrl();
  // O campo segue o que se digita; a URL e a leitura, o texto parado há 300 ms.
  const [q, setQ] = useState(url.q);
  const busca = useDebounce(q.trim(), 300);
  useEffect(() => {
    if (busca !== url.q) void url.setU({ q: busca || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só o texto parado escreve na URL
  }, [busca]);
  const motivo = url.motivo;
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // "Agora" do cálculo da espera, fixado a cada minuto: ler `Date.now()` no
  // render é impuro, e a espera é grossa (minutos, horas).
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (preview) return;
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(relogio);
  }, [preview]);

  // O pedido do link (`?abrir=`): se está resolvido e a URL não diz a aba, a tela
  // abre em Resolvidos, como antes.
  const doLink = usePedidoPorId(fonte, fora, url.abrir, false);
  const pedidoDoLink = doLink.data ?? null;
  const aba: Aba = url.aba ?? (pedidoDoLink && !ehAberto(pedidoDoLink) ? "resolvidos" : "abertos");
  // Com link, a lista espera saber a aba (senão leria Abertos e trocaria em seguida).
  const esperaLink = url.aba == null && url.abrir != null && doLink.isPending;

  const lista = useListaDePedidos(fonte, fora, { aba, busca, motivo }, !esperaLink);
  const contagens = useContagensDePedidos(fonte, fora, motivo);
  const members = useMembrosDePedidos(fonte);
  const concluirNoCache = useConcluirPedido(fonte, fora, !preview);
  // Trocou de aba e a primeira página dela ainda não chegou: o que está na
  // lista é da outra, e não pode aparecer.
  const linhas = useMemo(() => lista.itens.filter((p) => ehAberto(p) === (aba === "abertos")), [lista.itens, aba]);
  const carregando = esperaLink || lista.isPending || lista.isFetchingNextPage || (lista.isPlaceholderData && lista.isFetching);
  const fimRef = useFimDaLista(lista.hasNextPage, lista.isFetchingNextPage, () => void lista.fetchNextPage());

  const nomeDeQuem = useMemo(() => {
    const m = new Map(members.map((x) => [x.userId, memberName(x.email)]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [members]);

  // O detalhe segue a linha da lista quando ela existe (a ponte do realtime a
  // atualiza); fora da lista (busca, outra aba), o pedido lido pelo id.
  const atual = url.abrir != null ? (lista.itens.find((p) => p.id === url.abrir) ?? pedidoDoLink) : null;
  const aberto = atual && ehAberto(atual) ? atual : null;
  const resolvido = atual && !ehAberto(atual) ? atual : null;

  // Abrir um pedido da lista já deixa a linha dele no cache do detalhe: a tela não
  // lê de novo o que está desenhando (antes do passo 3a, selecionar não lia nada).
  function selecionar(p: PedidoItem | null, historico: "push" | "replace" = "push") {
    if (p) qc.setQueryData(chavesDePedidos.detalhe(p.id), p);
    void url.setU({ abrir: p?.id ?? null }, { history: historico });
  }

  function trocarMotivo(v: string) {
    void url.setU({ motivo: ehMotivo(v) ? v : null });
  }

  /**
   * O pedido saiu dos abertos: vira resolvido na tela, com a solução que a ROTA
   * gravou (lib/solucoes.ts). `null` quando esta tela não sabe (outra aba já tinha
   * fechado): a ponte do realtime traz a linha de verdade.
   */
  function concluir(p: PedidoAberto, r: Resultado, solucao: Solucao | null, orientacao: string | null) {
    setResultado(r);
    const fechado: PedidoResolvido = {
      id: p.id,
      phone: p.phone,
      openedAt: p.openedAt,
      closedAt: new Date().toISOString(),
      summary: p.summary,
      motivo: p.motivo,
      atualizadoEm: p.atualizadoEm,
      nome: p.nome,
      fotoPath: p.fotoPath,
      solucao,
      orientacao,
      porQuem: null,
    };
    // O preview não tem banco: a fonte de memória é que precisa saber.
    fonte.fecharNaMemoria?.(fechado);
    concluirNoCache(fechado);
    selecionar(null, "replace");
  }

  async function orientar(p: PedidoAberto, texto: string) {
    if (preview) {
      concluir(p, { tom: "ok", texto: "Orientado. A IA respondeu ao cliente." }, SOLUCAO_DA_PORTA.orientar, texto);
      return;
    }
    const res = await postar("/api/conversations/orientar", {
      phone: p.phone,
      instruction: texto,
      pedidoId: p.id,
    });
    if (!res) return setResultado(SEM_SERVIDOR);
    if (res.status === 409) {
      const corpo = (await res.json().catch(() => ({}))) as { motivo?: string; error?: string };
      // A IA parada no limite de uso do mês (P1 item 6): o pedido CONTINUA
      // aberto (a rota recusou antes de fechar) e a frase diz o que fazer.
      if (corpo.motivo === "limite_ia") {
        setResultado({ tom: "erro", texto: corpo.error ?? TEXTO_ORIENTAR_NO_LIMITE });
        return;
      }
      concluir(p, { tom: "aviso", texto: "Esse pedido já tinha sido resolvido." }, null, null);
      return;
    }
    if (!res.ok) {
      setResultado({ tom: "erro", texto: "Não foi possível orientar. Tente de novo." });
      return;
    }
    // A solução que a rota GRAVOU (`fecharPedido`), não um mapa repetido aqui.
    const data = (await res.json()) as { enviado?: boolean; solucao?: string | null };
    concluir(
      p,
      data.enviado
        ? { tom: "ok", texto: "Orientado. A IA respondeu ao cliente." }
        : {
            tom: "aviso",
            texto:
              "Orientado. A IA não conseguiu responder agora e usa a orientação na próxima mensagem do cliente.",
          },
      solucaoDoBanco(data.solucao),
      texto
    );
  }

  async function marcarResolvido(p: PedidoAberto) {
    if (preview) {
      concluir(p, { tom: "ok", texto: "Marcado como resolvido." }, SOLUCAO_DA_PORTA.resolver, null);
      return;
    }
    const res = await postar("/api/conversations/resolve", { phone: p.phone, pedidoId: p.id });
    if (!res) return setResultado(SEM_SERVIDOR);
    if (!res.ok) {
      setResultado({ tom: "erro", texto: "Não foi possível resolver. Tente de novo." });
      return;
    }
    const data = (await res.json()) as { solucao?: string | null };
    concluir(p, { tom: "ok", texto: "Marcado como resolvido." }, solucaoDoBanco(data.solucao), null);
  }

  const temDetalhe = aberto != null || resolvido != null;

  // LAYOUT (08/10/2026, redesenho): a lista mostra nome, uma linha e os selos,
  // então é uma coluna ESTREITA; o detalhe (a história do pedido) fica com o
  // resto da largura. No celular continua uma tela por vez (lista, depois ficha).
  return (
    <div className="flex min-h-0 flex-1 md:gap-3">
      <Card
        asChild
        variant="pagina"
        className={cn(
          "flex min-w-0 flex-col overflow-hidden max-md:flex-1 md:w-[340px] md:shrink-0 xl:w-[380px]",
          temDetalhe && "max-md:hidden"
        )}
      >
        <section aria-label="Pedidos de ajuda" data-slot="pedidos-coluna-lista">
          <div className="border-b border-line px-4 pb-3 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HandHelping size={20} className="text-brand-ink" />
                <h1 className="text-titulo">Pedidos de ajuda</h1>
              </div>
              <Tabs
                value={aba}
                onValueChange={(v) => {
                  void url.setU({ aba: v as Aba, abrir: null }, { history: "push" });
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
            <p className="mt-1 text-legenda text-ink-3">
              {aba === "abertos"
                ? "Quem espera há mais tempo fica no topo."
                : `Resolvidos nos últimos ${DIAS_DE_RESOLVIDOS} dias, do mais recente para o mais antigo.`}
            </p>
            {/* Busca e filtro por motivo lado a lado: os dois recortam a mesma lista no servidor. */}
            <div data-slot="pedidos-filtros" className="mt-3 flex items-center gap-2">
              <CampoBusca
                className="min-w-0 flex-1"
                valor={q}
                aoMudar={setQ}
                placeholder="Cliente ou pedido"
                rotulo="Buscar pedidos"
              />
              <Select value={motivo ?? "todos"} onValueChange={trocarMotivo}>
                {/* Compacto: "Motivo" sem filtro, o rótulo escolhido (cortado com reticências) com filtro. */}
                <SelectTrigger aria-label="Filtrar por motivo" data-filtro="motivo" className="max-w-[132px]">
                  <SelectValue>{motivo ? rotuloDoMotivo(motivo) : "Motivo"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os motivos</SelectItem>
                  {MOTIVOS.map((m) => (
                    <SelectItem key={m.chave} value={m.chave}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {resultado && (
            <p
              role="status"
              data-slot="pedidos-resultado"
              className={cn(
                "mx-4 mt-3 rounded-lg border px-3 py-2 text-apoio",
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
            ) : linhas.length === 0 && busca === "" && motivo ? (
              <p data-slot="pedidos-vazio" className="px-5 py-10 text-center text-apoio text-ink-3">
                Nenhum pedido com o motivo “{rotuloDoMotivo(motivo)}”.
              </p>
            ) : linhas.length === 0 && busca === "" ? (
              <EstadoVazio
                data-slot="pedidos-vazio"
                icone={HandHelping}
                titulo={
                  aba === "abertos" ? "Nenhum pedido esperando." : "Nenhum pedido resolvido ainda."
                }
                texto={
                  aba === "abertos"
                    ? "Quando a IA pedir ajuda, o pedido aparece aqui e no WhatsApp de avisos."
                    : `Os pedidos resolvidos nos últimos ${DIAS_DE_RESOLVIDOS} dias ficam aqui, com o que foi feito.`
                }
              />
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
                    ativa={p.id === url.abrir}
                    onSelecionar={() => {
                      setResultado(null);
                      selecionar(p);
                    }}
                  />
                ))}
                {/* O fim da lista: quando aparece, vem a próxima página. */}
                {lista.hasNextPage && (
                  <li
                    ref={fimRef}
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
        className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", !temDetalhe && "max-md:hidden")}
      >
        <aside aria-label="Pedido selecionado" data-slot="pedidos-coluna-detalhe">
          {aberto ? (
            <FichaPedido
              key={`a-${aberto.id}`}
              p={aberto}
              agora={agora}
              readOnly={readOnly}
              fonte={fonte}
              clientId={clientId}
              preview={preview}
              numeroAvisos={numeroAvisos}
              onVoltar={() => selecionar(null)}
              onOrientar={(t) => orientar(aberto, t)}
              onResolvido={() => marcarResolvido(aberto)}
            />
          ) : resolvido ? (
            <FichaPedido
              key={`r-${resolvido.id}`}
              p={resolvido}
              agora={agora}
              readOnly
              fonte={fonte}
              clientId={clientId}
              preview={preview}
              numeroAvisos={numeroAvisos}
              quemResolveu={nomeDeQuem(resolvido.porQuem)}
              podeSalvarRegra={dono && !readOnly}
              onVoltar={() => selecionar(null)}
            />
          ) : (
            <EstadoVazio
              data-slot="pedido-nenhum"
              tamanho="detalhe"
              icone={HandHelping}
              texto="Escolha um pedido na lista para ver o que o cliente escreveu e o que fazer."
            />
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
          "relative w-full flex-col items-stretch gap-1 border-b border-line-soft py-3 pl-4 pr-4 text-left",
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
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-corpo font-semibold text-ink">{quem}</span>
          <span
            data-slot="pedido-espera"
            data-longa={longa ? "sim" : undefined}
            suppressHydrationWarning
            className={cn(
              "shrink-0 whitespace-nowrap text-legenda font-semibold tabular-nums",
              longa ? "text-warn-ink" : "text-ink-3"
            )}
          >
            {ehAberto ? `há ${formatEspera(p.openedAt, agora)}` : quando(p.closedAt)}
          </span>
        </span>
        <span className="line-clamp-2 text-apoio text-ink-2">
          {p.summary?.trim() || "A IA não soube responder e passou para o time."}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {p.motivo && (
            <Badge variant="motivo" data-motivo={p.motivo}>
              {rotuloDoMotivo(p.motivo)}
            </Badge>
          )}
          {!ehAberto && <SolucaoBadge solucao={p.solucao} />}
          {ehAberto && p.total > 1 && (
            <span data-slot="pedido-posicao" className="text-legenda text-ink-3">
              {p.posicao} de {p.total} nesta conversa
            </span>
          )}
        </span>
      </Button>
    </li>
  );
}

/** Um fato do pedido (rótulo em cima, valor embaixo), na faixa do topo do detalhe. */
function Fato({ rotulo, children, slot }: { rotulo: string; children: React.ReactNode; slot?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <StatRotulo>{rotulo}</StatRotulo>
      <span data-slot={slot} className="min-w-0 text-apoio font-semibold text-ink" suppressHydrationWarning>
        {children}
      </span>
    </div>
  );
}

function FichaPedido({
  p,
  agora,
  readOnly,
  fonte,
  clientId,
  preview,
  numeroAvisos,
  quemResolveu = null,
  podeSalvarRegra = false,
  onVoltar,
  onOrientar,
  onResolvido,
}: {
  p: PedidoAberto | PedidoResolvido;
  agora: number;
  readOnly: boolean;
  fonte: FontePedidos;
  clientId?: string;
  preview: boolean;
  numeroAvisos: string | null;
  quemResolveu?: string | null;
  /** Dono numa conta ativa: a orientação do pedido resolvido pode virar regra. */
  podeSalvarRegra?: boolean;
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
  const comAcoes = ehAberto && !readOnly;

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
        <div className="flex flex-col gap-5 p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <AvatarContato size="lg" phone={p.phone} name={p.nome} fotoPath={p.fotoPath} />
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

          {/* O resumo é a LEITURA da IA, rotulada como tal; o que o cliente escreveu de verdade está nas seções. */}
          <div className="flex flex-col gap-1">
            <StatRotulo>Resumo da IA</StatRotulo>
            <h2 data-slot="pedido-resumo" className="text-cartao text-ink" style={{ textWrap: "pretty" }}>
              {p.summary?.trim() || "A IA não soube responder e passou para o time."}
            </h2>
          </div>

          <div
            data-slot="pedido-fatos"
            className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line-soft py-3 lg:grid-cols-4"
          >
            <Fato rotulo="Motivo">
              <span data-slot="pedido-motivo">{rotuloDoMotivo(p.motivo)}</span>
            </Fato>
            <Fato rotulo="Aberto em">
              {quando(p.openedAt)}
              {/* O cliente acrescentou algo e o resumo foi reescrito (08/10/2026). */}
              {p.atualizadoEm && (
                <span data-slot="pedido-atualizado" className="block text-legenda font-normal text-ink-3">
                  atualizado {mesmoDiaSP(p.atualizadoEm, p.openedAt) ? "às" : "em"} {horaNoDiaDe(p.atualizadoEm, p.openedAt)}
                </span>
              )}
            </Fato>
            {ehAberto ? (
              <>
                <Fato rotulo="Esperando há">
                  <span className={longa ? "text-warn-ink" : undefined}>{formatEspera(p.openedAt, agora)}</span>
                </Fato>
                <Fato rotulo="Nesta conversa">
                  {p.total > 1 ? `${p.posicao} de ${p.total} pedidos` : "Só este pedido"}
                </Fato>
              </>
            ) : (
              <>
                <Fato rotulo="Resolvido em">
                  {quando(p.closedAt)}
                  <span className="block text-legenda font-normal text-ink-3">
                    esperou {formatEspera(p.openedAt, Date.parse(p.closedAt))}
                    {quemResolveu ? `, por ${quemResolveu}` : ""}
                  </span>
                </Fato>
                <Fato rotulo="Solução" slot="pedido-solucao">
                  {p.solucao ? <SolucaoBadge solucao={p.solucao} /> : <span className="text-ink-3">Sem registro</span>}
                </Fato>
              </>
            )}
          </div>

          {/* UMA coluna em leitura, em qualquer tela (dono, 08/10/2026): as seções e, no aberto, a caixa de
              orientar EMBAIXO, na largura toda do detalhe (dono, 08/10/2026). */}
          <div className="flex flex-col gap-6">
            <SecoesDoPedido
              p={p}
              fonte={fonte}
              clientId={clientId}
              preview={preview}
              numeroAvisos={numeroAvisos}
              agora={agora}
              acaoDaOrientacao={
                podeSalvarRegra && podeVirarRegra(p)
                  ? (regraSalvaEm) => (
                      <SalvarComoRegra
                        pedidoId={p.id}
                        orientacao={p.orientacao}
                        clientId={clientId}
                        salvaEm={regraSalvaEm}
                        preview={preview}
                      />
                    )
                  : undefined
              }
            />

            {comAcoes && (
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
                  rows={4}
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
        </div>
      </AreaRolavel>
    </div>
  );
}
