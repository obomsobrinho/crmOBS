"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaRolavel, DISSOLVER_PADRAO } from "@/components/ui/dissolver-rolagem";
import { numeroBR } from "@/lib/format";
import AbaLeads from "./AbaLeads";
import NovaBusca from "./NovaBusca";
import AbaCampanhas from "./AbaCampanhas";
import Assistente from "./Assistente";
import DetalheDaCampanha from "./DetalheDaCampanha";
import { useLeitura } from "./tabela";
import { somaDe, type Busca, type CampanhaEditavel, type FonteDeCampanhas, type InicialDaCentral, type Tela } from "./tipos";

// CAMPANHAS v2, a prospecção do dono do produto (docs/plano-campanhas.md). O
// par de abas no topo de cada tela troca a tela inteira: Leads (o painel da base e as tabelas de
// buscas e de leads) e Campanhas (o painel de resultados, a tabela de
// campanhas, o assistente e o detalhe). Cada tela lê da `fonte` (as rotas
// `/api/admin/campanhas/*` na página de verdade, a memória no preview); depois de
// uma escrita a `versao` muda e as leituras voltam ao servidor. O rascunho do
// assistente é salvo sozinho, uma pausa curta depois da última mudança.

/** A pausa entre a última mudança no assistente e o salvamento do rascunho. */
const PAUSA_DO_SALVAMENTO_MS = 600;

