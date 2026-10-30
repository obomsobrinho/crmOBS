"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, Loader2, MapPin, Plus, Search, Star, ThumbsUp, X } from "lucide-react";
import BotaoDeFiltro from "@/components/BotaoDeFiltro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Aviso } from "@/components/ui/aviso";
import { Medidor } from "@/components/ui/medidor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mascaraTelefoneBR, numeroBR, pct, plural } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import {
  FAIXAS_DE_NOTA,
  ROTULO_DA_BUSCA,
  ROTULO_DO_SITE,
  resumoDasOpcoes,
  textoDoDiaDeEnvio,
  textoDoLocal,
  tipoDoTelefone,
  type DiaDeEnvio,
  type OpcoesDaBusca,
  type ResumoDaBase,
  type SemanaContada,
  type SituacaoDaBusca,
} from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import { FaixaDeNumeros } from "./faixa";
import NovaBusca from "./NovaBusca";
import FichaDoLead from "./FichaDoLead";
import { CabecalhoDoGrafico, Rosca } from "./graficos";
import { CartaoDeRanking, FunilDaBase, OndeEstao } from "./ranking";
import { SeloDaBusca, SeloDaPontuacao, TextoDoSite, TopoDeDetalhe, haQuanto } from "./pecas";
import { BarraDaTabela, CabecalhoDaTabela, CorpoDaTabela, RodapeDaTabela, useLeitura, usePaginaDaFonte } from "./tabela";
import {
  sinaisDoLead,
  somaDe,
  type Busca,
  type BuscaDaTabela,
  type CampanhaEditavel,
  type ContagemDaBusca,
  type FiltroDosLeads,
  type FonteDeCampanhas,
  type InicialDaCentral,
  type Lead,
  type LeadDaTabela,
  type Pagina,
  type Totais,
} from "./tipos";

// LEADS, a base: o painel no topo (quantos, onde, quantos já contatados e quem
// respondeu) e embaixo a tabela, por busca ou com todos os leads, 10 por página,
// com busca digitando e o botão de filtro. A busca abre o detalhe com os leads dela.
// Tudo lido da fonte: páginas e contas no servidor, nunca a base no navegador.

// O mapa (Leaflet) só carrega no navegador e só no detalhe de uma busca.
const MapaDaBusca = dynamic(() => import("./MapaDaBusca"), { ssr: false });

/** De quanto em quanto tempo a tabela relê uma busca que ainda está rodando na fonte. */
const RELER_BUSCA_MS = 10_000;

// ── O painel da base ────────────────────────────────────────────────────

type Semana = SemanaContada;

const pontosDaSemana = (semanas: Semana[]) =>
  semanas.map((s) => ({ chave: s.inicio, rotulo: `Semana de ${s.inicio.slice(8, 10)}/${s.inicio.slice(5, 7)}`, valor: s.n }));

/** O tipo de telefone em pedaços (celular, fixo, sem): quem pode e quem não pode receber WhatsApp. */
const partesDoTelefone = (r: ResumoDaBase) => [
  { chave: "celular", rotulo: "Celular", n: r.porTelefone.celular, cor: "var(--chart-1)" },
  { chave: "fixo", rotulo: "Fixo", n: r.porTelefone.fixo, cor: "var(--chart-rampa-2)" },
  { chave: "sem", rotulo: "Sem", n: r.porTelefone.sem, cor: "var(--chart-barra-neutra)" },
];

/**
 * O painel da base. Cada número com o desenho que combina com ele (dono, 29/10/2026: "tem tantos
 * gráficos bacanas, vamos ser criativos"): leads novos por semana em área, o tipo de telefone em pedaços,
 * os envios por semana em colunas e a taxa de resposta num anel.
 */
