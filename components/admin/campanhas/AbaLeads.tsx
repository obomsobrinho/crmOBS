"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, MapPin, Plus, Search, Star, ThumbsUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CampoBusca } from "@/components/ui/campo-busca";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/ui/aviso";
import { Medidor } from "@/components/ui/medidor";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Indicador } from "@/components/admin/pecas";
import { normalizar } from "@/lib/clientes";
import { mascaraTelefoneBR, numeroBR, pct, plural } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import {
  ROTULO_DA_BUSCA,
  ROTULO_DO_SITE,
  telefoneDoLead,
  resumoDaBase,
  siteDoLead,
  tipoDoTelefone,
  type ResumoDaBase,
  type SituacaoDaBusca,
} from "@/lib/prospeccao";
import { useDebounce } from "@/lib/use-debounce";
import { CabecalhoDoGrafico, GraficoDoFunil, GraficoPorCidade, Rosca, degrausDoFunil } from "./graficos";
import { SeloDaBusca, SeloDaPontuacao, TextoDoSite, TopoDeDetalhe, haQuanto } from "./pecas";
import { CabecalhoDaTabela, RodapeDaTabela, usePaginadaDaMemoria } from "./tabela";
import type { Busca, Campanha, Lead } from "./tipos";

// LEADS, a base: o painel no topo (quantos, onde, quantos já contatados e quem
// respondeu) e embaixo a tabela, por busca ou com todos os leads, 10 por página,
// com busca digitando e filtros. A busca abre o detalhe com os leads dela.

/** O resumo pela regra pura; quem respondeu sai das campanhas. */
function resumir(leads: Lead[], responderam: Set<string>): ResumoDaBase {
  return resumoDaBase(leads.map((l) => ({ ...l, campanhas: l.campanhaIds.length, respondeu: responderam.has(l.id) })));
}

// ── O painel da base ────────────────────────────────────────────────────

