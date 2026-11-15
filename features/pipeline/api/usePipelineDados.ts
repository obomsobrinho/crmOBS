"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { foraDaLista } from "@/lib/inbox-lista";
import { invalidarComAtraso } from "@/lib/query/invalidar";
import { FRESCO_CONFIG_MS } from "@/lib/query/cliente";
import { useDebounce } from "@/lib/use-debounce";
import {
  CONTAGENS_PIPELINE_VAZIAS,
  PAGINA_PIPELINE,
  fontePipelineDaMemoria,
  paramsPipeline,
  primeirasColunas,
  type ContagensPipeline,
  type FontePipeline,
} from "./fonte";
import { fontePipelineDoNavegador } from "./sincronizar";
import { chavesDePipeline, type RecorteDoQuadro } from "./chaves";
import { fetchMembers, type Member } from "@/lib/team";
import { rowToStage, type PipelineCard, type Stage } from "@/lib/pipeline";
import { encaixarCard, moverNosNumeros, type ColunaCarregada } from "../components/colunas";

const STAGE_SELECT =
  "id, key, name, position, is_canonical, is_default, archived, color";

/**
 * Os dados do funil: estágios, cards de cada coluna (10 por vez), os números do
 * banco, os membros do time e o arrastar-soltar otimista. Quem desenha é o
 * `PipelineBoard`.
 *
 * Passo 3b de docs/plano-dados-e-estado.md: tudo mora no cache de dados, lido do
 * navegador pelo RLS (a página não lê nada no servidor, D8). O quadro (a primeira
 * página de cada coluna, e o que a rolagem acrescentou) é UMA chave por recorte; o
 * tempo real (UM card por evento, UMA linha de estágio por evento) chega pela ponte do
 * layout (`ponte.ts`), nunca daqui. A interface devolvida é a de antes, para o quadro
 * e as colunas não mudarem.
 */
