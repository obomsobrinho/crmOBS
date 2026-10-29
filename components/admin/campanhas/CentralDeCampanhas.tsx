"use client";

import { useCallback, useMemo, useState } from "react";
import { Megaphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import { numeroBR } from "@/lib/format";
import { pontuarLead, telefoneDoLead } from "@/lib/prospeccao";
import AbaLeads from "./AbaLeads";
import AbaCampanhas from "./AbaCampanhas";
import Assistente from "./Assistente";
import DetalheDaCampanha from "./DetalheDaCampanha";
import { leadsDoFiltro, type Busca, type Campanha, type ConexaoDisponivel, type Lead, type Tela } from "./tipos";

// CAMPANHAS v2, a prospecção do dono do produto (docs/plano-campanhas.md). Um
// menu à esquerda troca a tela inteira: Leads (o painel da base e as tabelas de
// buscas e de leads) e Campanhas (o painel de resultados, a tabela de
// campanhas, o assistente e o detalhe). Hoje só o preview `/design/campanhas`
// monta esta tela, com dados de mentira: buscar, marcar, salvar e iniciar mudam
// só o estado da página.

function ItemDoMenu({
  ativo,
  icone: Icone,
  rotulo,
  contagem,
  aoClicar,
  slot,
}: {
  ativo: boolean;
  icone: typeof Users;
  rotulo: string;
  contagem: number;
  aoClicar: () => void;
  slot: string;
}) {
  return (
    <Button
      variant="nu"
      size="linha"
      onClick={aoClicar}
      aria-current={ativo ? "page" : undefined}
      data-slot={slot}
      className="flex-1 justify-start text-ink-2 hover:bg-[var(--active-bg)] hover:text-ink aria-[current=page]:bg-[var(--active-bg)] aria-[current=page]:font-semibold aria-[current=page]:text-ink md:w-full md:flex-none"
    >
      <Icone size={18} aria-hidden className={ativo ? "text-brand-ink" : "text-ink-3"} />
      {rotulo}
      <span className="ml-auto text-legenda font-normal tabular-nums text-ink-3">{numeroBR(contagem)}</span>
    </Button>
  );
}

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
          const achados = simularBusca(id, termo, cidade, 3000 + atual.length);
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
  const irParaCampanhas = () => setTela({ aba: "campanhas", vista: "lista" });

  return (
    <section aria-label="Prospecção" data-slot="campanhas" className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
      <Card asChild variant="conteudo" className="shrink-0 max-md:rounded-none md:w-56">
        <nav aria-label="Prospecção" className="flex gap-1 p-2 md:flex-col md:p-3" data-slot="campanhas-menu">
          <ItemDoMenu
            ativo={tela.aba === "leads"}
            icone={Users}
            rotulo="Leads"
            contagem={leads.length}
            aoClicar={() => setTela({ aba: "leads", busca: null })}
            slot="campanhas-aba-leads"
          />
          <ItemDoMenu
            ativo={tela.aba === "campanhas"}
            icone={Megaphone}
            rotulo="Campanhas"
            contagem={campanhas.length}
            aoClicar={irParaCampanhas}
            slot="campanhas-aba-campanhas"
          />
        </nav>
      </Card>

      {emEdicao ? (
        <section aria-label="Nova campanha" className="flex min-h-0 min-w-0 flex-1 flex-col bg-raised md:rounded-xl md:border md:border-line">
          <Assistente
            campanha={emEdicao}
            buscas={buscas}
            leads={leads}
            campanhas={campanhas}
            conexoes={conexoes}
            agora={agora}
            montadoEm={agora}
            aoMudar={(patch) => mudarCampanha(emEdicao.id, patch)}
            aoSair={irParaCampanhas}
            aoIniciar={() => iniciar(emEdicao.id)}
            irParaLeads={() => {
              setRascunhoEsperando(emEdicao.id);
              setTela({ aba: "leads", busca: null });
            }}
          />
        </section>
      ) : (
        // A chave troca a cada tela: abrir outra tela começa do topo, não de onde a anterior parou.
        <AreaRolavel
          key={tela.aba === "leads" ? `leads-${tela.busca ?? ""}` : `campanhas-${"id" in tela ? tela.id : ""}`}
          tamanho={DISSOLVER_PADRAO}
          className="min-h-0 min-w-0 flex-1"
        >
          <div className="px-4 py-6 md:px-2 md:py-2">
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
            ) : emDetalhe ? (
              <DetalheDaCampanha
                campanha={emDetalhe}
                leads={leads}
                conexoes={conexoes}
                agora={agora}
                voltar={irParaCampanhas}
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
              />
            )}
          </div>
        </AreaRolavel>
      )}
    </section>
  );
}