function PainelDaBase({
  r,
  novosPorSemana,
  enviosPorSemana,
}: {
  r: ResumoDaBase;
  novosPorSemana: Semana[];
  enviosPorSemana: Semana[];
}) {
  const funil = [
    { chave: "base", rotulo: "Na base", n: r.total },
    { chave: "celular", rotulo: "Com celular", n: r.comCelular },
    { chave: "contatados", rotulo: "Contatados", n: r.contatados },
    { chave: "responderam", rotulo: "Responderam", n: r.responderam },
  ];
  return (
    <div className="flex flex-col gap-4" data-slot="leads-painel">
      <FaixaDeNumeros
        celulas={[
          {
            chave: "base",
            rotulo: "Na base",
            valor: numeroBR(r.total),
            frase: `em ${numeroBR(r.porCidade.length)} ${plural(r.porCidade.length, "cidade", "cidades")}`,
            desenho: { tipo: "area", nome: "Leads novos", pontos: pontosDaSemana(novosPorSemana) },
          },
          {
            chave: "celular",
            rotulo: "Com celular",
            valor: numeroBR(r.comCelular),
            complemento: `${pct(r.comCelular, r.total)}%`,
            frase: "",
            desenho: { tipo: "partes", partes: partesDoTelefone(r) },
          },
          {
            chave: "contatados",
            rotulo: "Contatados",
            valor: numeroBR(r.contatados),
            complemento: `${pct(r.contatados, r.comCelular)}%`,
            frase: `${numeroBR(r.aContatar)} ainda a contatar`,
            desenho: { tipo: "colunas", nome: "Envios", pontos: pontosDaSemana(enviosPorSemana), destaque: "ultima" },
          },
          {
            chave: "responderam",
            rotulo: "Responderam",
            valor: numeroBR(r.responderam),
            frase: "dos contatados",
            desenho: { tipo: "anel", valor: pct(r.responderam, r.contatados) },
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OndeEstao cidades={r.porCidade} segmentos={r.porSegmento} total={r.total} />
        </div>
        <Card variant="conteudo" className="p-5" data-bloco="leads-funil">
          <div className="flex min-h-8 items-center">
            <h3 className="text-rotulo uppercase text-ink-3">Funil da base</h3>
          </div>
          <FunilDaBase passos={funil} />
        </Card>
      </div>
    </div>
  );
}

/**
 * O painel de UMA busca: a faixa (o que veio, a nota média, quanto já foi contatado, as respostas por
 * dia) e uma linha com os bairros, a presença online e a pontuação. Cabe acima da tabela.
 */
function PainelDaBusca({ r, respostasPorDia }: { r: ResumoDaBase; respostasPorDia: DiaDeEnvio[] }) {
  return (
    <div className="flex flex-col gap-4" data-slot="busca-painel">
      <FaixaDeNumeros
        celulas={[
          {
            chave: "achadas",
            rotulo: "Achadas",
            valor: numeroBR(r.total),
            complemento: `${numeroBR(r.comCelular)} com celular`,
            frase: "",
            desenho: { tipo: "partes", partes: partesDoTelefone(r) },
          },
          {
            chave: "nota",
            rotulo: "Nota no Google",
            valor: r.notaMedia === null ? "Sem nota" : r.notaMedia.toFixed(1).replace(".", ","),
            frase: "a média das notas",
            desenho: {
              tipo: "colunas",
              nome: "Leads",
              pontos: FAIXAS_DE_NOTA.map((f) => ({ chave: f.chave, rotulo: f.rotulo, valor: r.porNota[f.chave] })),
            },
          },
          {
            chave: "contatados",
            rotulo: "Contatados",
            valor: numeroBR(r.contatados),
            frase: `${numeroBR(r.aContatar)} ainda a contatar`,
            desenho: { tipo: "anel", valor: pct(r.contatados, r.comCelular) },
          },
          {
            chave: "responderam",
            rotulo: "Responderam",
            valor: numeroBR(r.responderam),
            complemento: r.contatados > 0 ? `${pct(r.responderam, r.contatados)}%` : undefined,
            frase: "dos contatados",
            desenho: {
              tipo: "area",
              nome: "Respostas",
              pontos: respostasPorDia.map((d) => ({ chave: d.dia, rotulo: textoDoDiaDeEnvio(d.dia), valor: d.responderam })),
            },
          },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <CartaoDeRanking titulo="Por bairro" grupos={r.porBairro} total={r.total} unidade={["bairro", "bairros"]} bloco="busca-bairros" />
        <Card variant="conteudo" className="p-5" data-bloco="busca-site">
          <CabecalhoDoGrafico titulo="Presença online" />
          <Rosca
            compacta
            nome="Leads por presença online"
            unidade={["lead", "leads"]}
            fatias={[
              { chave: "nao", rotulo: ROTULO_DO_SITE.nao, n: r.porSite.nao, fill: "var(--chart-rampa-4)" },
              { chave: "so_rede_social", rotulo: ROTULO_DO_SITE.so_rede_social, n: r.porSite.so_rede_social, fill: "var(--chart-rampa-2)" },
              { chave: "sim", rotulo: ROTULO_DO_SITE.sim, n: r.porSite.sim, fill: "var(--chart-barra-neutra)" },
            ]}
          />
        </Card>
        <Card variant="conteudo" className="p-5" data-bloco="busca-pontuacao">
          <CabecalhoDoGrafico titulo="Pontuação" />
          <Rosca
            compacta
            nome="Leads por pontuação"
            unidade={["lead", "leads"]}
            fatias={[
              { chave: "alta", rotulo: "Alta", n: r.porFaixa.alta, fill: "var(--chart-rampa-4)" },
              { chave: "media", rotulo: "Média", n: r.porFaixa.media, fill: "var(--chart-rampa-2)" },
              { chave: "baixa", rotulo: "Baixa", n: r.porFaixa.baixa, fill: "var(--chart-barra-neutra)" },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

// ── A tabela de buscas ──────────────────────────────────────────────────

const GRADE_BUSCAS =
  "xl:grid xl:grid-cols-[minmax(0,2.2fr)_110px_repeat(3,minmax(0,0.8fr))_minmax(0,1.4fr)_minmax(0,0.9fr)_20px] xl:items-center xl:gap-5";

function LinhaDaBusca({
  busca,
  contagem,
  agora,
  abrir,
}: {
  busca: BuscaDaTabela;
  contagem: ContagemDaBusca;
  agora: number;
  abrir: () => void;
}) {
  const pronta = busca.situacao === "pronta";
  return (
    <li>
      <Button
        variant="linha"
        size="none"
        onClick={abrir}
        disabled={!pronta}
        data-slot="busca-linha"
        data-busca={busca.id}
        className={`flex w-full flex-wrap items-center gap-x-5 gap-y-2 rounded-none px-5 py-3.5 text-left disabled:cursor-default disabled:opacity-100 ${GRADE_BUSCAS}`}
      >
        <span className="min-w-0 basis-full xl:basis-auto">
          <span className="block truncate text-corpo font-semibold text-ink first-letter:uppercase">{busca.termo}</span>
          <span className="flex items-center gap-1 truncate text-legenda text-ink-3">
            <MapPin size={12} aria-hidden />
            {busca.cidade}
          </span>
        </span>
        <span>
          <SeloDaBusca situacao={busca.situacao} />
        </span>
        {pronta ? (
          <>
            {(
              [
                ["Achadas", contagem.total],
                ["Com celular", contagem.comCelular],
                ["Bons", contagem.bons],
              ] as const
            ).map(([rotulo, n]) => (
              <span key={rotulo} className="text-apoio tabular-nums text-ink">
                <span className="mr-1 text-legenda text-ink-3 xl:hidden">{rotulo}</span>
                {numeroBR(n)}
              </span>
            ))}
            <span className="flex min-w-[140px] flex-1 flex-col gap-1.5 xl:min-w-0">
              <span className="text-legenda tabular-nums text-ink-2">
                <span className="font-semibold text-ink">{numeroBR(contagem.contatados)}</span> de {numeroBR(contagem.comCelular)}
                {contagem.responderam > 0 && <span className="text-ink-3"> · {numeroBR(contagem.responderam)} responderam</span>}
              </span>
              <Medidor
                valor={pct(contagem.contatados, Math.max(1, contagem.comCelular))}
                tom="marca"
                rotulo={`${contagem.contatados} de ${contagem.comCelular} contatados`}
              />
            </span>
          </>
        ) : (
          <span className="flex items-center gap-2 text-apoio text-ink-2 xl:col-span-4">
            {busca.situacao === "buscando" ? (
              <>
                <Loader2 size={14} aria-hidden className="animate-spin text-ink-3 motion-reduce:animate-none" />
                Procurando empresas
              </>
            ) : (
              busca.erro
            )}
          </span>
        )}
        <span className="text-legenda text-ink-3">{haQuanto(busca.criadaEm, agora)}</span>
        {pronta ? <ChevronRight size={16} aria-hidden className="ml-auto text-ink-3 xl:ml-0" /> : <span />}
      </Button>
    </li>
  );
}

const SITUACOES_DA_BUSCA: SituacaoDaBusca[] = ["pronta", "buscando", "falhou"];

function TabelaDeBuscas({
  esquerda,
  fonte,
  versao,
  contagens,
  inicial,
  agora,
  abrir,
  aoTerminarBusca,
}: {
  esquerda: React.ReactNode;
  fonte: FonteDeCampanhas;
  versao: number;
  contagens: Record<SituacaoDaBusca, number> | null;
  /** A primeira página que o servidor já leu (recorte padrão). */
  inicial: Pagina<BuscaDaTabela> | null;
  agora: number;
  abrir: (id: string) => void;
  /** Uma busca da página saiu de "buscando": o painel e as contagens leem de novo. */
  aoTerminarBusca: () => void;
}) {
  const [q, setQ] = useState("");
  const busca = useDebounce(q.trim(), 300);
  const [situacao, setSituacao] = useState<SituacaoDaBusca | null>(null);
  const ler = useCallback((pagina: number) => fonte.buscas({ texto: busca, situacao, pagina }), [fonte, busca, situacao]);
  const tabela = usePaginaDaFonte(`${busca}|${situacao ?? ""}`, ler, versao, inicial);
  const { itens, recarregar } = tabela;
  const buscando = itens.filter((b) => b.situacao === "buscando").map((b) => b.id);
  const chaveBuscando = buscando.join(",");

  // Uma busca rodando na fonte: relê a página de tempos em tempos (aba visível), sem tempo real.
  useEffect(() => {
    if (!chaveBuscando) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") recarregar();
    }, RELER_BUSCA_MS);
    return () => window.clearInterval(t);
  }, [chaveBuscando, recarregar]);
  // Terminou = uma busca que estava "buscando" voltou numa leitura com outra situação
  // (sumir da página, por trocar de página ou de filtro, não é terminar).
  const rodando = useRef(new Set<string>());
  useEffect(() => {
    const terminou = itens.some((b) => b.situacao !== "buscando" && rodando.current.has(b.id));
    for (const b of itens) {
      if (b.situacao === "buscando") rodando.current.add(b.id);
      else rodando.current.delete(b.id);
    }
    if (terminou) aoTerminarBusca();
  }, [itens, aoTerminarBusca]);
  const todas = somaDe(contagens);

  return (
    <>
      <BarraDaTabela
        busca={q}
        aoBuscar={setQ}
        placeholder="Segmento ou cidade"
        rotuloDaBusca="Buscar por segmento ou cidade"
        filtro={
          <BotaoDeFiltro
            slot="buscas-filtro"
            ativos={situacao ? 1 : 0}
            rotulo={situacao ? `Filtrar buscas: ${ROTULO_DA_BUSCA[situacao]}` : "Filtrar buscas"}
            grupos={[
              {
                titulo: "Situação",
                opcoes: [
                  { chave: "todas", rotulo: "Todas", contagem: todas, marcado: situacao === null, aoEscolher: () => setSituacao(null) },
                  ...SITUACOES_DA_BUSCA.map((s) => ({
                    chave: s,
                    rotulo: ROTULO_DA_BUSCA[s],
                    contagem: contagens?.[s] ?? 0,
                    marcado: situacao === s,
                    aoEscolher: () => setSituacao(s),
                  })),
                ],
              },
            ]}
          />
        }
      >
        {esquerda}
      </BarraDaTabela>
      <CabecalhoDaTabela grade={GRADE_BUSCAS} colunas={["Busca", "Situação", "Achadas", "Com celular", "Bons", "Contatados", "Quando", ""]} />
      <CorpoDaTabela
        lido={tabela.lido}
        erro={tabela.erro}
        recarregar={recarregar}
        quantas={itens.length}
        vazio={busca ? `Nenhuma busca com "${q.trim()}".` : "Nenhuma busca nesta situação."}
      >
        <ul className="divide-y divide-line-soft" data-slot="leads-buscas">
          {itens.map((b) => (
            <LinhaDaBusca key={b.id} busca={b} contagem={b.contagem} agora={agora} abrir={() => abrir(b.id)} />
          ))}
        </ul>
      </CorpoDaTabela>
      <RodapeDaTabela pagina={tabela.pagina} total={tabela.total} aoMudar={tabela.setPagina} slot="buscas" lido={tabela.lido} />
    </>
  );
}

// ── A tabela de leads (todos, ou os de uma busca) ──────────────────────

type Filtro = FiltroDosLeads;

const FILTROS: { chave: Filtro; rotulo: string }[] = [
  { chave: "nao_contatados", rotulo: "Não contatados" },
  { chave: "bons", rotulo: "Marcados como bons" },
  { chave: "sem_site", rotulo: "Sem site próprio" },
  { chave: "nota", rotulo: "Nota 4,5 ou mais" },
  { chave: "nao_reivindicado", rotulo: "Perfil não reivindicado" },
];

const GRADE_LEADS =
  "xl:grid xl:grid-cols-[minmax(0,2fr)_104px_110px_minmax(150px,1fr)_56px_minmax(0,1.6fr)_148px] xl:items-center xl:gap-4";

function Telefone({ telefone }: { telefone: string | null }) {
  const tipo = tipoDoTelefone(telefone);
  if (!telefone) return <Badge variant="estado-aviso">Sem telefone</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="whitespace-nowrap tabular-nums text-ink-2">{mascaraTelefoneBR(telefone)}</span>
      {tipo !== "celular" && (
        <Badge variant="estado-aviso" data-slot="lead-telefone-invalido">
          {tipo === "fixo" ? "Fixo" : "Inválido"}
        </Badge>
      )}
    </span>
  );
}

function LinhaDoLead({
  lead,
  marcar,
  abrirFicha,
  destacada,
  verNoMapa,
}: {
  lead: LeadDaTabela;
  marcar: (m: Lead["marcacao"]) => void;
  abrirFicha: () => void;
  /** O pino deste lead foi clicado no mapa. */
  destacada: boolean;
  /** Só no detalhe de uma busca, e só para lead com coordenadas. */
  verNoMapa: (() => void) | null;
}) {
  const { respondeu } = lead;
  const descartado = lead.marcacao === "descartado";
  return (
    <li
      data-slot="lead-linha"
      data-lead={lead.id}
      data-marcacao={lead.marcacao ?? "nenhuma"}
      data-destaque={destacada || undefined}
      ref={(el) => {
        if (el && destacada) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }}
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5 data-[destaque]:bg-[var(--active-bg)] ${GRADE_LEADS} ${descartado ? "opacity-55" : ""}`}
    >
      <div className="min-w-0 basis-full xl:basis-auto">
        <Button variant="nu" size="none" onClick={abrirFicha} className="block max-w-full truncate text-left text-corpo font-semibold text-ink hover:underline" data-slot="lead-abrir-ficha">
          {lead.nome}
        </Button>
        <p className="truncate text-legenda text-ink-3">
          {lead.bairro}, {lead.cidade}
        </p>
      </div>
      <p
        className="flex items-center gap-1 text-apoio text-ink-2"
        aria-label={lead.nota === null ? "Sem nota" : `Nota ${lead.nota}, ${lead.avaliacoes ?? 0} avaliações`}
      >
        {lead.nota === null ? (
          "Sem nota"
        ) : (
          <>
            <Star size={13} aria-hidden className="text-ink-3" />
            <span className="tabular-nums text-ink">{lead.nota.toFixed(1).replace(".", ",")}</span>
            <span className="tabular-nums text-ink-3">({numeroBR(lead.avaliacoes ?? 0)})</span>
          </>
        )}
      </p>
      <p className="whitespace-nowrap text-apoio">
        <TextoDoSite url={lead.site} />
      </p>
      <div className="text-apoio">
        <Telefone telefone={lead.telefone} />
      </div>
      <div>
        <SeloDaPontuacao sinais={sinaisDoLead(lead)} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {lead.parouEm !== null ? (
          <Badge variant="estado-aviso">Pediu para parar</Badge>
        ) : lead.campanhas.length === 0 ? (
          <span className="text-apoio text-ink-3">Nenhuma</span>
        ) : (
          <>
            {respondeu && <Badge variant="estado-bom">Respondeu</Badge>}
            {lead.campanhas.map((c) => (
              <Badge key={c.id} variant="contorno" data-slot="lead-campanha" className="max-w-full truncate">
                {c.nome || "Campanha sem nome"}
              </Badge>
            ))}
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1 xl:ml-0">
        {verNoMapa && (
          <Button variant="ghost" size="icon-chrome" aria-label={`Ver ${lead.nome} no mapa`} onClick={verNoMapa} data-slot="lead-ver-no-mapa">
            <MapPin aria-hidden />
          </Button>
        )}
        <Button
          variant="alternavel"
          size="chip"
          aria-pressed={lead.marcacao === "bom"}
          onClick={() => marcar(lead.marcacao === "bom" ? null : "bom")}
          data-slot="lead-marcar-bom"
        >
          <ThumbsUp aria-hidden />
          Bom
        </Button>
        <Button
          variant="danger-ghost"
          size="icon-chrome"
          aria-label={descartado ? `Desfazer descarte de ${lead.nome}` : `Descartar ${lead.nome}`}
          aria-pressed={descartado}
          onClick={() => marcar(descartado ? null : "descartado")}
          data-slot="lead-descartar"
        >
          <X aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function TabelaDeLeads({
  esquerda,
  fonte,
  versao,
  buscaId,
  destaque = null,
  focoDoMapa = null,
  verNoMapa = null,
}: {
  esquerda: React.ReactNode;
  fonte: FonteDeCampanhas;
  versao: number;
  /** O escopo: todos os leads (null), ou os de uma busca. */
  buscaId: string | null;
  /** O lead destacado (pino ou linha). */
  destaque?: string | null;
  /** Um pino clicado: a tabela vai até a página dele (a chave muda a cada clique). */
  focoDoMapa?: { id: string; vez: number } | null;
  verNoMapa?: ((id: string) => void) | null;
}) {
  const [ficha, setFicha] = useState<LeadDaTabela | null>(null);
  const [q, setQ] = useState("");
  const busca = useDebounce(q.trim(), 300);
  const [cidade, setCidade] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const { dados: cidades } = useLeitura(`cidades|${buscaId ?? ""}|${versao}`, () => fonte.cidades(buscaId));
  const ler = useCallback(
    (pagina: number) => fonte.leads({ buscaId, texto: busca, cidade, filtros, pagina }),
    [fonte, buscaId, busca, cidade, filtros],
  );
  const tabela = usePaginaDaFonte(`${buscaId ?? ""}|${busca}|${cidade ?? ""}|${filtros.join(",")}`, ler, versao);
  const { mudarItem, setPagina } = tabela;
  // Um pino clicado leva a tabela até a página do lead, no recorte que está na tela.
  useEffect(() => {
    if (!focoDoMapa) return;
    let vivo = true;
    fonte
      .paginaDoLead({ buscaId, texto: busca, cidade, filtros }, focoDoMapa.id)
      .then((p) => {
        if (vivo && p !== null) setPagina(p);
      })
      .catch((e) => console.error("leads, página do lead:", e));
    return () => {
      vivo = false;
    };
    // Só um clique novo (a `vez`) move a tabela; mudar o recorte depois não volta ao lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the jump answers the click, not later filter changes
  }, [focoDoMapa]);
  const alternar = (f: Filtro) => setFiltros((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));
  const marcar = useCallback(
    async (id: string, m: Lead["marcacao"]) => {
      // A linha muda na hora; se o servidor recusar, volta ao que era.
      let antes: Lead["marcacao"] = null;
      mudarItem((l) => {
        if (l.id !== id) return l;
        antes = l.marcacao;
        return { ...l, marcacao: m };
      });
      try {
        const salva = await fonte.marcar(id, m);
        mudarItem((l) => (l.id === id ? { ...l, marcacao: salva } : l));
      } catch (e) {
        console.error("lead, marcar:", e);
        mudarItem((l) => (l.id === id ? { ...l, marcacao: antes } : l));
      }
    },
    [fonte, mudarItem],
  );

  const grupos = [
    {
      titulo: "Mostrar só",
      multiplo: true,
      opcoes: FILTROS.map((f) => ({ chave: f.chave, rotulo: f.rotulo, marcado: filtros.includes(f.chave), aoEscolher: () => alternar(f.chave) })),
    },
    ...(cidades && cidades.length > 1
      ? [
          {
            titulo: "Cidade",
            opcoes: [
              { chave: "cidade-todas", rotulo: "Todas as cidades", marcado: cidade === null, aoEscolher: () => setCidade(null) },
              ...cidades.map((c) => ({ chave: `cidade-${c}`, rotulo: c, marcado: cidade === c, aoEscolher: () => setCidade(c) })),
            ],
          },
        ]
      : []),
  ];

  return (
    <>
      <BarraDaTabela
        busca={q}
        aoBuscar={setQ}
        placeholder="Nome ou telefone"
        rotuloDaBusca="Buscar lead pelo nome ou telefone"
        filtro={
          <BotaoDeFiltro
            slot="leads-filtro"
            largura="w-60"
            ativos={filtros.length + (cidade ? 1 : 0)}
            rotulo={filtros.length + (cidade ? 1 : 0) > 0 ? `Filtrar leads: ${filtros.length + (cidade ? 1 : 0)} ligados` : "Filtrar leads"}
            grupos={grupos}
          />
        }
      >
        {esquerda}
      </BarraDaTabela>
      <CabecalhoDaTabela grade={GRADE_LEADS} colunas={["Empresa", "Google", "Site", "Telefone", "Pontos", "Campanhas", ""]} />
      <CorpoDaTabela
        lido={tabela.lido}
        erro={tabela.erro}
        recarregar={tabela.recarregar}
        quantas={tabela.itens.length}
        vazio={busca ? `Nenhum lead com "${q.trim()}".` : "Nenhum lead com esses filtros."}
      >
        <ul className="divide-y divide-line-soft" data-slot="leads-tabela">
          {tabela.itens.map((l) => (
            <LinhaDoLead
              key={l.id}
              lead={l}
              marcar={(m) => marcar(l.id, m)}
              abrirFicha={() => setFicha(l)}
              destacada={destaque === l.id}
              verNoMapa={verNoMapa && l.detalhes?.lat != null ? () => verNoMapa(l.id) : null}
            />
          ))}
        </ul>
      </CorpoDaTabela>
      <RodapeDaTabela pagina={tabela.pagina} total={tabela.total} aoMudar={tabela.setPagina} slot="leads" lido={tabela.lido} />
      <FichaDoLead lead={ficha} aoFechar={() => setFicha(null)} />
    </>
  );
}

// ── A home da aba e o detalhe da busca ─────────────────────────────────

function HomeDosLeads({
  abas,
  fonte,
  versao,
  totais,
  inicial,
  agora,
  rascunho,
  abrir,
  novaBusca,
  voltarAoRascunho,
  aoTerminarBusca,
}: {
  abas: React.ReactNode;
  fonte: FonteDeCampanhas;
  versao: number;
  totais: Totais | null;
  inicial: InicialDaCentral | null;
  agora: number;
  rascunho: CampanhaEditavel | null;
  abrir: (id: string) => void;
  novaBusca: () => void;
  voltarAoRascunho: () => void;
  aoTerminarBusca: () => void;
}) {
  const [vista, setVista] = useState<"buscas" | "leads">("buscas");
  const { dados: painel } = useLeitura(`painel-base|${versao}`, () => fonte.painelDaBase(null), inicial?.painel ?? null);
  const nBuscas = somaDe(totais?.buscas);
  const seletorDaVista = (
    <Tabs value={vista} onValueChange={(v) => setVista(v === "leads" ? "leads" : "buscas")}>
      <TabsList variant="painel" aria-label="Ver por" className="bg-canvas">
        <TabsTrigger value="buscas" variant="painel" data-slot="leads-ver-buscas">
          Buscas
          {totais && <span className="ml-1.5 tabular-nums text-ink-3">{numeroBR(nBuscas)}</span>}
        </TabsTrigger>
        <TabsTrigger value="leads" variant="painel" data-slot="leads-ver-todos">
          Todos os leads
          {totais && <span className="ml-1.5 tabular-nums text-ink-3">{numeroBR(totais.leads)}</span>}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {abas}
        <Button className="ml-auto" onClick={novaBusca} data-slot="leads-nova-busca">
          <Plus aria-hidden />
          Nova busca
        </Button>
      </div>

      {rascunho && (
        <Aviso tom="neutro" forma="faixa" data-bloco="leads-rascunho" className="flex-wrap justify-between">
          <span>
            A campanha <strong className="font-semibold">{rascunho.nome || "sem nome"}</strong> está esperando os contatos.
          </span>
          <Button variant="link" size="link" onClick={voltarAoRascunho}>
            Voltar para a campanha
          </Button>
        </Aviso>
      )}

      {totais && nBuscas === 0 ? (
        <Card variant="conteudo" className="py-4">
          <EstadoVazio
            icone={Search}
            titulo="Nenhuma busca ainda"
            texto="Comece buscando um segmento e uma cidade, por exemplo clínica de estética em Mutum."
          >
            <Button className="mt-2" onClick={novaBusca}>
              <Plus aria-hidden />
              Nova busca
            </Button>
          </EstadoVazio>
        </Card>
      ) : (
        <>
          {painel && <PainelDaBase r={painel.resumo} novosPorSemana={painel.novosPorSemana} enviosPorSemana={painel.enviosPorSemana} />}
          <Card variant="conteudo" className="overflow-hidden" data-bloco="leads-tabela">
            {vista === "buscas" ? (
              <TabelaDeBuscas
                esquerda={seletorDaVista}
                fonte={fonte}
                versao={versao}
                contagens={totais?.buscas ?? null}
                inicial={inicial?.buscas ?? null}
                agora={agora}
                abrir={abrir}
                aoTerminarBusca={aoTerminarBusca}
              />
            ) : (
              <TabelaDeLeads esquerda={seletorDaVista} fonte={fonte} versao={versao} buscaId={null} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DetalheDaBusca({
  abas,
  fonte,
  versao,
  busca,
  voltar,
  criarCampanha,
}: {
  abas: React.ReactNode;
  fonte: FonteDeCampanhas;
  versao: number;
  busca: Busca;
  voltar: () => void;
  criarCampanha: () => void;
}) {
  const { dados: painel } = useLeitura(`painel-busca|${busca.id}|${versao}`, () => fonte.painelDaBase(busca.id));
  const { dados: pontos } = useLeitura(`pontos|${busca.id}|${versao}`, () => fonte.pontosDaBusca(busca.id));
  // O destaque e de onde ele veio: do mapa (a tabela vai até a linha) ou da tabela (o mapa vai até o pino).
  const [destaque, setDestaque] = useState<{ id: string; origem: "mapa" | "tabela"; vez: number } | null>(null);
  const destacar = useCallback((id: string, origem: "mapa" | "tabela") => setDestaque((d) => ({ id, origem, vez: (d?.vez ?? 0) + 1 })), []);
  return (
    <div className="flex flex-col gap-4" data-slot="busca-detalhe">
      <div className="flex flex-wrap items-center gap-2">
        {abas}
        <Button className="ml-auto" onClick={criarCampanha} data-slot="busca-criar-campanha">
          Criar campanha com esta busca
        </Button>
      </div>
      <TopoDeDetalhe
        voltar={voltar}
        rotuloDoVoltar="Leads"
        titulo={
          <>
            <span className="first-letter:uppercase">{busca.termo}</span> em {busca.cidade}
          </>
        }
        selo={<SeloDaBusca situacao={busca.situacao} />}
        apoio={[`Busca de ${diaMesHoraSP(busca.criadaEm)}`, textoDoLocal({ ...busca.opcoes, cidade: busca.cidade }), ...resumoDasOpcoes(busca.opcoes)].join(" · ")}
      />

      {painel && <PainelDaBusca r={painel.resumo} respostasPorDia={painel.respostasPorDia} />}

      {pontos && pontos.length > 0 && (
        <Card variant="conteudo" className="p-5" data-bloco="busca-mapa">
          <CabecalhoDoGrafico titulo="No mapa" />
          <MapaDaBusca
            pontos={pontos}
            destaque={destaque?.id ?? null}
            centralizar={destaque?.origem === "tabela"}
            aoEscolher={(id) => destacar(id, "mapa")}
          />
        </Card>
      )}

      <Card variant="conteudo" className="overflow-hidden" data-bloco="busca-tabela">
        <TabelaDeLeads
          esquerda={<h3 className="text-cartao text-ink">Leads</h3>}
          fonte={fonte}
          versao={versao}
          buscaId={busca.id}
          destaque={destaque?.id ?? null}
          focoDoMapa={destaque?.origem === "mapa" ? destaque : null}
          verNoMapa={pontos && pontos.length > 0 ? (id) => destacar(id, "tabela") : null}
        />
      </Card>
    </div>
  );
}

// ── A aba ───────────────────────────────────────────────────────────────

function AbaLeads({
  abas,
  fonte,
  versao,
  totais,
  inicial,
  agora,
  buscaAberta,
  rascunho,
  abrirBusca,
  aoMudar,
  criarCampanhaDaBusca,
  voltarAoRascunho,
}: {
  /** O seletor Leads | Campanhas, no canto esquerdo da linha de cima. */
  abas: React.ReactNode;
  fonte: FonteDeCampanhas;
  /** Muda depois de cada escrita: as leituras desta aba voltam ao servidor. */
  versao: number;
  totais: Totais | null;
  /** O que o servidor já leu (painel e primeira página de buscas). */
  inicial: InicialDaCentral | null;
  agora: number;
  buscaAberta: string | null;
  rascunho: CampanhaEditavel | null;
  abrirBusca: (id: string | null) => void;
  /** Depois de uma escrita que muda números de outras telas (nova busca, busca que terminou). */
  aoMudar: () => void;
  criarCampanhaDaBusca: (busca: Busca) => void;
  voltarAoRascunho: () => void;
}) {
  const [dialogo, setDialogo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const aberta = useLeitura(`busca|${buscaAberta ?? ""}`, () => (buscaAberta ? fonte.busca(buscaAberta) : Promise.resolve(null)));
  const busca = buscaAberta && aberta.dados?.id === buscaAberta ? aberta.dados : null;
  const buscar = async (o: OpcoesDaBusca) => {
    setDialogo(false);
    setFalha(null);
    try {
      const r = await fonte.novaBusca(o);
      if (!r.ok) setFalha(r.erro);
    } catch (e) {
      console.error("nova busca:", e);
      setFalha("Não deu para começar a busca agora. Tente de novo em instantes.");
    }
    aoMudar();
  };
  return (
    <>
      {falha && (
        <Aviso tom="danger" forma="faixa" className="mb-4" data-bloco="leads-falha">
          {falha}
        </Aviso>
      )}
      {busca ? (
        <DetalheDaBusca
          abas={abas}
          fonte={fonte}
          versao={versao}
          busca={busca}
          voltar={() => abrirBusca(null)}
          criarCampanha={() => criarCampanhaDaBusca(busca)}
        />
      ) : (
        <HomeDosLeads
          abas={abas}
          fonte={fonte}
          versao={versao}
          totais={totais}
          inicial={inicial}
          agora={agora}
          rascunho={rascunho}
          abrir={abrirBusca}
          novaBusca={() => setDialogo(true)}
          voltarAoRascunho={voltarAoRascunho}
          aoTerminarBusca={aoMudar}
        />
      )}
      <NovaBusca aberto={dialogo} aoMudar={setDialogo} aoBuscar={buscar} />
    </>
  );
}

export default memo(AbaLeads);