export function usePipelineDados({
  clientId,
  preview,
  initialStages,
  previewCards,
  previewMembers,
  numeroAvisos,
  search,
  attFilter,
  soEsperando,
  setError,
}: {
  clientId: string;
  preview: boolean;
  /** /design: os estágios falsos (a página de verdade lê do banco). */
  initialStages: Stage[];
  previewCards?: PipelineCard[];
  previewMembers: Member[];
  numeroAvisos: string | null;
  search: string;
  attFilter: string;
  soEsperando: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const qc = useQueryClient();
  const supabase = useMemo(() => (preview ? null : createClient()), [preview]);
  const fonte = useMemo<FontePipeline>(
    () => (supabase ? fontePipelineDoNavegador(clientId) : fontePipelineDaMemoria(previewCards ?? [])),
    [supabase, clientId, previewCards]
  );
  const fora = useMemo(() => foraDaLista(numeroAvisos), [numeroAvisos]);

  // ESTÁGIOS: configuração (muda pouco); o realtime põe a linha que mudou (ponte).
  const estagiosQ = useQuery({
    queryKey: chavesDePipeline.estagios(),
    queryFn: async (): Promise<Stage[]> => {
      if (!supabase) return initialStages;
      const { data, error } = await supabase.from("pipeline_stages").select(STAGE_SELECT).order("position");
      if (error) throw error;
      return (data ?? []).map(rowToStage);
    },
    initialData: preview ? initialStages : undefined,
    staleTime: FRESCO_CONFIG_MS,
  });
  const stages = useMemo(() => estagiosQ.data ?? [], [estagiosQ.data]);
  const setStages = useCallback<Dispatch<SetStateAction<Stage[]>>>(
    (u) => qc.setQueryData<Stage[]>(chavesDePipeline.estagios(), (cur) => (typeof u === "function" ? u(cur ?? []) : u)),
    [qc]
  );
  const refetchStages = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: chavesDePipeline.estagios() });
  }, [qc]);

  // O RECORTE: estágios ativos, busca com debounce e filtros.
  const busca = useDebounce(search.trim(), 300);
  const params = useMemo(
    () => paramsPipeline(stages, { busca, atendente: attFilter, soEsperando, fora }),
    [stages, busca, attFilter, soEsperando, fora]
  );
  const recorte = useMemo<RecorteDoQuadro>(
    () => ({ busca, atendente: attFilter, soEsperando, colunas: params ? `${params.ativos.join(",")}|${params.padrao}` : "" }),
    [busca, attFilter, soEsperando, params]
  );
  const chaveDoQuadro = chavesDePipeline.quadro(recorte);

  // O QUADRO: a primeira página de cada coluna; a rolagem acrescenta na mesma chave.
  const quadroQ = useQuery({
    queryKey: chaveDoQuadro,
    queryFn: async () => (await primeirasColunas(fonte, params)).colunas,
    enabled: params != null,
    placeholderData: keepPreviousData,
  });
  const contagensQ = useQuery({
    queryKey: chavesDePipeline.contagem(recorte),
    queryFn: () => (params ? fonte.contagens(params) : Promise.resolve(CONTAGENS_PIPELINE_VAZIAS)),
    enabled: params != null,
    placeholderData: keepPreviousData,
  });
  const colunas = useMemo<Record<string, ColunaCarregada>>(() => quadroQ.data ?? {}, [quadroQ.data]);
  const contagens: ContagensPipeline = contagensQ.data ?? CONTAGENS_PIPELINE_VAZIAS;
  /** Todos os cards na tela, de todas as colunas (para achar um pelo telefone). */
  const cards = useMemo(() => Object.values(colunas).flatMap((c) => c.cards), [colunas]);

  // MEMBROS do time (para nomear o atendente de cada card). Configuração.
  const membrosQ = useQuery({
    queryKey: chavesDePipeline.membros(),
    queryFn: () => (supabase ? fetchMembers(supabase) : Promise.resolve(previewMembers)),
    initialData: preview ? previewMembers : undefined,
    staleTime: FRESCO_CONFIG_MS,
  });
  const members = useMemo(() => membrosQ.data ?? [], [membrosQ.data]);
  const membersById = useMemo<Record<string, Member>>(() => Object.fromEntries(members.map((m) => [m.userId, m])), [members]);

  /** A próxima página de UMA coluna (o marcador do fim dela apareceu), na chave do quadro. */
  const [carregandoMais, setCarregandoMais] = useState<Record<string, boolean>>({});
  const carregarMais = useCallback(
    async (key: string) => {
      const col = colunas[key];
      if (!params || !col || !col.temMais || col.carregando || carregandoMais[key] || col.cards.length === 0) return;
      const chave = chaveDoQuadro;
      setCarregandoMais((c) => ({ ...c, [key]: true }));
      qc.setQueryData<Record<string, ColunaCarregada>>(chave, (cs) => cs && { ...cs, [key]: { ...cs[key], carregando: true } });
      try {
        const mais = await fonte.coluna(params, key, col.cards[col.cards.length - 1]);
        qc.setQueryData<Record<string, ColunaCarregada>>(chave, (cs) => {
          if (!cs?.[key]) return cs;
          const atual = cs[key];
          const vistos = new Set(atual.cards.map((c) => c.phone));
          return {
            ...cs,
            [key]: {
              cards: [...atual.cards, ...mais.filter((c) => !vistos.has(c.phone))],
              temMais: mais.length === PAGINA_PIPELINE,
              carregando: false,
            },
          };
        });
      } catch (e) {
        console.error("mais cards:", e);
        qc.setQueryData<Record<string, ColunaCarregada>>(chave, (cs) => cs?.[key] && { ...cs, [key]: { ...cs[key], carregando: false } });
      } finally {
        setCarregandoMais((c) => ({ ...c, [key]: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave do quadro nasce do recorte
    [colunas, params, recorte, fonte, qc, carregandoMais]
  );

  const activeStages = useMemo(
    () =>
      stages.filter((s) => !s.archived).sort((a, b) => a.position - b.position),
    [stages]
  );

  // Estágio em que o card está AGORA, com a mesma regra do `moveCard` (sem
  // estágio, ou estágio arquivado, conta como o padrão).
  const estagioDoCard = useCallback(
    (card: PipelineCard) => {
      const defaultKey = activeStages.find((s) => s.isDefault)?.key ?? null;
      return card.stage && activeStages.some((s) => s.key === card.stage)
        ? card.stage
        : defaultKey;
    },
    [activeStages]
  );

  const moveCard = useCallback(
    async (phone: string, toKey: string) => {
      const card = cards.find((c) => c.phone === phone);
      if (!card) return;
      const currentKey = estagioDoCard(card);
      if (currentKey === toKey) return;

      // Otimista (2.6): sai da coluna de origem, entra na de destino na ordem, e os
      // números das duas acompanham, em todo quadro e todo número guardado.
      qc.setQueriesData<Record<string, ColunaCarregada>>({ queryKey: chavesDePipeline.quadros() }, (cs) =>
        cs ? encaixarCard(cs, phone, { ...card, stage: toKey }) : cs
      );
      qc.setQueriesData<ContagensPipeline>({ queryKey: chavesDePipeline.contagens() }, (ct) =>
        ct ? moverNosNumeros(ct, currentKey, toKey, !!card.handoffAt) : ct
      );
      if (!supabase) return; // preview: só memória
      const { error: err } = await supabase
        .from("conversations")
        .update({
          stage: toKey,
          stage_source: "human",
          stage_changed_at: new Date().toISOString(),
        })
        .eq("client_id", clientId)
        .eq("phone", phone);
      if (err) {
        // A recusa diz o motivo e a releitura traz o card de volta (2.6): nunca restaura
        // uma cópia do quadro inteiro, que apagaria outros movimentos em andamento.
        setError("não foi possível mover o card. Tente de novo.");
        invalidarComAtraso(qc, chavesDePipeline.quadros());
        invalidarComAtraso(qc, chavesDePipeline.contagens());
      }
    },
    [cards, estagioDoCard, supabase, clientId, setError, qc]
  );

  return {
    /**
     * Primeira leitura ainda a caminho (estágios, ou o quadro com estágios ativos): a
     * tela mostra a moldura, nunca "Nenhum estágio" nem "Nenhuma conversa aqui" de mentira.
     */
    carregandoInicio: estagiosQ.isPending || (params != null && quadroQ.data === undefined),
    /** O quadro do recorte atual já chegou (o primeiro desenho e a cada recorte novo). */
    quadroPronto: quadroQ.data !== undefined && !quadroQ.isPlaceholderData && !contagensQ.isPlaceholderData,
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
  };
}
