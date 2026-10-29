"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, MapPin, Plus, Search, Star, ThumbsUp, X } from "lucide-react";
import BotaoDeFiltro from "@/components/BotaoDeFiltro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/ui/aviso";
import { Medidor } from "@/components/ui/medidor";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizar } from "@/lib/clientes";
import { mascaraTelefoneBR, numeroBR, pct, plural } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import {
  ROTULO_DA_BUSCA,
  ROTULO_DO_SITE,
  resumoDaBase,
  siteDoLead,
  telefoneDoLead,
  tipoDoTelefone,
  type ResumoDaBase,
  type SituacaoDaBusca,
} from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import { FaixaDeNumeros } from "./faixa";
import { CabecalhoDoGrafico, GraficoDoFunil, GraficoPorCidade, Rosca, degrausDoFunil } from "./graficos";
import { SeloDaBusca, SeloDaPontuacao, TextoDoSite, TopoDeDetalhe, haQuanto } from "./pecas";
import { BarraDaTabela, CabecalhoDaTabela, RodapeDaTabela, usePaginaDaMemoria } from "./tabela";
import type { Busca, Campanha, Lead } from "./tipos";

// LEADS, a base: o painel no topo (quantos, onde, quantos já contatados e quem
// respondeu) e embaixo a tabela, por busca ou com todos os leads, 10 por página,
// com busca digitando e o botão de filtro. A busca abre o detalhe com os leads dela.

/** O resumo pela regra pura; quem respondeu sai das campanhas. */
function resumir(leads: Lead[], responderam: Set<string>): ResumoDaBase {
  return resumoDaBase(leads.map((l) => ({ ...l, campanhas: l.campanhaIds.length, respondeu: responderam.has(l.id) })));
}

// ── O painel da base ────────────────────────────────────────────────────

