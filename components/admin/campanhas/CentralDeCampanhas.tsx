"use client";

import { useCallback, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import { pontuarLead, telefoneDoLead } from "@/lib/prospeccao";
import AbaLeads from "./AbaLeads";
import AbaCampanhas from "./AbaCampanhas";
import Assistente from "./Assistente";
import DetalheDaCampanha from "./DetalheDaCampanha";
import ResultadosGerais from "./Resultados";
import { leadsDoFiltro, type Busca, type Campanha, type ConexaoDisponivel, type Lead, type Tela } from "./tipos";

// CAMPANHAS v2, a prospecção do dono do produto (docs/plano-campanhas.md). Duas
// abas: Leads (a base, por busca) e Campanhas (home, assistente, detalhe e
// resultados). Hoje só o preview `/design/campanhas` monta esta tela, com dados
// de mentira: buscar, marcar, salvar e iniciar mudam só o estado da página.

export default function CentralDeCampanhas({
  telaInicial,
  agora,
  buscasIniciais,
  leadsIniciais,
  campanhasIniciais,
  conexoes,
  variantesSugeridas,
  simularBusca,
}: {
  telaInicial: Tela;
  agora: number;
  buscasIniciais: Busca[];
  leadsIniciais: Lead[];
  campanhasIniciais: Campanha[];
  conexoes: ConexaoDisponivel[];
  /** O texto pré-preenchido de uma campanha nova (o dono edita). */
  variantesSugeridas: string[];
  /** A busca de mentira do preview; de verdade, a rota que dispara a fonte de leads. */
  simularBusca: (buscaId: string, termo: string, cidade: string, inicio: number) => Lead[];
}) {
  const [tela, setTela] = useState<Tela>(telaInicial);
  const [buscas, setBuscas] = useState(buscasIniciais);
  const [leads, setLeads] = useState(leadsIniciais);
  const [campanhas, setCampanhas] = useState(campanhasIniciais);
  /** O rascunho que mandou para Leads ("Falta lead? Fazer uma nova busca"). */
  const [rascunhoEsperando, setRascunhoEsperando] = useState<string | null>(null);

  const mudarCampanha = useCallback(
    (id: string, patch: Partial<Campanha>) =>
      setCampanhas((atual) => atual.map((c) => (c.id === id ? { ...c, ...patch, salvaEm: Date.now() } : c))),
    [],
  );

  const novoRascunho = useCallback(
    (extra: Partial<Campanha>) => {
      const id = `c${Date.now()}`;
      const conectada = conexoes.find((c) => c.conectado) ?? null;
      const agoraMs = Date.now();
      const rascunho: Campanha = {
        id,
        nome: "",
        situacao: "rascunho",
        agendadaPara: null,
        conexaoId: conectada?.id ?? null,
        filtro: { buscaId: "todas", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null },
        variantes: [...variantesSugeridas],
        envios: [],
        criadaEm: agoraMs,
        salvaEm: agoraMs,
        passo: 1,
        ...extra,
      };
      setCampanhas((atual) => [rascunho, ...atual]);
      setTela({ aba: "campanhas", vista: "editar", id });
    },
    [conexoes, variantesSugeridas],
  );

  const aoBuscar = useCallback(
    (termo: string, cidade: string) => {
      const id = `b${Date.now()}`;
      setBuscas((atual) => [{ id, termo, cidade, criadaEm: Date.now(), situacao: "buscando", total: 0, erro: null }, ...atual]);
      // A fonte de verdade avisa por webhook; aqui, alguns segundos de espera.
      window.setTimeout(() => {
        setLeads((atual) => {
          const ja = new Set(atual.map((l) => telefoneDoLead(l.telefone)).filter(Boolean));
          const achados = simularBusca(id, termo, cidade, 300 + atual.length);
          const novos = achados.filter((l) => !ja.has(telefoneDoLead(l.telefone)));
          setBuscas((b) => b.map((x) => (x.id === id ? { ...x, situacao: "pronta", total: achados.length } : x)));
          return [...atual, ...novos];
        });
      }, 4000);
    },
    [simularBusca],
  );

  const marcar = useCallback(
    (id: string, marcacao: Lead["marcacao"]) => setLeads((atual) => atual.map((l) => (l.id === id ? { ...l, marcacao } : l))),
    [],
  );

  const iniciar = useCallback(
    (id: string) => {
      const c = campanhas.find((x) => x.id === id);
      if (!c) return;
      // A fila sai na ordem da pontuação: os melhores leads recebem primeiro.
      const fila = leadsDoFiltro(leads, c.filtro, campanhas).sort((a, b) => pontuarLead(b).pontos - pontuarLead(a).pontos);
      const ids = new Set(fila.map((l) => l.id));
      setLeads((atual) => atual.map((l) => (ids.has(l.id) ? { ...l, campanhaIds: [...l.campanhaIds, id] } : l)));
      mudarCampanha(id, {
        situacao: c.agendadaPara ? "agendada" : "rodando",
        envios: fila.map((l) => ({ leadId: l.id, situacao: "na_fila", variante: null, enviadoEm: null, respondeuEm: null })),
      });
      setTela({ aba: "campanhas", vista: "detalhe", id });
    },
    [campanhas, leads, mudarCampanha],
  );

  const rascunho = useMemo(
    () => (rascunhoEsperando ? (campanhas.find((c) => c.id === rascunhoEsperando) ?? null) : null),
    [campanhas, rascunhoEsperando],
  );
  const emEdicao = tela.aba === "campanhas" && tela.vista === "editar" ? campanhas.find((c) => c.id === tela.id) : undefined;
  const emDetalhe = tela.aba === "campanhas" && tela.vista === "detalhe" ? campanhas.find((c) => c.id === tela.id) : undefined;

  if (emEdicao) {
    return (
      <section aria-label="Nova campanha" className="flex min-h-0 flex-1 flex-col bg-raised md:rounded-xl md:border md:border-line">
        <Assistente
          campanha={emEdicao}
          buscas={buscas}
          leads={leads}
          campanhas={campanhas}
          conexoes={conexoes}
          agora={agora}
          montadoEm={agora}
          aoMudar={(patch) => mudarCampanha(emEdicao.id, patch)}
          aoSair={() => setTela({ aba: "campanhas", vista: "lista" })}
          aoIniciar={() => iniciar(emEdicao.id)}
          irParaLeads={() => {
            setRascunhoEsperando(emEdicao.id);
            setTela({ aba: "leads", busca: null });
          }}
        />
      </section>
    );
  }

  return (
    <section aria-label="Campanhas" data-slot="campanhas" className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={tela.aba}
        onValueChange={(v) => setTela(v === "leads" ? { aba: "leads", busca: null } : { aba: "campanhas", vista: "lista" })}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 md:px-8 md:pt-6">
          <h1 className="text-rotulo uppercase text-ink-3">Prospecção da OBS</h1>
          <TabsList variant="painel" aria-label="Seções">
            <TabsTrigger value="leads" variant="painel" data-slot="campanhas-aba-leads">
              Leads
            </TabsTrigger>
            <TabsTrigger value="campanhas" variant="painel" data-slot="campanhas-aba-campanhas">
              Campanhas
            </TabsTrigger>
          </TabsList>
        </div>

        <AreaRolavel tamanho={DISSOLVER_PADRAO} className="min-h-0 flex-1">
          <div className="px-4 py-6 md:px-8 md:py-8">
            {tela.aba === "leads" ? (
              <AbaLeads
                buscas={buscas}
                leads={leads}
                campanhas={campanhas}
                agora={agora}
                buscaAberta={tela.busca}
                rascunho={rascunho}
                abrirBusca={(id) => setTela({ aba: "leads", busca: id })}
                aoBuscar={aoBuscar}
                marcar={marcar}
                criarCampanhaDaBusca={(buscaId) => {
                  const b = buscas.find((x) => x.id === buscaId);
                  const nome = b ? `${b.termo.charAt(0).toUpperCase()}${b.termo.slice(1)} em ${b.cidade}` : "";
                  novoRascunho({ nome, filtro: { buscaId, soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null } });
                }}
                voltarAoRascunho={() => {
                  if (!rascunhoEsperando) return;
                  setTela({ aba: "campanhas", vista: "editar", id: rascunhoEsperando });
                  setRascunhoEsperando(null);
                }}
              />
            ) : tela.vista === "resultados" ? (
              <ResultadosGerais campanhas={campanhas} voltar={() => setTela({ aba: "campanhas", vista: "lista" })} />
            ) : emDetalhe ? (
              <DetalheDaCampanha
                campanha={emDetalhe}
                leads={leads}
                conexoes={conexoes}
                voltar={() => setTela({ aba: "campanhas", vista: "lista" })}
                pausarOuRetomar={() =>
                  mudarCampanha(emDetalhe.id, { situacao: emDetalhe.situacao === "pausada" ? "rodando" : "pausada" })
                }
                reenviarParaQuemNaoRespondeu={() =>
                  novoRascunho({
                    nome: `${emDetalhe.nome}, segunda chance`,
                    conexaoId: emDetalhe.conexaoId,
                    variantes: [...emDetalhe.variantes],
                    filtro: { buscaId: "todas", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: emDetalhe.id },
                    passo: 2,
                  })
                }
              />
            ) : (
              <AbaCampanhas
                campanhas={campanhas}
                conexoes={conexoes}
                agora={agora}
                abrir={(id) => setTela({ aba: "campanhas", vista: "detalhe", id })}
                editar={(id) => setTela({ aba: "campanhas", vista: "editar", id })}
                nova={() => novoRascunho({})}
                verResultados={() => setTela({ aba: "campanhas", vista: "resultados" })}
              />
            )}
          </div>
        </AreaRolavel>
      </Tabs>
    </section>
  );
}