function PainelDaBase({ r, legenda }: { r: ResumoDaBase; legenda: string }) {
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Indicador
          variant="elevado"
          rotulo="Na base"
          valor={numeroBR(r.total)}
          frase={`${numeroBR(r.porCidade.length)} ${plural(r.porCidade.length, "cidade", "cidades")}`}
          legenda={legenda}
          data-indicador="base"
        />
        <Indicador
          variant="elevado"
          rotulo="Com celular"
          valor={numeroBR(r.comCelular)}
          frase={`${pct(r.comCelular, r.total)}% podem receber WhatsApp`}
          legenda={legenda}
          data-indicador="celular"
        />
        <Indicador
          variant="elevado"
          rotulo="A contatar"
          valor={numeroBR(r.aContatar)}
          frase={`Cerca de ${numeroBR(Math.ceil(r.aContatar / 10))} ${plural(Math.ceil(r.aContatar / 10), "dia", "dias")} a 10 por dia`}
          legenda={legenda}
          data-indicador="a-contatar"
        />
        <Indicador
          variant="elevado"
          rotulo="Marcados como bons"
          valor={numeroBR(r.bons)}
          frase="Você escolheu na tabela"
          legenda={legenda}
          data-indicador="bons"
        />
        <Indicador
          variant="elevado"
          rotulo="Responderam"
          valor={numeroBR(r.responderam)}
          frase={r.contatados > 0 ? `${pct(r.responderam, r.contatados)}% dos contatados` : "Ninguém contatado ainda"}
          legenda={legenda}
          className="col-span-2 md:col-span-1"
          data-indicador="responderam"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card variant="conteudo" className="p-6 xl:col-span-2" data-bloco="leads-cidades">
          <CabecalhoDoGrafico
            titulo="Leads por cidade"
            frase={
              r.porCidade.length > cidades.length
                ? `As ${cidades.length} cidades com mais leads, de ${r.porCidade.length}.`
                : "Quantos já receberam a mensagem, quantos ainda podem receber e quantos ficam fora (sem celular, descartados ou que pediram para parar)."
            }
          />
          <GraficoPorCidade barras={cidades} />
        </Card>
        <Card variant="conteudo" className="p-6" data-bloco="leads-funil">
          <CabecalhoDoGrafico titulo="Funil da base" frase="De quem a busca achou até quem respondeu a uma campanha." />
          <GraficoDoFunil degraus={funil} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="conteudo" className="p-6" data-bloco="leads-site">
          <CabecalhoDoGrafico
            titulo="Presença online"
            frase="Quem não tem site próprio costuma ser quem mais precisa de um atendimento organizado."
          />
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
          <CabecalhoDoGrafico
            titulo="Pontuação"
            frase="Celular válido, segmento, site e avaliações no Google. Os pesos ainda são provisórios."
          />
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

type RecorteDaBusca = "todas" | SituacaoDaBusca;

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
                <span className="font-semibold text-ink">{numeroBR(contagem.contatados)}</span> de{" "}
                {numeroBR(contagem.comCelular)} contatados
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
                Procurando empresas. Pode sair desta tela, a busca continua.
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

function TabelaDeBuscas({
  buscas,
  leads,
  responderam,
  agora,
  abrir,
}: {
  buscas: Busca[];
  leads: Lead[];
  responderam: Set<string>;
  agora: number;
  abrir: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const busca = useDebounce(normalizar(q.trim()), 300);
  const [recorte, setRecorte] = useState<RecorteDaBusca>("todas");
  const params = useMemo(() => ({ busca, recorte }), [busca, recorte]);
  const filtrar = useCallback(
    (p: { busca: string; recorte: RecorteDaBusca }) =>
      buscas.filter(
        (b) =>
          (p.recorte === "todas" || b.situacao === p.recorte) &&
          (!p.busca || normalizar(`${b.termo} ${b.cidade}`).includes(p.busca)),
      ),
    [buscas],
  );
  const { itens, temMais, carregando, fimRef, total } = usePaginadaDaMemoria({
    params,
    filtrar,
    chave: (b: Busca) => b.id,
    versao: buscas,
  });
  const porId = useMemo(() => new Map(buscas.map((b) => [b.id, b])), [buscas]);
  const porBusca = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of leads) m.set(l.buscaId, [...(m.get(l.buscaId) ?? []), l]);
    return m;
  }, [leads]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Situação da busca">
          {(["todas", "pronta", "buscando", "falhou"] as RecorteDaBusca[]).map((r) => (
            <Button
              key={r}
              variant="chip"
              size="chip"
              aria-pressed={recorte === r}
              onClick={() => setRecorte(r)}
              data-slot="buscas-recorte"
              data-recorte={r}
            >
              {r === "todas" ? "Todas" : ROTULO_DA_BUSCA[r]}
              <span className="tabular-nums opacity-70">
                {r === "todas" ? buscas.length : buscas.filter((b) => b.situacao === r).length}
              </span>
            </Button>
          ))}
        </div>
        <CampoBusca
          className="ml-auto w-full sm:w-64"
          valor={q}
          aoMudar={setQ}
          placeholder="Segmento ou cidade"
          rotulo="Buscar por segmento ou cidade"
          aoLimpar={() => setQ("")}
          mostrarLimpar={q !== ""}
        />
      </div>
      <CabecalhoDaTabela
        grade={GRADE_BUSCAS}
        colunas={["Busca", "Situação", "Achadas", "Com celular", "Bons", "Contatados", "Quando", ""]}
      />
      {itens.length === 0 && !carregando ? (
        <EstadoVazio tamanho="compacto" texto={busca ? `Nenhuma busca com "${q.trim()}".` : "Nenhuma busca nesta situação."} />
      ) : (
        <ul className="divide-y divide-line-soft" data-slot="leads-buscas">
          {itens.map((b) => (
            <LinhaDaBusca
              key={b.id}
              busca={porId.get(b.id) ?? b}
              contagem={contar(porBusca.get(b.id) ?? [], responderam)}
              agora={agora}
              abrir={() => abrir(b.id)}
            />
          ))}
        </ul>
      )}
      <RodapeDaTabela mostrando={itens.length} total={total} temMais={temMais} carregando={carregando} fimRef={fimRef} slot="buscas" />
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
  cidade: string;
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
  leads,
  campanhas,
  responderam,
  marcar,
}: {
  /** O escopo: todos os leads, ou os de uma busca. */
  leads: Lead[];
  campanhas: Campanha[];
  responderam: Set<string>;
  marcar: (id: string, m: Lead["marcacao"]) => void;
}) {
  const [q, setQ] = useState("");
  const busca = useDebounce(normalizar(q.trim()), 300);
  const [cidade, setCidade] = useState("todas");
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const cidades = useMemo(() => [...new Set(leads.map((l) => l.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR")), [leads]);
  const params = useMemo<ParamsDosLeads>(() => ({ busca, cidade, filtros }), [busca, cidade, filtros]);
  const filtrar = useCallback(
    (p: ParamsDosLeads) =>
      leads.filter(
        (l) =>
          (!p.busca || normalizar(l.nome).includes(p.busca) || (l.telefone ?? "").includes(p.busca.replace(/\D/g, "") || "#")) &&
          (p.cidade === "todas" || l.cidade === p.cidade) &&
          (!p.filtros.includes("nao_contatados") || l.campanhaIds.length === 0) &&
          (!p.filtros.includes("bons") || l.marcacao === "bom") &&
          (!p.filtros.includes("sem_site") || siteDoLead(l.site) !== "sim") &&
          (!p.filtros.includes("nota") || (l.nota ?? 0) >= 4.5),
      ),
    [leads],
  );
  const { itens, temMais, carregando, fimRef, total } = usePaginadaDaMemoria({
    params,
    filtrar,
    chave: (l: Lead) => l.id,
    versao: leads,
  });
  const porId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const porCampanha = useMemo(() => new Map(campanhas.map((c) => [c.id, c])), [campanhas]);
  const alternar = (f: Filtro) => setFiltros((atual) => (atual.includes(f) ? atual.filter((x) => x !== f) : [...atual, f]));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtros">
          {FILTROS.map((f) => (
            <Button
              key={f.chave}
              variant="chip"
              size="chip"
              aria-pressed={filtros.includes(f.chave)}
              onClick={() => alternar(f.chave)}
              data-slot="leads-filtro"
              data-filtro={f.chave}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {cidades.length > 1 && (
            <Select value={cidade} onValueChange={setCidade}>
              <SelectTrigger className="w-44" aria-label="Cidade" data-slot="leads-cidade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as cidades</SelectItem>
                {cidades.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <CampoBusca
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            valor={q}
            aoMudar={setQ}
            placeholder="Nome ou telefone"
            rotulo="Buscar lead pelo nome ou telefone"
            aoLimpar={() => setQ("")}
            mostrarLimpar={q !== ""}
          />
        </div>
      </div>
      <CabecalhoDaTabela grade={GRADE_LEADS} colunas={["Empresa", "Google", "Site", "Telefone", "Pontos", "Campanhas", ""]} />
      {itens.length === 0 && !carregando ? (
        <EstadoVazio tamanho="compacto" texto="Nenhum lead com esses filtros. Tire um filtro ou mude a busca." />
      ) : (
        <ul className="divide-y divide-line-soft" data-slot="leads-tabela">
          {itens.map((l) => (
            <LinhaDoLead
              key={l.id}
              lead={porId.get(l.id) ?? l}
              campanhas={porCampanha}
              respondeu={responderam.has(l.id)}
              marcar={(m) => marcar(l.id, m)}
            />
          ))}
        </ul>
      )}
      <RodapeDaTabela mostrando={itens.length} total={total} temMais={temMais} carregando={carregando} fimRef={fimRef} slot="leads" />
    </>
  );
}

// ── A home da aba e o detalhe da busca ─────────────────────────────────

function HomeDosLeads({
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
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-titulo text-ink">Leads</h2>
            <p className="mt-1 text-apoio text-ink-2">
              Cada busca traz empresas de um segmento numa cidade. A base guarda todas, sem repetir telefone.
            </p>
          </div>
          <Button onClick={novaBusca} data-slot="leads-nova-busca">
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
              texto="Comece buscando um segmento e uma cidade, por exemplo clínica de estética em Mutum. O painel da base aparece assim que a primeira terminar."
            >
              <Button className="mt-2" onClick={novaBusca}>
                <Plus aria-hidden />
                Nova busca
              </Button>
            </EstadoVazio>
          </Card>
        ) : (
          <PainelDaBase r={r} legenda="A base inteira" />
        )}
      </div>

      {buscas.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Tabela da base">
          <Tabs value={vista} onValueChange={(v) => setVista(v === "leads" ? "leads" : "buscas")}>
            <TabsList variant="painel" aria-label="Ver por">
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
          <Card variant="conteudo" className="overflow-hidden">
            {vista === "buscas" ? (
              <TabelaDeBuscas buscas={buscas} leads={leads} responderam={responderam} agora={agora} abrir={abrir} />
            ) : (
              <TabelaDeLeads leads={leads} campanhas={campanhas} responderam={responderam} marcar={marcar} />
            )}
          </Card>
          <p className="text-legenda text-ink-3">
            Telefone fixo, inválido ou de quem pediu para parar nunca entra numa campanha. Quem já passou por uma campanha só
            entra em outra se você escolher.
          </p>
        </section>
      )}
    </div>
  );
}

function DetalheDaBusca({
  busca,
  leads,
  campanhas,
  responderam,
  voltar,
  marcar,
  criarCampanha,
}: {
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
  const legenda = `Busca de ${diaMesHoraSP(busca.criadaEm)}`;
  return (
    <div className="flex flex-col gap-6" data-slot="busca-detalhe">
      <TopoDeDetalhe
        voltar={voltar}
        rotuloDoVoltar="Leads"
        titulo={
          <>
            <span className="first-letter:uppercase">{busca.termo}</span> em {busca.cidade}
          </>
        }
        selo={<SeloDaBusca situacao={busca.situacao} />}
        apoio={`${legenda}. ${numeroBR(c.total)} ${plural(c.total, "empresa achada", "empresas achadas")}.`}
      >
        <Button onClick={criarCampanha} data-slot="busca-criar-campanha">
          Criar campanha com esta busca
        </Button>
      </TopoDeDetalhe>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Indicador variant="elevado" rotulo="Achadas" valor={numeroBR(c.total)} frase="Sem repetir telefone da base" legenda={legenda} />
        <Indicador
          variant="elevado"
          rotulo="Com celular"
          valor={numeroBR(c.comCelular)}
          frase="Os únicos que podem receber"
          legenda={legenda}
        />
        <Indicador variant="elevado" rotulo="Bons" valor={numeroBR(c.bons)} frase="Você marcou" legenda={legenda} />
        <Indicador
          variant="elevado"
          rotulo="Contatados"
          valor={numeroBR(c.contatados)}
          frase={`${pct(c.contatados, Math.max(1, c.comCelular))}% dos com celular`}
          legenda={legenda}
        />
        <Indicador
          variant="elevado"
          rotulo="Responderam"
          valor={numeroBR(c.responderam)}
          frase={c.contatados > 0 ? `${pct(c.responderam, c.contatados)}% dos contatados` : "Ninguém contatado ainda"}
          legenda={legenda}
          className="col-span-2 md:col-span-1"
        />
      </div>

      <Card variant="conteudo" className="overflow-hidden">
        <TabelaDeLeads leads={daBusca} campanhas={campanhas} responderam={responderam} marcar={marcar} />
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
        <DialogDescription>
          Procura empresas no Google Maps. Leva alguns minutos e roda em segundo plano: pode fechar e voltar depois.
        </DialogDescription>
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
            Cada busca gasta crédito da fonte de leads. Empresas que já estão na base não são duplicadas.
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
