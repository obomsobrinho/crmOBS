"use client";

import { memo, useMemo, useState } from "react";
import { AlertCircle, Loader2, MapPin, Plus, Search, Star, ThumbsUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { Aviso } from "@/components/ui/aviso";
import { mascaraTelefoneBR, numeroBR, plural } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import { podeEntrarNaCampanha, siteDoLead, tipoDoTelefone } from "@/lib/prospeccao";
import { SeloDaBusca, SeloDaPontuacao, TextoDoSite, TopoDeDetalhe, haQuanto } from "./pecas";
import type { Busca, Campanha, Lead } from "./tipos";

// LEADS, a base: uma busca por cartão (termo e cidade, roda em segundo plano) e,
// dentro dela, a tabela de empresas com nota, site, telefone, pontuação e a
// campanha por onde cada uma passou. Marcar como bom e descartar mudam a base.

interface ContagemDaBusca {
  total: number;
  aproveitaveis: number;
  contatados: number;
}

function contar(leads: Lead[]): ContagemDaBusca {
  return {
    total: leads.length,
    aproveitaveis: leads.filter((l) => podeEntrarNaCampanha({ ...l, campanhas: 0 })).length,
    contatados: leads.filter((l) => l.campanhaIds.length > 0).length,
  };
}

// ── Lista de buscas ─────────────────────────────────────────────────────

function CartaoDaBusca({
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
        variant="nu"
        size="none"
        onClick={abrir}
        disabled={!pronta}
        data-slot="busca-cartao"
        data-busca={busca.id}
        className="flex h-full w-full flex-col items-stretch gap-4 rounded-xl border border-line bg-raised p-5 text-left transition-colors hover:border-line-strong disabled:cursor-default disabled:opacity-100"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-cartao text-ink">{busca.termo}</p>
            <p className="mt-0.5 flex items-center gap-1 text-apoio text-ink-2">
              <MapPin size={14} aria-hidden className="text-ink-3" />
              {busca.cidade}
            </p>
          </div>
          <SeloDaBusca situacao={busca.situacao} />
        </div>

        {busca.situacao === "buscando" && (
          <p className="flex items-center gap-2 text-apoio text-ink-2">
            <Loader2 size={14} aria-hidden className="animate-spin text-ink-3 motion-reduce:animate-none" />
            Procurando empresas. Pode sair desta tela, a busca continua.
          </p>
        )}
        {busca.situacao === "falhou" && <p className="text-apoio text-ink-2">{busca.erro}</p>}
        {pronta && (
          <dl className="grid grid-cols-3 gap-3">
            {(
              [
                ["Achadas", contagem.total],
                ["Aproveitáveis", contagem.aproveitaveis],
                ["Contatadas", contagem.contatados],
              ] as const
            ).map(([rotulo, n]) => (
              <div key={rotulo} className="min-w-0">
                <dt className="text-rotulo uppercase text-ink-3">{rotulo}</dt>
                <dd className="mt-1 text-titulo tabular-nums text-ink">{numeroBR(n)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-auto text-legenda text-ink-3">Criada {haQuanto(busca.criadaEm, agora)}</p>
      </Button>
    </li>
  );
}

function ListaDeBuscas({
  buscas,
  leads,
  agora,
  rascunho,
  abrir,
  novaBusca,
  voltarAoRascunho,
}: {
  buscas: Busca[];
  leads: Lead[];
  agora: number;
  rascunho: Campanha | null;
  abrir: (id: string) => void;
  novaBusca: () => void;
  voltarAoRascunho: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-titulo text-ink">Leads</h2>
          <p className="mt-1 text-apoio text-ink-2">Cada busca traz empresas de um segmento numa cidade. A base guarda todas.</p>
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
            texto="Comece buscando um segmento e uma cidade, por exemplo clínica de estética em Mutum."
          >
            <Button className="mt-2" onClick={novaBusca}>
              <Plus aria-hidden />
              Nova busca
            </Button>
          </EstadoVazio>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-slot="leads-buscas">
          {buscas.map((b) => (
            <CartaoDaBusca
              key={b.id}
              busca={b}
              contagem={contar(leads.filter((l) => l.buscaId === b.id))}
              agora={agora}
              abrir={() => abrir(b.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Detalhe da busca ────────────────────────────────────────────────────

type Filtro = "nao_contatados" | "tem_site" | "nota";

const FILTROS: { chave: Filtro; rotulo: string }[] = [
  { chave: "nao_contatados", rotulo: "Não contatados" },
  { chave: "tem_site", rotulo: "Tem site" },
  { chave: "nota", rotulo: "Nota 4,5 ou mais" },
];

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

const COLUNAS = "lg:grid lg:grid-cols-[minmax(0,2.2fr)_0.9fr_0.9fr_1.3fr_0.5fr_1.1fr_auto] lg:items-center lg:gap-4";

function LinhaDoLead({
  lead,
  campanhas,
  marcar,
}: {
  lead: Lead;
  campanhas: Campanha[];
  marcar: (m: Lead["marcacao"]) => void;
}) {
  const descartado = lead.marcacao === "descartado";
  return (
    <li
      data-slot="lead-linha"
      data-lead={lead.id}
      data-marcacao={lead.marcacao ?? "nenhuma"}
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 ${COLUNAS} ${descartado ? "opacity-55" : ""}`}
    >
      <div className="min-w-0 basis-full lg:basis-auto">
        <p className="truncate text-corpo font-semibold text-ink">{lead.nome}</p>
        <p className="truncate text-legenda text-ink-3">{lead.bairro}</p>
      </div>
      <p className="flex items-center gap-1 text-apoio text-ink-2" aria-label={lead.nota === null ? "Sem nota" : `Nota ${lead.nota}, ${lead.avaliacoes ?? 0} avaliações`}>
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
      <div className="flex flex-wrap gap-1.5">
        {lead.parouEm !== null ? (
          <Badge variant="estado-aviso">Pediu para parar</Badge>
        ) : lead.campanhaIds.length === 0 ? (
          <span className="text-apoio text-ink-3">Nenhuma</span>
        ) : (
          lead.campanhaIds.map((id) => (
            <Badge key={id} variant="contorno" data-slot="lead-campanha" className="max-w-full truncate">
              {campanhas.find((c) => c.id === id)?.nome ?? "Campanha"}
            </Badge>
          ))
        )}
      </div>
      <div className="ml-auto flex items-center gap-1 lg:ml-0">
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

function DetalheDaBusca({
  busca,
  leads,
  campanhas,
  voltar,
  marcar,
  criarCampanha,
}: {
  busca: Busca;
  leads: Lead[];
  campanhas: Campanha[];
  voltar: () => void;
  marcar: (id: string, m: Lead["marcacao"]) => void;
  criarCampanha: () => void;
}) {
  const [filtros, setFiltros] = useState<Set<Filtro>>(new Set());
  const daBusca = useMemo(() => leads.filter((l) => l.buscaId === busca.id), [leads, busca.id]);
  const c = contar(daBusca);
  const visiveis = daBusca.filter(
    (l) =>
      (!filtros.has("nao_contatados") || l.campanhaIds.length === 0) &&
      (!filtros.has("tem_site") || siteDoLead(l.site) === "sim") &&
      (!filtros.has("nota") || (l.nota ?? 0) >= 4.5),
  );
  const alternar = (f: Filtro) =>
    setFiltros((atual) => {
      const novo = new Set(atual);
      if (novo.has(f)) novo.delete(f);
      else novo.add(f);
      return novo;
    });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6" data-slot="busca-detalhe">
      <TopoDeDetalhe
        voltar={voltar}
        rotuloDoVoltar="Leads"
        titulo={`${busca.termo} · ${busca.cidade}`}
        selo={<SeloDaBusca situacao={busca.situacao} />}
        apoio={`Busca de ${diaMesHoraSP(busca.criadaEm)}. ${numeroBR(c.total)} ${plural(c.total, "empresa achada", "empresas achadas")}, ${numeroBR(c.aproveitaveis)} com celular válido, ${numeroBR(c.contatados)} já ${plural(c.contatados, "contatada", "contatadas")}.`}
      >
        <Button onClick={criarCampanha} data-slot="busca-criar-campanha">
          Criar campanha com esta busca
        </Button>
      </TopoDeDetalhe>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
        {FILTROS.map((f) => (
          <Button
            key={f.chave}
            variant="chip"
            size="chip"
            aria-pressed={filtros.has(f.chave)}
            onClick={() => alternar(f.chave)}
            data-slot="busca-filtro"
            data-filtro={f.chave}
          >
            {f.rotulo}
          </Button>
        ))}
        <span className="ml-auto text-legenda text-ink-3" aria-live="polite">
          {numeroBR(visiveis.length)} de {numeroBR(daBusca.length)}
        </span>
      </div>

      <Card variant="conteudo" className="overflow-hidden">
        <div className={`hidden border-b border-line px-5 py-3 text-rotulo uppercase text-ink-3 ${COLUNAS}`} aria-hidden>
          <span>Empresa</span>
          <span>Google</span>
          <span>Site</span>
          <span>Telefone</span>
          <span>Pontos</span>
          <span>Campanha</span>
          <span className="w-[108px]" />
        </div>
        {visiveis.length === 0 ? (
          <EstadoVazio tamanho="compacto" texto="Nenhuma empresa com esses filtros. Tire um filtro para ver mais." />
        ) : (
          <ul className="divide-y divide-line-soft" data-slot="busca-leads">
            {visiveis.map((l) => (
              <LinhaDoLead key={l.id} lead={l} campanhas={campanhas} marcar={(m) => marcar(l.id, m)} />
            ))}
          </ul>
        )}
      </Card>
      <p className="text-legenda text-ink-3">
        Telefone fixo, inválido ou de quem pediu para parar nunca entra numa campanha. Quem já passou por uma campanha só
        entra em outra se você escolher.
      </p>
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
  return (
    <>
      {busca ? (
        <DetalheDaBusca
          busca={busca}
          leads={leads}
          campanhas={campanhas}
          voltar={() => abrirBusca(null)}
          marcar={marcar}
          criarCampanha={() => criarCampanhaDaBusca(busca.id)}
        />
      ) : (
        <ListaDeBuscas
          buscas={buscas}
          leads={leads}
          agora={agora}
          rascunho={rascunho}
          abrir={abrirBusca}
          novaBusca={() => setDialogo(true)}
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