function PainelDaBase({ r }: { r: ResumoDaBase }) {
  const cidades = r.porCidade.slice(0, 8).map((c) => ({
    chave: c.cidade,
    rotulo: c.cidade,
    contatados: c.contatados,
    aContatar: c.aContatar,
    fora: c.total - c.contatados - c.aContatar,
    total: c.total,
  }));
  const funil = degrausDoFunil([
    { chave: "base", rotulo: "Na base", n: r.total },
    { chave: "celular", rotulo: "Com celular", n: r.comCelular },
    { chave: "contatados", rotulo: "Contatados", n: r.contatados },
    { chave: "responderam", rotulo: "Responderam", n: r.responderam },
  ]);
  return (
    <div className="flex flex-col gap-4" data-slot="leads-painel">
      <FaixaDeNumeros
        celulas={[
          {
            chave: "base",
            rotulo: "Na base",
            valor: numeroBR(r.total),
            frase: `${numeroBR(r.porCidade.length)} ${plural(r.porCidade.length, "cidade", "cidades")}`,
          },
          {
            chave: "celular",
            rotulo: "Com celular",
            valor: numeroBR(r.comCelular),
            complemento: `${pct(r.comCelular, r.total)}%`,
            frase: "da base",
          },
          {
            chave: "contatados",
            rotulo: "Contatados",
            valor: numeroBR(r.contatados),
            complemento: `${pct(r.contatados, r.comCelular)}%`,
            frase: `${numeroBR(r.aContatar)} ainda a contatar`,
          },
          {
            chave: "responderam",
            rotulo: "Responderam",
            valor: numeroBR(r.responderam),
            complemento: r.contatados > 0 ? `${pct(r.responderam, r.contatados)}%` : undefined,
            frase: "dos contatados",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card variant="conteudo" className="p-6 xl:col-span-2" data-bloco="leads-cidades">
          <CabecalhoDoGrafico titulo="Leads por cidade" />
          <GraficoPorCidade barras={cidades} />
        </Card>
        <Card variant="conteudo" className="p-6" data-bloco="leads-funil">
          <CabecalhoDoGrafico titulo="Funil da base" />
          <GraficoDoFunil degraus={funil} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="conteudo" className="p-6" data-bloco="leads-site">
          <CabecalhoDoGrafico titulo="Presença online" />
          <Rosca
            nome="Leads por presença online"
            unidade={["lead", "leads"]}
            fatias={[
              { chave: "nao", rotulo: ROTULO_DO_SITE.nao, n: r.porSite.nao, fill: "var(--chart-rampa-4)" },
              { chave: "so_rede_social", rotulo: ROTULO_DO_SITE.so_rede_social, n: r.porSite.so_rede_social, fill: "var(--chart-rampa-2)" },
              { chave: "sim", rotulo: ROTULO_DO_SITE.sim, n: r.porSite.sim, fill: "var(--chart-barra-neutra)" },
            ]}
          />
        </Card>
        <Card variant="conteudo" className="p-6" data-bloco="leads-pontuacao">
          <CabecalhoDoGrafico titulo="Pontuação" />
          <Rosca
            nome="Leads por pontuação"
            unidade={["lead", "leads"]}
            fatias={[
              { chave: "alta", rotulo: "Alta (70 ou mais)", n: r.porFaixa.alta, fill: "var(--chart-rampa-4)" },
              { chave: "media", rotulo: "Média (40 a 69)", n: r.porFaixa.media, fill: "var(--chart-rampa-2)" },
              { chave: "baixa", rotulo: "Baixa (abaixo de 40)", n: r.porFaixa.baixa, fill: "var(--chart-barra-neutra)" },
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

interface ContagemDaBusca {
  total: number;
  comCelular: number;
  bons: number;
  contatados: number;
  responderam: number;
}

function contar(leads: Lead[], responderam: Set<string>): ContagemDaBusca {
  return {
    total: leads.length,
    comCelular: leads.filter((l) => telefoneDoLead(l.telefone) !== null).length,
    bons: leads.filter((l) => l.marcacao === "bom").length,
    contatados: leads.filter((l) => l.campanhaIds.length > 0).length,
    responderam: leads.filter((l) => responderam.has(l.id)).length,
  };
}

function LinhaDaBusca({
  busca,
  contagem,
  agora,
  abrir,
}: {
  busca: Busca;
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
  buscas,
  leads,
  responderam,
  agora,
  abrir,
}: {
  esquerda: React.ReactNode;
  buscas: Busca[];
  leads: Lead[];
  responderam: Set<string>;
  agora: number;
  abrir: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const busca = useDebounce(normalizar(q.trim()), 300);
  const [situacao, setSituacao] = useState<SituacaoDaBusca | null>(null);
  const params = useMemo(() => ({ busca, situacao }), [busca, situacao]);
  const filtrar = useCallback(
    (p: { busca: string; situacao: SituacaoDaBusca | null }) =>
      buscas.filter(
        (b) => (p.situacao === null || b.situacao === p.situacao) && (!p.busca || normalizar(`${b.termo} ${b.cidade}`).includes(p.busca)),
      ),
    [buscas],
  );
  const { itens, pagina, setPagina, total } = usePaginaDaMemoria({ params, filtrar });
  const porBusca = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of leads) m.set(l.buscaId, [...(m.get(l.buscaId) ?? []), l]);
    return m;
  }, [leads]);

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
                  { chave: "todas", rotulo: "Todas", contagem: buscas.length, marcado: situacao === null, aoEscolher: () => setSituacao(null) },
                  ...SITUACOES_DA_BUSCA.map((s) => ({
                    chave: s,
                    rotulo: ROTULO_DA_BUSCA[s],
                    contagem: buscas.filter((b) => b.situacao === s).length,
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
      {itens.length === 0 ? (
        <EstadoVazio tamanho="compacto" texto={busca ? `Nenhuma busca com "${q.trim()}".` : "Nenhuma busca nesta situação."} />
      ) : (
        <ul className="divide-y divide-line-soft" data-slot="leads-buscas">
          {itens.map((b) => (
            <LinhaDaBusca key={b.id} busca={b} contagem={contar(porBusca.get(b.id) ?? [], responderam)} agora={agora} abrir={() => abrir(b.id)} />
          ))}
        </ul>
      )}
      <RodapeDaTabela pagina={pagina} total={total} aoMudar={setPagina} slot="buscas" />
    </>
  );
}

// ── A tabela de leads (todos, ou os de uma busca) ──────────────────────

type Filtro = "nao_contatados" | "bons" | "sem_site" | "nota";

const FILTROS: { chave: Filtro; rotulo: string }[] = [
  { chave: "nao_contatados", rotulo: "Não contatados" },
  { chave: "bons", rotulo: "Marcados como bons" },
  { chave: "sem_site", rotulo: "Sem site próprio" },
  { chave: "nota", rotulo: "Nota 4,5 ou mais" },
];

const GRADE_LEADS =
  "xl:grid xl:grid-cols-[minmax(0,2fr)_104px_110px_minmax(150px,1fr)_56px_minmax(0,1.6fr)_112px] xl:items-center xl:gap-4";

interface ParamsDosLeads {
  busca: string;
  cidade: string | null;
  filtros: Filtro[];
}

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
  campanhas,
  respondeu,
  marcar,
}: {
  lead: Lead;
  campanhas: Map<string, Campanha>;
  respondeu: boolean;
  marcar: (m: Lead["marcacao"]) => void;
}) {
  const descartado = lead.marcacao === "descartado";
  return (
    <li
      data-slot="lead-linha"
      data-lead={lead.id}
      data-marcacao={lead.marcacao ?? "nenhuma"}
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5 ${GRADE_LEADS} ${descartado ? "opacity-55" : ""}`}
    >
      <div className="min-w-0 basis-full xl:basis-auto">
        <p className="truncate text-corpo font-semibold text-ink">{lead.nome}</p>
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
        <SeloDaPontuacao sinais={lead} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {lead.parouEm !== null ? (
          <Badge variant="estado-aviso">Pediu para parar</Badge>
        ) : lead.campanhaIds.length === 0 ? (
          <span className="text-apoio text-ink-3">Nenhuma</span>
        ) : (
          <>
            {respondeu && <Badge variant="estado-bom">Respondeu</Badge>}
            {lead.campanhaIds.map((id) => (
              <Badge key={id} variant="contorno" data-slot="lead-campanha" className="max-w-full truncate">
                {campanhas.get(id)?.nome ?? "Campanha"}
              </Badge>
            ))}
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1 xl:ml-0">
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
  leads,
  campanhas,
  responderam,
  marcar,
}: {
  esquerda: React.ReactNode;
  /** O escopo: todos os leads, ou os de uma busca. */
  leads: Lead[];
  campanhas: Campanha[];
  responderam: Set<string>;
  marcar: (id: string, m: Lead["marcacao"]) => void;
}) {
  const [q, setQ] = useState("");
  const busca = useDebounce(normalizar(q.trim()), 300);
  const [cidade, setCidade] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const cidades = useMemo(() => [...new Set(leads.map((l) => l.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR")), [leads]);
  const params = useMemo<ParamsDosLeads>(() => ({ busca, cidade, filtros }), [busca, cidade, filtros]);
  const filtrar = useCallback(
    (p: ParamsDosLeads) => {
      const digitos = p.busca.replace(/\D/g, "");
      return leads.filter(
        (l) =>
          (!p.busca || normalizar(l.nome).includes(p.busca) || (digitos.length >= 3 && (l.telefone ?? "").includes(digitos))) &&
          (p.cidade === null || l.cidade === p.cidade) &&
          (!p.filtros.includes("nao_contatados") || l.campanhaIds.length === 0) &&
          (!p.filtros.includes("bons") || l.marcacao === "bom") &&
          (!p.filtros.includes("sem_site") || siteDoLead(l.site) !== "sim") &&
          (!p.filtros.includes("nota") || (l.nota ?? 0) >= 4.5),
      );
    },
    [leads],
  );
  const { itens, pagina, setPagina, total } = usePaginaDaMemoria({ params, filtrar });
  const porCampanha = useMemo(() => new Map(campanhas.map((c) => [c.id, c])), [campanhas]);
  const alternar = (f: Filtro) => setFiltros((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));

  const grupos = [
    {
      titulo: "Mostrar só",
      multiplo: true,
      opcoes: FILTROS.map((f) => ({ chave: f.chave, rotulo: f.rotulo, marcado: filtros.includes(f.chave), aoEscolher: () => alternar(f.chave) })),
    },
    ...(cidades.length > 1
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
      {itens.length === 0 ? (
        <EstadoVazio tamanho="compacto" texto="Nenhum lead com esses filtros." />
      ) : (
        <ul className="divide-y divide-line-soft" data-slot="leads-tabela">
          {itens.map((l) => (
            <LinhaDoLead
              key={l.id}
              lead={l}
              campanhas={porCampanha}
              respondeu={responderam.has(l.id)}
              marcar={(m) => marcar(l.id, m)}
            />
          ))}
        </ul>
      )}
      <RodapeDaTabela pagina={pagina} total={total} aoMudar={setPagina} slot="leads" />
    </>
  );
}

// ── A home da aba e o detalhe da busca ─────────────────────────────────

function HomeDosLeads({
  abas,
  buscas,
  leads,
  campanhas,
  responderam,
  agora,
  rascunho,
  abrir,
  novaBusca,
  marcar,
  voltarAoRascunho,
}: {
  abas: React.ReactNode;
  buscas: Busca[];
  leads: Lead[];
  campanhas: Campanha[];
  responderam: Set<string>;
  agora: number;
  rascunho: Campanha | null;
  abrir: (id: string) => void;
  novaBusca: () => void;
  marcar: (id: string, m: Lead["marcacao"]) => void;
  voltarAoRascunho: () => void;
}) {
  const [vista, setVista] = useState<"buscas" | "leads">("buscas");
  const r = useMemo(() => resumir(leads, responderam), [leads, responderam]);
  const seletorDaVista = (
    <Tabs value={vista} onValueChange={(v) => setVista(v === "leads" ? "leads" : "buscas")}>
      <TabsList variant="painel" aria-label="Ver por" className="bg-canvas">
        <TabsTrigger value="buscas" variant="painel" data-slot="leads-ver-buscas">
          Buscas
          <span className="ml-1.5 tabular-nums text-ink-3">{buscas.length}</span>
        </TabsTrigger>
        <TabsTrigger value="leads" variant="painel" data-slot="leads-ver-todos">
          Todos os leads
          <span className="ml-1.5 tabular-nums text-ink-3">{numeroBR(leads.length)}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
  return (
    <div className="flex flex-col gap-6">
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

      {buscas.length === 0 ? (
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
          <PainelDaBase r={r} />
          <Card variant="conteudo" className="overflow-hidden" data-bloco="leads-tabela">
            {vista === "buscas" ? (
              <TabelaDeBuscas
                esquerda={seletorDaVista}
                buscas={buscas}
                leads={leads}
                responderam={responderam}
                agora={agora}
                abrir={abrir}
              />
            ) : (
              <TabelaDeLeads esquerda={seletorDaVista} leads={leads} campanhas={campanhas} responderam={responderam} marcar={marcar} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DetalheDaBusca({
  abas,
  busca,
  leads,
  campanhas,
  responderam,
  voltar,
  marcar,
  criarCampanha,
}: {
  abas: React.ReactNode;
  busca: Busca;
  leads: Lead[];
  campanhas: Campanha[];
  responderam: Set<string>;
  voltar: () => void;
  marcar: (id: string, m: Lead["marcacao"]) => void;
  criarCampanha: () => void;
}) {
  const daBusca = useMemo(() => leads.filter((l) => l.buscaId === busca.id), [leads, busca.id]);
  const c = contar(daBusca, responderam);
  return (
    <div className="flex flex-col gap-6" data-slot="busca-detalhe">
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
        apoio={`Busca de ${diaMesHoraSP(busca.criadaEm)}`}
      />

      <FaixaDeNumeros
        celulas={[
          { chave: "achadas", rotulo: "Achadas", valor: numeroBR(c.total), frase: `${numeroBR(c.bons)} marcadas como boas` },
          { chave: "celular", rotulo: "Com celular", valor: numeroBR(c.comCelular), complemento: `${pct(c.comCelular, c.total)}%`, frase: "das achadas" },
          {
            chave: "contatados",
            rotulo: "Contatados",
            valor: numeroBR(c.contatados),
            complemento: `${pct(c.contatados, Math.max(1, c.comCelular))}%`,
            frase: "dos com celular",
          },
          {
            chave: "responderam",
            rotulo: "Responderam",
            valor: numeroBR(c.responderam),
            complemento: c.contatados > 0 ? `${pct(c.responderam, c.contatados)}%` : undefined,
            frase: "dos contatados",
          },
        ]}
      />

      <Card variant="conteudo" className="overflow-hidden" data-bloco="busca-tabela">
        <TabelaDeLeads
          esquerda={<h3 className="text-cartao text-ink">Leads</h3>}
          leads={daBusca}
          campanhas={campanhas}
          responderam={responderam}
          marcar={marcar}
        />
      </Card>
    </div>
  );
}

// ── Nova busca ──────────────────────────────────────────────────────────

function DialogoDeNovaBusca({
  aberto,
  aoMudar,
  aoBuscar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoBuscar: (termo: string, cidade: string) => void;
}) {
  const [termo, setTermo] = useState("");
  const [cidade, setCidade] = useState("");
  const pronto = termo.trim().length >= 3 && cidade.trim().length >= 2;
  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent tamanho="gestao" data-slot="nova-busca">
        <DialogTitle>Nova busca</DialogTitle>
        <DialogDescription>Procura empresas no Google Maps. Leva alguns minutos e roda em segundo plano.</DialogDescription>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pronto) return;
            aoBuscar(termo.trim(), cidade.trim());
            setTermo("");
            setCidade("");
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-apoio font-semibold text-ink">Segmento</span>
            <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="clínica de estética" autoFocus />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-apoio font-semibold text-ink">Cidade</span>
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Mutum" />
          </label>
          <p className="flex items-start gap-2 text-legenda text-ink-3">
            <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
            Cada busca gasta crédito da fonte de leads.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => aoMudar(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!pronto}>
              Buscar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── A aba ───────────────────────────────────────────────────────────────

function AbaLeads({
  abas,
  buscas,
  leads,
  campanhas,
  agora,
  buscaAberta,
  rascunho,
  abrirBusca,
  aoBuscar,
  marcar,
  criarCampanhaDaBusca,
  voltarAoRascunho,
}: {
  /** O seletor Leads | Campanhas, no canto esquerdo da linha de cima. */
  abas: React.ReactNode;
  buscas: Busca[];
  leads: Lead[];
  campanhas: Campanha[];
  agora: number;
  buscaAberta: string | null;
  rascunho: Campanha | null;
  abrirBusca: (id: string | null) => void;
  aoBuscar: (termo: string, cidade: string) => void;
  marcar: (id: string, m: Lead["marcacao"]) => void;
  criarCampanhaDaBusca: (buscaId: string) => void;
  voltarAoRascunho: () => void;
}) {
  const [dialogo, setDialogo] = useState(false);
  const busca = buscas.find((b) => b.id === buscaAberta) ?? null;
  const responderam = useMemo(
    () => new Set(campanhas.flatMap((c) => c.envios.filter((e) => e.respondeuEm !== null).map((e) => e.leadId))),
    [campanhas],
  );
  return (
    <>
      {busca ? (
        <DetalheDaBusca
          abas={abas}
          busca={busca}
          leads={leads}
          campanhas={campanhas}
          responderam={responderam}
          voltar={() => abrirBusca(null)}
          marcar={marcar}
          criarCampanha={() => criarCampanhaDaBusca(busca.id)}
        />
      ) : (
        <HomeDosLeads
          abas={abas}
          buscas={buscas}
          leads={leads}
          campanhas={campanhas}
          responderam={responderam}
          agora={agora}
          rascunho={rascunho}
          abrir={abrirBusca}
          novaBusca={() => setDialogo(true)}
          marcar={marcar}
          voltarAoRascunho={voltarAoRascunho}
        />
      )}
      <DialogoDeNovaBusca
        aberto={dialogo}
        aoMudar={setDialogo}
        aoBuscar={(t, c) => {
          setDialogo(false);
          aoBuscar(t, c);
        }}
      />
    </>
  );
}

export default memo(AbaLeads);
