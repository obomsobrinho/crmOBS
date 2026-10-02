"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import { foneDoEvento, useCanalTenant } from "@/lib/use-canal-ao-vivo";
import { foraDaLista } from "@/lib/inbox-lista";
import { useDebounce } from "@/lib/use-debounce";
import {
  PAGINA_PIPELINE,
  fontePipelineDaMemoria,
  fontePipelineDoBanco,
  paramsPipeline,
  type ContagensPipeline,
  type FontePipeline,
} from "@/lib/pipeline-fonte";
import { fetchMembers, type Member } from "@/lib/team";
import { rowToStage, type PipelineCard, type Stage, type StageRow } from "@/lib/pipeline";
import { encaixarCard, moverNosNumeros, type ColunaCarregada } from "./colunas";

const STAGE_SELECT =
  "id, key, name, position, is_canonical, is_default, archived, color";

/**
 * Os dados do funil: estágios, cards de cada coluna (10 por vez), os números do
 * banco, os membros do time, o tempo real (UM card ou UMA coluna por evento) e o
 * arrastar-soltar otimista. Quem desenha é o `PipelineBoard`.
 */
export function usePipelineDados({
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
}: {
  clientId: string;
  preview: boolean;
  initialStages: Stage[];
  inicial: { colunas: Record<string, ColunaCarregada>; contagens: ContagensPipeline };
  previewCards?: PipelineCard[];
  previewMembers: Member[];
  numeroAvisos: string | null;
  search: string;
  attFilter: string;
  soEsperando: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const supabase = useMemo(() => (preview ? null : createClient()), [preview]);

  const [stages, setStages] = useState<Stage[]>(initialStages);
  // PIPELINE PAGINADO POR COLUNA (01/10/2026, docs/plano-carregamento.md, fase
  // 5): cada coluna tem os próprios cards (10 por vez, mais ao rolar a coluna) e
  // os números vêm do banco. Antes eram até 500 conversas, todos os contatos e
  // 300 resumos, recarregados a cada mudança em qualquer conversa.
  const [colunas, setColunas] = useState<Record<string, ColunaCarregada>>(inicial.colunas);
  const [contagens, setContagens] = useState<ContagensPipeline>(inicial.contagens);
  const fonte = useMemo<FontePipeline>(
    () => (supabase ? fontePipelineDoBanco(supabase, clientId) : fontePipelineDaMemoria(previewCards ?? [])),
    [supabase, clientId, previewCards]
  );
  const fora = useMemo(() => foraDaLista(numeroAvisos), [numeroAvisos]);
  /** Todos os cards na tela, de todas as colunas (para achar um pelo telefone). */
  const cards = useMemo(() => Object.values(colunas).flatMap((c) => c.cards), [colunas]);
  const [membersById, setMembersById] = useState<Record<string, Member>>(
    Object.fromEntries(previewMembers.map((m) => [m.userId, m]))
  );

  // O recorte (estágios ativos, busca com debounce, filtros) e um ref dele
  // para o realtime e a rolagem lerem o valor atual.
  const busca = useDebounce(search.trim(), 300);
  const params = useMemo(
    () => paramsPipeline(stages, { busca, atendente: attFilter, soEsperando, fora }),
    [stages, busca, attFilter, soEsperando, fora]
  );
  const paramsRef = useRef(params);
  const colunasRef = useRef(colunas);
  useEffect(() => {
    paramsRef.current = params;
    colunasRef.current = colunas;
  });
  const versaoRef = useRef(0);

  const recontar = useCallback(async () => {
    const p = paramsRef.current;
    if (!p) return;
    try {
      setContagens(await fonte.contagens(p));
    } catch (e) {
      console.error("números do pipeline:", e);
    }
  }, [fonte]);

  /** Primeira página de TODAS as colunas (recorte novo, estágios mudaram, voltou à aba). */
  const recarregarTudo = useCallback(async () => {
    const p = paramsRef.current;
    if (!p) return;
    const v = ++versaoRef.current;
    try {
      const [listas] = await Promise.all([
        Promise.all(p.ativos.map((k) => fonte.coluna(p, k, null))),
        recontar(),
      ]);
      if (v !== versaoRef.current) return;
      setColunas(
        Object.fromEntries(
          p.ativos.map((k, i) => [k, { cards: listas[i], temMais: listas[i].length === PAGINA_PIPELINE, carregando: false }])
        )
      );
    } catch (e) {
      console.error("pipeline:", e);
    }
  }, [fonte, recontar]);

  /** A próxima página de UMA coluna (o marcador do fim dela apareceu). */
  const carregarMais = useCallback(
    async (key: string) => {
      const p = paramsRef.current;
      const col = colunasRef.current[key];
      if (!p || !col || !col.temMais || col.carregando || col.cards.length === 0) return;
      const v = versaoRef.current;
      setColunas((cs) => ({ ...cs, [key]: { ...cs[key], carregando: true } }));
      try {
        const mais = await fonte.coluna(p, key, col.cards[col.cards.length - 1]);
        if (v !== versaoRef.current) return;
        setColunas((cs) => {
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
        setColunas((cs) => ({ ...cs, [key]: { ...cs[key], carregando: false } }));
      }
    },
    [fonte]
  );

  // Trocou o recorte: primeira página de cada coluna. A primeira renderização
  // veio do servidor.
  const primeiraRef = useRef(true);
  useEffect(() => {
    if (primeiraRef.current) {
      primeiraRef.current = false;
      return;
    }
    void recarregarTudo();
  }, [params, recarregarTudo]);

  // REALTIME LINHA A LINHA: o evento anota QUAL conversa mudou; um debounce
  // junta a rajada; busca-se SÓ o card dele, que sai de onde estava e entra na
  // coluna certa. Aba escondida não busca: o canal (`useCanalTenant`) anota e
  // revalida tudo ao voltar, ao reconectar e ao voltar o foco.
  const pendentesRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processarPendentes = useCallback(async () => {
    const fones = [...pendentesRef.current];
    pendentesRef.current.clear();
    const p = paramsRef.current;
    if (!p || fones.length === 0) return;
    const v = versaoRef.current;
    try {
      const achados = await Promise.all(fones.map((f) => fonte.card(p, f).then((c) => [f, c] as const)));
      if (v !== versaoRef.current) return;
      setColunas((cs) => achados.reduce((acc, [f, c]) => encaixarCard(acc, f, c), cs));
      void recontar();
    } catch (e) {
      console.error("card do pipeline:", e);
    }
  }, [fonte, recontar]);
  const anotar = useCallback(
    (phone: string | null | undefined) => {
      if (!phone) return;
      pendentesRef.current.add(phone);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void processarPendentes(), 500);
    },
    [processarPendentes]
  );
  const refetchStages = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("pipeline_stages")
      .select(STAGE_SELECT)
      .order("position");
    if (data) setStages(data.map(rowToStage));
  }, [supabase]);

  // Realtime: conversas, contatos e resumos mudam UM card; pipeline_stages muda
  // UMA coluna (a linha do payload entra no lugar, sem reler a lista). Canal do
  // tenant compartilhado (02/10/2026, R-03/R-22). Reconectou, voltou o foco ou a
  // aba ficou para trás: recarrega as colunas e as etapas.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  useCanalTenant({
    clientId,
    ativo: !!supabase,
    tabelas: ["conversations", "dados_cliente", "conversation_qualifications", "pipeline_stages"],
    revalidar: () => {
      void recarregarTudo();
      void refetchStages();
    },
    aoEvento: (ev) => {
      if (ev.tabela !== "pipeline_stages") return anotar(foneDoEvento(ev));
      if (ev.tipo === "DELETE") {
        const id = ev.antigo?.id as number | undefined;
        if (id != null) setStages((cur) => cur.filter((st) => st.id !== id));
        return;
      }
      if (!ev.novo) return;
      const nova = rowToStage(ev.novo as StageRow);
      setStages((cur) =>
        cur.some((st) => st.id === nova.id)
          ? cur.map((st) => (st.id === nova.id ? nova : st))
          : [...cur, nova]
      );
    },
  });

  // Membros do time (para nomear o atendente de cada card).
  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const list = await fetchMembers(supabase);
      setMembersById(Object.fromEntries(list.map((m) => [m.userId, m])));
    })();
  }, [supabase]);

  const members = useMemo(() => Object.values(membersById), [membersById]);
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

      const prev = colunas;
      const prevNumeros = contagens;
      // Otimista: sai da coluna de origem, entra na de destino na ordem, e os
      // números das duas acompanham.
      setColunas((cs) => encaixarCard(cs, phone, { ...card, stage: toKey }));
      setContagens((ct) => moverNosNumeros(ct, currentKey, toKey, !!card.handoffAt));
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
        setColunas(prev); // reverte
        setContagens(prevNumeros);
        setError("não foi possível mover o card. Tente de novo.");
      }
    },
    [cards, colunas, contagens, estagioDoCard, supabase, clientId, setError]
  );

  return {
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
