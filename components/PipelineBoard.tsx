"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type ContagensPipeline } from "@/lib/pipeline-fonte";
import type { Member } from "@/lib/team";
import type { PipelineCard, Stage } from "@/lib/pipeline";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { ColunaCarregada } from "./pipeline/colunas";
import { ColunaDoPipeline } from "./pipeline/ColunaDoPipeline";
import { FaixaDeEstagios } from "./pipeline/FaixaDeEstagios";
import { MoverSheet } from "./pipeline/MoverSheet";
import { PipelineFiltros } from "./pipeline/PipelineFiltros";
import { StageManager } from "./pipeline/StageManager";
import { useGestaoDeEstagios } from "./pipeline/useGestaoDeEstagios";
import { usePipelineDados } from "./pipeline/usePipelineDados";

export type { ColunaCarregada };

export default function PipelineBoard({
  clientId,
  myRole,
  initialStages,
  inicial,
  previewCards,
  preview = false,
  previewMembers = [],
  numeroAvisos = null,
}: {
  clientId: string;
  myRole: string | null;
  initialStages: Stage[];
  /** As primeiras páginas de cada coluna e os números, que o servidor já buscou. */
  inicial: { colunas: Record<string, ColunaCarregada>; contagens: ContagensPipeline };
  /** Preview /design: todos os cards na memória, paginados pela mesma regra. */
  previewCards?: PipelineCard[];
  /** No /design (sem login) usa mocks e simula as ações em memória. */
  preview?: boolean;
  previewMembers?: Member[];
  /** Destino dos avisos: esse número nunca é card (lib/avisos.ts). */
  numeroAvisos?: string | null;
}) {
  const router = useRouter();
  const isOwner = myRole === "dono";

  // PIPELINE PAGINADO POR COLUNA (01/10/2026, docs/plano-carregamento.md, fase
  // 5): cada coluna tem os próprios cards (10 por vez, mais ao rolar a coluna) e
  // os números vêm do banco. Antes eram até 500 conversas, todos os contatos e
  // 300 resumos, recarregados a cada mudança em qualquer conversa.
  const [search, setSearch] = useState("");
  const [attFilter, setAttFilter] = useState<string>("all"); // all | none | userId
  const [stageFilter, setStageFilter] = useState<string>("all");
  // Recorte por "esperando você" (handoff em aberto). É o mesmo conceito do
  // filtro "Precisa de você" da lista de conversas, com o mesmo dado, para as
  // duas telas não contarem coisas diferentes com o mesmo nome.
  const [soEsperando, setSoEsperando] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CELULAR (plano do mobile, fase 3): um estágio por vez, escolhido na faixa
  // de cima, e mover o card por uma folha em vez de arrastar.
  const [estagioCel, setEstagioCel] = useState<string | null>(null);
  const [movendo, setMovendo] = useState<PipelineCard | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);

  const {
    supabase,
    stages,
    setStages,
    colunas,
    contagens,
    membersById,
    members,
    activeStages,
    refetchStages,
    carregarMais,
    estagioDoCard,
    moveCard,
  } = usePipelineDados({
    clientId,
    preview,
    initialStages,
    inicial,
    previewCards,
    previewMembers,
    numeroAvisos,
    search,
    attFilter,
    soEsperando,
    setError,
  });
  const { addStage, deleteStage, patchStage, moveStage, reorderStages } =
    useGestaoDeEstagios({
      supabase,
      clientId,
      stages,
      setStages,
      activeStages,
      refetchStages,
      setError,
    });

  // Quantos esperam você no funil INTEIRO (do banco, sem filtro): o número no
  // botão não pode encolher porque alguém filtrou por atendente.
  const esperandoCount = contagens.esperandoGeral;

  // As colunas visíveis, cada uma com os cards que já carregaram dela.
  const columns = useMemo(() => {
    const cols = activeStages.map((stage) => ({
      stage,
      cards: colunas[stage.key]?.cards ?? [],
    }));
    return stageFilter === "all" ? cols : cols.filter((c) => c.stage.key === stageFilter);
  }, [activeStages, colunas, stageFilter]);

  const numerosDe = (key: string) =>
    contagens.porColuna[key] ?? { total: 0, esperando: 0, maisAntigo: null };

  // O estágio que o celular mostra: o escolhido, se ainda existir, senão o
  // primeiro. Derivado, e não sincronizado por efeito, para arquivar um
  // estágio não deixar a tela apontando para o nada.
  const estagioVisivel =
    columns.find((c) => c.stage.key === estagioCel)?.stage.key ??
    columns[0]?.stage.key ??
    null;

  const shownCount = columns.reduce((n, c) => n + numerosDe(c.stage.key).total, 0);

  return (
    <Card variant="pagina" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PipelineFiltros
        shownCount={shownCount}
        isOwner={isOwner}
        search={search}
        setSearch={setSearch}
        buscaAberta={buscaAberta}
        setBuscaAberta={setBuscaAberta}
        attFilter={attFilter}
        setAttFilter={setAttFilter}
        stageFilter={stageFilter}
        setStageFilter={setStageFilter}
        members={members}
        activeStages={activeStages}
        esperandoCount={esperandoCount}
        soEsperando={soEsperando}
        onAlternarEsperando={() => {
            const ligando = !soEsperando;
            setSoEsperando(ligando);
            // CELULAR (achado do dono, 27/09/2026): lá aparece UMA coluna por
            // vez, então ligar o filtro escondia cards de outras colunas e a
            // tela que ele estava vendo não mudava nada. Ligar leva direto à
            // primeira coluna com alguém esperando, que é o que ele quer ver.
            if (ligando) {
              const alvo = activeStages.find((st) => numerosDe(st.key).esperando > 0);
              if (alvo) setEstagioCel(alvo.key);
            }
        }}
        onGerenciar={() => setManaging(true)}
      />

      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-line bg-danger-surface px-4 py-2 text-apoio text-danger-ink">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon-chrome"
            onClick={() => setError(null)}
            aria-label="Fechar aviso"
            className="text-danger-ink"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {/* CELULAR: a faixa de estágios (bolinha da cor, nome, contagem), um
          por vez. Tocar escolhe qual coluna aparece embaixo. */}
      {columns.length > 0 && (
        <FaixaDeEstagios
          columns={columns}
          estagioVisivel={estagioVisivel}
          numerosDe={numerosDe}
          onEscolher={setEstagioCel}
        />
      )}

      {/* Colunas */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 max-md:overflow-x-visible max-md:p-0">
        {columns.length === 0 && (
          <div className="m-auto text-apoio text-ink-3">
            Nenhum estágio ativo. {isOwner ? "Crie um em Gerenciar estágios." : ""}
          </div>
        )}
        {columns.map(({ stage, cards: colCards }) => (
          <ColunaDoPipeline
            key={stage.key}
            stage={stage}
            cards={colCards}
            coluna={colunas[stage.key]}
            numeros={numerosDe(stage.key)}
            dragOverKey={dragOverKey}
            setDragOverKey={setDragOverKey}
            escondidaNoCelular={stage.key !== estagioVisivel}
            membersById={membersById}
            onMoverCard={(phone, toKey) => void moveCard(phone, toKey)}
            onAbrir={(phone) => router.push(`/inbox/${encodeURIComponent(phone)}`)}
            onMoverNoCelular={setMovendo}
            carregarMais={carregarMais}
          />
        ))}
      </div>

      <StageManager
        aberto={managing}
        stages={stages}
        onClose={() => setManaging(false)}
        onAdd={addStage}
        onPatch={patchStage}
        onDelete={deleteStage}
        onMove={moveStage}
        onReorder={reorderStages}
      />

      {/* A FOLHA DE MOVER (celular). Chama o MESMO `moveCard` do arrastar:
          mesma escrita de `stage` e `stage_source='human'`, então a IA
          continua sem desfazer. Arrastar segue só no desktop.
          ⚠️ O desenho tem "Desfazer" aqui e ele NÃO entrou: é decisão pendente
          do dono (PENDENTE 3 do plano do mobile). */}
      <MoverSheet
        movendo={movendo}
        activeStages={activeStages}
        estagioDoCard={estagioDoCard}
        onFechar={() => setMovendo(null)}
        onMover={(phone, toKey) => void moveCard(phone, toKey)}
      />
    </Card>
  );
}