export default function CentralDeCampanhas({
  telaInicial,
  agora,
  fonte,
  variantesSugeridas,
  inicial = null,
}: {
  telaInicial: Tela;
  agora: number;
  fonte: FonteDeCampanhas;
  /** O que o servidor já leu para a primeira tela (só a página de verdade). */
  inicial?: InicialDaCentral | null;
  /** O texto pré-preenchido de uma campanha nova (o dono edita). */
  variantesSugeridas: string[];
}) {
  const [tela, setTela] = useState<Tela>(telaInicial);
  const [versao, setVersao] = useState(0);
  const mudou = useCallback(() => setVersao((v) => v + 1), []);
  const { dados: totais } = useLeitura(`totais|${versao}`, () => fonte.totais(), inicial?.totais ?? null);
  const { dados: conexoes } = useLeitura("conexoes", () => fonte.conexoes());

  // ── O rascunho aberto no assistente ──
  const [rascunho, setRascunho] = useState<CampanhaEditavel | null>(null);
  const [montadoEm, setMontadoEm] = useState(agora);
  const [iniciando, setIniciando] = useState(false);
  const [erroAoIniciar, setErroAoIniciar] = useState<string | null>(null);
  /** O rascunho que mandou para Leads ("Falta lead? Fazer uma nova busca"). */
  const [rascunhoEsperando, setRascunhoEsperando] = useState<CampanhaEditavel | null>(null);
  const pendente = useRef<CampanhaEditavel | null>(null);
  /** O salvamento que está indo agora: quem precisa do rascunho gravado (Iniciar, Cancelar) espera por ele. */
  const salvando = useRef<Promise<void>>(Promise.resolve());

  // Os salvamentos andam em fila: o próximo só sai depois do anterior, e esperar a fila
  // é esperar o último. Assim "Iniciar" nunca chega ao servidor antes do rascunho.
  const salvarAgora = useCallback(() => {
    salvando.current = salvando.current.then(async () => {
      const c = pendente.current;
      if (!c) return;
      pendente.current = null;
      try {
        const salvaEm = await fonte.salvar(c);
        setRascunho((atual) => (atual && atual.id === c.id ? { ...atual, salvaEm } : atual));
      } catch (e) {
        console.error("campanha, salvar rascunho:", e);
      }
    });
    return salvando.current;
  }, [fonte]);

  useEffect(() => {
    if (!rascunho || pendente.current === null) return;
    const t = window.setTimeout(() => void salvarAgora(), PAUSA_DO_SALVAMENTO_MS);
    return () => window.clearTimeout(t);
  }, [rascunho, salvarAgora]);

  const abrirRascunho = useCallback(
    (c: CampanhaEditavel, salvar: boolean) => {
      setMontadoEm(Date.now());
      setErroAoIniciar(null);
      setRascunho(c);
      if (salvar) pendente.current = c;
      setTela({ aba: "campanhas", vista: "editar", id: c.id });
    },
    [],
  );

  const novoRascunho = useCallback(
    (extra: Partial<CampanhaEditavel>) => {
      const conectada = conexoes?.find((c) => c.conectado) ?? conexoes?.[0] ?? null;
      const agoraMs = Date.now();
      abrirRascunho(
        {
          id: crypto.randomUUID(),
          nome: "",
          situacao: "rascunho",
          agendadaPara: null,
          conexaoId: conectada?.id ?? null,
          filtro: { buscaId: "todas", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null },
          variantes: [...variantesSugeridas],
          criadaEm: agoraMs,
          salvaEm: agoraMs,
          passo: 1,
          ...extra,
        },
        true,
      );
    },
    [abrirRascunho, conexoes, variantesSugeridas],
  );

  const editar = useCallback(
    async (id: string) => {
      try {
        const aberta = await fonte.campanha(id);
        if (aberta && aberta.campanha.situacao === "rascunho") abrirRascunho(aberta.campanha, false);
        else if (aberta) setTela({ aba: "campanhas", vista: "detalhe", id });
      } catch (e) {
        console.error("campanha, abrir rascunho:", e);
      }
    },
    [abrirRascunho, fonte],
  );

  // Aberta direto num rascunho (o link do preview `?tela=rascunho`): lê a campanha uma vez.
  useEffect(() => {
    if (telaInicial.aba !== "campanhas" || telaInicial.vista !== "editar") return;
    let vivo = true;
    fonte
      .campanha(telaInicial.id)
      .then((a) => {
        if (vivo && a?.campanha.situacao === "rascunho") setRascunho(a.campanha);
      })
      .catch((e) => console.error("campanha, abrir rascunho:", e));
    return () => {
      vivo = false;
    };
  }, [fonte, telaInicial]);

  const mudarRascunho = useCallback((patch: Partial<CampanhaEditavel>) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      const novo = { ...atual, ...patch };
      pendente.current = novo;
      return novo;
    });
  }, []);

  const sairDoAssistente = useCallback(async () => {
    await salvarAgora();
    setRascunho(null);
    setTela({ aba: "campanhas", vista: "lista" });
    mudou();
  }, [mudou, salvarAgora]);

  const iniciar = useCallback(async () => {
    if (!rascunho) return;
    setIniciando(true);
    setErroAoIniciar(null);
    try {
      await salvarAgora();
      const r = await fonte.iniciar(rascunho.id);
      if (!r.ok) {
        setErroAoIniciar(r.erro);
        return;
      }
      setRascunho(null);
      setTela({ aba: "campanhas", vista: "detalhe", id: rascunho.id });
      mudou();
    } catch (e) {
      console.error("campanha, iniciar:", e);
      setErroAoIniciar("Não deu para iniciar agora. O rascunho está salvo; tente de novo em instantes.");
    } finally {
      setIniciando(false);
    }
  }, [fonte, mudou, rascunho, salvarAgora]);

  const irParaCampanhas = () => setTela({ aba: "campanhas", vista: "lista" });
  const emEdicao = tela.aba === "campanhas" && tela.vista === "editar" && rascunho?.id === tela.id ? rascunho : null;
  const nCampanhas = somaDe(totais?.campanhas);

  // Leads | Campanhas: o par de abas no canto esquerdo da linha de cima de cada tela (dono, 29/10/2026).
  const abas = (
    <Tabs
      value={tela.aba}
      onValueChange={(v) => (v === "leads" ? setTela({ aba: "leads", busca: null }) : irParaCampanhas())}
    >
      <TabsList variant="painel" aria-label="Seções">
        <TabsTrigger value="leads" variant="painel" data-slot="campanhas-aba-leads">
          Leads
          {totais && <span className="ml-1.5 tabular-nums text-ink-3">{numeroBR(totais.leads)}</span>}
        </TabsTrigger>
        <TabsTrigger value="campanhas" variant="painel" data-slot="campanhas-aba-campanhas">
          Campanhas
          {totais && <span className="ml-1.5 tabular-nums text-ink-3">{numeroBR(nCampanhas)}</span>}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <section aria-label="Prospecção" data-slot="campanhas" className="flex min-h-0 flex-1 flex-col">

      {emEdicao ? (
        <section aria-label="Nova campanha" className="flex min-h-0 min-w-0 flex-1 flex-col bg-raised md:rounded-xl md:border md:border-line">
          <Assistente
            campanha={emEdicao}
            fonte={fonte}
            conexoes={conexoes ?? []}
            agora={agora}
            montadoEm={montadoEm}
            iniciando={iniciando}
            erro={erroAoIniciar}
            aoMudar={mudarRascunho}
            aoSair={sairDoAssistente}
            aoIniciar={iniciar}
            irParaLeads={() => {
              void salvarAgora();
              setRascunhoEsperando(emEdicao);
              setTela({ aba: "leads", busca: null });
            }}
          />
        </section>
      ) : tela.aba === "leads" && "nova" in tela ? (
        <PaginaDaNovaBusca
          fonte={fonte}
          voltar={() => setTela({ aba: "leads", busca: null })}
          aoComecar={() => {
            setTela({ aba: "leads", busca: null });
            mudou();
          }}
        />
      ) : (
        // A chave troca a cada tela: abrir outra tela começa do topo, não de onde a anterior parou.
        <AreaRolavel
          key={tela.aba === "leads" ? `leads-${"busca" in tela ? (tela.busca ?? "") : ""}` : `campanhas-${"id" in tela ? tela.id : ""}`}
          tamanho={DISSOLVER_PADRAO}
          className="min-h-0 min-w-0 flex-1"
        >
          <div className="px-4 py-4 md:px-1 md:py-1">
            {tela.aba === "leads" && "busca" in tela ? (
              <AbaLeads
                abas={abas}
                fonte={fonte}
                versao={versao}
                totais={totais}
                inicial={inicial}
                agora={agora}
                buscaAberta={tela.busca}
                rascunho={rascunhoEsperando}
                abrirBusca={(id) => setTela({ aba: "leads", busca: id })}
                aoMudar={mudou}
                novaBusca={() => setTela({ aba: "leads", nova: true })}
                criarCampanhaDaBusca={(b: Busca) => {
                  const nome = `${b.termo.charAt(0).toUpperCase()}${b.termo.slice(1)} em ${b.cidade}`;
                  novoRascunho({ nome, filtro: { buscaId: b.id, soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: null } });
                }}
                voltarAoRascunho={() => {
                  if (!rascunhoEsperando) return;
                  const id = rascunhoEsperando.id;
                  setRascunhoEsperando(null);
                  void editar(id);
                }}
              />
            ) : tela.vista === "detalhe" ? (
              <DetalheDaCampanha
                abas={abas}
                fonte={fonte}
                id={tela.id}
                versao={versao}
                conexoes={conexoes ?? []}
                voltar={irParaCampanhas}
                aoMudar={mudou}
                reenviarParaQuemNaoRespondeu={(origem) =>
                  novoRascunho({
                    nome: `${origem.nome}, segunda chance`,
                    conexaoId: origem.conexaoId,
                    variantes: [...origem.variantes],
                    filtro: { buscaId: "todas", soMarcadosComoBons: false, soSemSiteProprio: false, quemNaoRespondeuDe: origem.id },
                    passo: 2,
                  })
                }
              />
            ) : (
              <AbaCampanhas
                abas={abas}
                fonte={fonte}
                versao={versao}
                totais={totais}
                conexoes={conexoes ?? []}
                agora={agora}
                abrir={(id) => setTela({ aba: "campanhas", vista: "detalhe", id })}
                editar={(id) => void editar(id)}
                nova={() => novoRascunho({})}
              />
            )}
          </div>
        </AreaRolavel>
      )}
    </section>
  );
}

/**
 * A página da Nova busca: lê a cidade da última busca (onde o mapa abre; sem busca, a
 * cidade da OBS) e só então monta a página, para os campos nascerem nela.
 */
function PaginaDaNovaBusca({ fonte, voltar, aoComecar }: { fonte: FonteDeCampanhas; voltar: () => void; aoComecar: () => void }) {
  const ultima = useLeitura("ultima-busca", () => fonte.buscasParaEscolher());
  const localInicial = useMemo(() => {
    const opcoes = ultima.dados?.find((b) => b.opcoes.cidadeIbge !== null)?.opcoes ?? null;
    return opcoes?.cidadeIbge != null ? { uf: opcoes.uf, ibge: opcoes.cidadeIbge } : null;
  }, [ultima.dados]);
  if (!ultima.dados && !ultima.erro) return null;
  return (
    <NovaBusca
      voltar={voltar}
      localInicial={localInicial}
      aoBuscar={async (o) => {
        const r = await fonte.novaBusca(o);
        if (r.ok) aoComecar();
        return r;
      }}
    />
  );
}
