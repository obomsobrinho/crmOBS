"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KanbanSquare,
  Search,
  User,
  Bot,
  Settings2,
  Plus,
  GripVertical,
  Archive,
  ArchiveRestore,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatEspera, prettyPhone } from "@/lib/format";
import {
  buildInbox,
  initials,
  avatarPair,
  type ConvRow,
  type ContatoRow,
} from "@/lib/inbox";
import { fetchMembers, memberName, memberInitials, type Member } from "@/lib/team";
import { quemAtende } from "@/lib/crm";
import QuemAtendeBadge, { quemAtendeTexto } from "./QuemAtendeBadge";
import {
  buildCards,
  lastQualByPhone,
  rowToStage,
  stageColumns,
  stageColor,
  slugifyStage,
  STAGE_COLOR_KEYS,
  type PipelineCard,
  type Stage,
  type StageRow,
  idadeEmDias,
  origemDoCard,
  resumoDaColuna,
} from "@/lib/pipeline";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AreaRolavel,
  DISSOLVER_LISTA,
} from "@/components/ui/dissolver-rolagem";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STAGE_SELECT =
  "id, key, name, position, is_canonical, is_default, archived, color";

export default function PipelineBoard({
  clientId,
  myRole,
  initialStages,
  initialCards,
  preview = false,
  previewMembers = [],
}: {
  clientId: string;
  myRole: string | null;
  initialStages: Stage[];
  initialCards: PipelineCard[];
  /** No /design (sem login) usa mocks e simula as ações em memória. */
  preview?: boolean;
  previewMembers?: Member[];
}) {
  const router = useRouter();
  const isOwner = myRole === "dono";
  const supabase = useMemo(() => (preview ? null : createClient()), [preview]);

  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [cards, setCards] = useState<PipelineCard[]>(initialCards);
  const [membersById, setMembersById] = useState<Record<string, Member>>(
    Object.fromEntries(previewMembers.map((m) => [m.userId, m]))
  );
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

  // Recarrega os cards a partir das mesmas 3 tabelas do inbox.
  const refetchCards = useCallback(async () => {
    if (!supabase) return;
    const [{ data: convs }, { data: contatos }, { data: quals }] =
      await Promise.all([
        supabase
          .from("conversations")
          .select(
            // handoff_at e stage_source entraram com o desenho de 18/09/2026:
            // o primeiro vira "Sua vez" no card e o subtítulo da coluna, o
            // segundo vira a linha de origem no pé do card.
            "phone, last_message_at, last_message_preview, last_message_from, unread_count, assigned_user_id, stage, handoff_at, stage_source"
          )
          .order("last_message_at", { ascending: false })
          .limit(500),
        supabase
          .from("dados_cliente")
          .select("telefone, nomewpp, atendimento_ia, display_name"),
        supabase
          .from("conversation_qualifications")
          .select("phone, summary")
          .order("created_at", { ascending: false })
          .limit(300),
      ]);
    const { items, ia } = buildInbox(
      (convs ?? []) as ConvRow[],
      (contatos ?? []) as ContatoRow[]
    );
    const qual = lastQualByPhone(
      (quals ?? []) as { phone: string; summary: string | null }[]
    );
    const source: Record<string, "human" | "ia" | null> = {};
    for (const c of (convs ?? []) as { phone: string; stage_source?: string | null }[])
      source[c.phone] =
        c.stage_source === "human" || c.stage_source === "ia"
          ? c.stage_source
          : null;
    setCards(buildCards(items, ia, qual, source));
  }, [supabase]);

  const refetchStages = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("pipeline_stages")
      .select(STAGE_SELECT)
      .order("position");
    if (data) setStages((data as StageRow[]).map(rowToStage));
  }, [supabase]);

  // Realtime: conversas/contatos/qualificações mudam os cards; pipeline_stages
  // muda as colunas.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("pipeline")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void refetchCards()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dados_cliente" },
        () => void refetchCards()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_qualifications" },
        () => void refetchCards()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pipeline_stages" },
        () => void refetchStages()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, refetchCards, refetchStages]);

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

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (soEsperando && !c.handoffAt) return false;
      if (attFilter === "none" && c.assignedUserId) return false;
      if (attFilter !== "all" && attFilter !== "none" && c.assignedUserId !== attFilter)
        return false;
      if (q) {
        const name = (c.name ?? "").toLowerCase();
        if (!name.includes(q) && !c.phone.includes(q)) return false;
      }
      return true;
    });
  }, [cards, search, attFilter, soEsperando]);

  // Conta sobre TODOS os cards, não sobre os filtrados: o número no botão diz
  // quantas conversas esperam você no funil inteiro, e ele não pode encolher
  // porque alguém filtrou por atendente.
  const esperandoCount = useMemo(
    () => cards.filter((c) => c.handoffAt).length,
    [cards]
  );

  const columns = useMemo(() => {
    const cols = stageColumns(stages, filteredCards);
    return stageFilter === "all"
      ? cols
      : cols.filter((c) => c.stage.key === stageFilter);
  }, [stages, filteredCards, stageFilter]);

  const shownCount = useMemo(
    () => columns.reduce((n, c) => n + c.cards.length, 0),
    [columns]
  );

  // Move o card para outro estágio (arrastar-soltar). Marca stage_source=human
  // (a IA nunca sobrescreve um estágio definido por humano).
  const moveCard = useCallback(
    async (phone: string, toKey: string) => {
      const card = cards.find((c) => c.phone === phone);
      if (!card) return;
      const defaultKey = activeStages.find((s) => s.isDefault)?.key ?? null;
      const currentKey =
        card.stage && activeStages.some((s) => s.key === card.stage)
          ? card.stage
          : defaultKey;
      if (currentKey === toKey) return;

      const prev = cards;
      setCards((list) =>
        list.map((c) => (c.phone === phone ? { ...c, stage: toKey } : c))
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
        setCards(prev); // reverte
        setError("não foi possível mover o card. Tente de novo.");
      }
    },
    [cards, activeStages, supabase, clientId]
  );

  // ---- Gestão de estágios (dono) ----
  const takenKeys = useMemo(() => stages.map((s) => s.key), [stages]);

  const addStage = useCallback(
    async (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      const key = slugifyStage(clean, takenKeys);
      const position = stages.reduce((m, s) => Math.max(m, s.position), -1) + 1;
      if (!supabase) {
        setStages((s) => [
          ...s,
          {
            id: -Date.now(),
            key,
            name: clean,
            position,
            isCanonical: false,
            isDefault: false,
            archived: false,
            color: "gray",
          },
        ]);
        return;
      }
      const { error: err } = await supabase.from("pipeline_stages").insert({
        client_id: clientId,
        key,
        name: clean,
        position,
        color: "gray",
      });
      if (err) setError("não foi possível criar o estágio.");
      else await refetchStages();
    },
    [stages, takenKeys, supabase, clientId, refetchStages]
  );

  /**
   * Apaga um estágio ARQUIVADO de vez.
   *
   * ⚠️ QUEM PROTEGE É O BANCO, e não uma checagem daqui: a FK
   * `conversations_stage_fkey` não tem `ON DELETE`, então apagar um estágio que
   * ainda tem card no funil é recusado pelo Postgres. Não há como perder
   * conversa por acidente, e por isso o erro vira frase em vez de guarda
   * duplicada, que é o tipo de regra que diverge do banco na primeira mudança.
   *
   * ⚠️ Só no ARQUIVADO. Apagar direto da coluna viva seria um clique entre a
   * pessoa e um estágio que some sem volta; arquivar primeiro é o passo que
   * torna a decisão deliberada, e o botão de restaurar fica ali do lado.
   */
  const deleteStage = useCallback(
    async (id: number) => {
      if (!supabase) {
        setStages((s) => s.filter((st) => st.id !== id));
        return;
      }
      const { error: err } = await supabase
        .from("pipeline_stages")
        .delete()
        .eq("id", id);
      if (err) {
        setError(
          "não foi possível apagar: o estágio ainda tem conversa nele. Mova os cards e tente de novo."
        );
        return;
      }
      await refetchStages();
    },
    [supabase, refetchStages]
  );

  const patchStage = useCallback(
    async (id: number, patch: Partial<StageRow>) => {
      if (!supabase) {
        setStages((s) =>
          s.map((st) =>
            st.id === id
              ? {
                  ...st,
                  name: patch.name ?? st.name,
                  color: patch.color ?? st.color,
                  position: patch.position ?? st.position,
                  archived: patch.archived ?? st.archived,
                }
              : st
          )
        );
        return;
      }
      const { error: err } = await supabase
        .from("pipeline_stages")
        .update(patch)
        .eq("id", id);
      if (err) setError("não foi possível salvar o estágio.");
      else await refetchStages();
    },
    [supabase, refetchStages]
  );

  // Reordena trocando a posição com o vizinho (entre os não arquivados).
  const moveStage = useCallback(
    async (id: number, dir: -1 | 1) => {
      const ordered = [...activeStages];
      const i = ordered.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ordered.length) return;
      const a = ordered[i];
      const b = ordered[j];
      if (!supabase) {
        setStages((s) =>
          s.map((st) =>
            st.id === a.id
              ? { ...st, position: b.position }
              : st.id === b.id
                ? { ...st, position: a.position }
                : st
          )
        );
        return;
      }
      const r1 = await supabase
        .from("pipeline_stages")
        .update({ position: b.position })
        .eq("id", a.id);
      const r2 = await supabase
        .from("pipeline_stages")
        .update({ position: a.position })
        .eq("id", b.id);
      if (r1.error || r2.error) setError("não foi possível reordenar.");
      await refetchStages();
    },
    [activeStages, supabase, refetchStages]
  );

  // Reordena por ARRASTE: tira o estágio de onde está, põe no índice do alvo e
  // reescreve as posições em sequência.
  //
  // Reescrever a lista toda, em vez de trocar duas posições como o `moveStage`
  // faz, é o que permite arrastar para qualquer lugar de uma vez, e ainda
  // normaliza posições que ficaram com buraco depois de arquivar um estágio.
  // `moveStage` CONTINUA existindo: virou o caminho de teclado (setas no punho de
  // arraste), porque arraste nativo do HTML não é operável por teclado, e trocar
  // as setas por arraste sem isso deixaria a tela inoperável para quem não usa
  // mouse.
  const reorderStages = useCallback(
    async (fromId: number, toId: number) => {
      if (fromId === toId) return;
      const ordered = [...activeStages];
      const de = ordered.findIndex((s) => s.id === fromId);
      const para = ordered.findIndex((s) => s.id === toId);
      if (de < 0 || para < 0) return;
      const [movido] = ordered.splice(de, 1);
      ordered.splice(para, 0, movido);

      const novaPos = new Map(ordered.map((s, i) => [s.id, i] as const));
      // Otimista: no /design é o estado final, e em produção tira a espera do
      // refetch de cima do arraste.
      setStages((s) =>
        s.map((st) =>
          novaPos.has(st.id) ? { ...st, position: novaPos.get(st.id)! } : st
        )
      );
      if (!supabase) return;
      const res = await Promise.all(
        ordered.map((s, i) =>
          supabase.from("pipeline_stages").update({ position: i }).eq("id", s.id)
        )
      );
      if (res.some((r) => r.error)) setError("não foi possível reordenar.");
      await refetchStages();
    },
    [activeStages, supabase, refetchStages]
  );

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="mr-1 flex items-center gap-2">
          <KanbanSquare size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Pipeline</h1>
          <span className="text-legenda tabular-nums text-ink-3">{shownCount}</span>
        </div>

        {/* Mesmo campo com lupa da lista de conversas: moldura no degrau de
            controle, ícone em tinta fraca e o Input sem moldura própria. */}
        <div className="flex h-[var(--h-control)] items-center gap-2 rounded-lg border border-line bg-[var(--input-bg)] px-3 transition-colors focus-within:border-brand-line">
          <Search size={15} className="shrink-0 text-ink-faint" />
          <Input
            variant="limpo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome ou telefone"
            aria-label="Buscar cards"
            className="w-44 text-apoio"
          />
        </div>

        <Select value={attFilter} onValueChange={setAttFilter}>
          <SelectTrigger aria-label="Filtrar por atendente">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os atendentes</SelectItem>
            <SelectItem value="none">Sem atendente</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>
                {memberName(m.email)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger aria-label="Filtrar por estágio">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estágios</SelectItem>
            {activeStages.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* "Esperando você", com a contagem (desenho de 18/09/2026). Fica ao lado
            dos outros recortes porque é o mesmo gesto, e some quando não há
            nenhum: um filtro que sempre mostra zero só ocupa espaço. */}
        {esperandoCount > 0 && (
          <Button
            variant="outline"
            onClick={() => setSoEsperando((v) => !v)}
            aria-pressed={soEsperando}
            className={cn(
              "gap-1.5 text-warn-ink",
              soEsperando
                ? "border-warn-line bg-warn-surface"
                : "hover:bg-warn-surface"
            )}
          >
            Esperando você
            <span className="tabular-nums">{esperandoCount}</span>
          </Button>
        )}

        {isOwner && (
          <Button
            variant="outline"
            onClick={() => setManaging(true)}
            className="ml-auto"
          >
            <Settings2 size={15} /> Gerenciar estágios
          </Button>
        )}
      </div>

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

      {/* Colunas */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {columns.length === 0 && (
          <div className="m-auto text-apoio text-ink-3">
            Nenhum estágio ativo. {isOwner ? "Crie um em Gerenciar estágios." : ""}
          </div>
        )}
        {columns.map(({ stage, cards: colCards }) => {
          const over = dragOverKey === stage.key;
          return (
            // `bg-msg`: a coluna é a bandeja recuada e o card é o que sobe
            // dentro dela. Antes coluna e página dividiam `--surface`, então no
            // escuro a coluna sumia no fundo e o card é que era o poço escuro,
            // que é a hierarquia ao contrário.
            <div
              key={stage.key}
              // Marcadores para o e2e. A coluna não tinha como ser encontrada a
              // não ser por classe de layout, e teste preso a classe quebra na
              // primeira mudança de estilo sem que nada de verdade tenha
              // quebrado.
              data-slot="pipeline-coluna"
              data-stage={stage.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverKey !== stage.key) setDragOverKey(stage.key);
              }}
              onDragLeave={(e) => {
                // só limpa se saiu de fato da coluna (não ao passar por um filho)
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setDragOverKey((k) => (k === stage.key ? null : k));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const phone = e.dataTransfer.getData("text/plain");
                setDragOverKey(null);
                if (phone) void moveCard(phone, stage.key);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl border bg-msg transition-colors ${
                over
                  ? "border-brand-ink ring-1 ring-[var(--brand-ink)]"
                  : "border-line"
              }`}
            >
              <div className="border-b border-line px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: stageColor(stage.color) }}
                    aria-hidden
                  />
                  <span className="truncate text-apoio font-semibold">
                    {stage.name}
                  </span>
                  <span className="ml-auto text-legenda tabular-nums text-ink-3">
                    {colCards.length}
                  </span>
                </div>
                {/* Subtítulo da coluna (desenho de 18/09/2026): quantos esperam
                    você e há quanto tempo está o mais parado. É o que transforma
                    uma pilha de cards em "onde o funil travou", que é a pergunta
                    que a tela existe para responder. Some sozinho quando não há o
                    que dizer, em vez de virar uma linha vazia em toda coluna. */}
                {(() => {
                  const resumo = resumoDaColuna(colCards);
                  return resumo ? (
                    <div
                      data-slot="pipeline-coluna-resumo"
                      className="mt-0.5 truncate text-legenda text-ink-3"
                      suppressHydrationWarning
                    >
                      {resumo}
                    </div>
                  ) : null;
                })()}
              </div>
              {/* Regra da casa: area rolavel dissolve nas bordas. Degrau de
                  LISTA, porque o item aqui e um card de tres linhas.
                  ⚠️ COMPONENTE e nao o hook: esta area e UMA POR ESTAGIO, e
                  chamar o hook dentro do map seria hook em laco. */}
              <AreaRolavel
                tamanho={DISSOLVER_LISTA}
                className="flex min-h-0 flex-1 flex-col gap-2 p-2"
              >
                {colCards.length === 0 && (
                  // "Nenhuma conversa aqui" e não "Vazio": vazio descreve a caixa,
                  // a frase descreve o funil, e é o funil que a pessoa está lendo.
                  <div className="px-2 py-6 text-center text-legenda text-ink-3">
                    Nenhuma conversa aqui
                  </div>
                )}
                {colCards.map((c) => (
                  <CardItem
                    key={c.phone}
                    card={c}
                    member={c.assignedUserId ? membersById[c.assignedUserId] : null}
                    onOpen={() =>
                      router.push(`/inbox/${encodeURIComponent(c.phone)}`)
                    }
                  />
                ))}
              </AreaRolavel>
            </div>
          );
        })}
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
    </Card>
  );
}

function CardItem({
  card,
  member,
  onOpen,
}: {
  card: PipelineCard;
  member: Member | null | undefined;
  onOpen: () => void;
}) {
  const label = card.name || prettyPhone(card.phone);
  const ini = initials(card.name);
  const preview = card.lastPreview.replace(/ | /g, "  ");
  // "Pessoa atendendo" não desenha marca própria: o avatar do responsável, que
  // já aparece no card, diz quem é e com nome.
  const quem = quemAtende({ pausada: card.paused, temAtendente: !!member });
  const idade = idadeEmDias(card.lastMessageAt);
  return (
    <div
      draggable
      data-slot="pipeline-card"
      data-phone={card.phone}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.phone);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      // `cursor-grab` e não `cursor-pointer`: o card é arrastável, e a mãozinha
      // aberta é o que diz isso antes de a pessoa tentar. Ele também abre a
      // conversa no clique, mas arrastar é a ação que precisa de aviso, porque
      // ninguém descobre arraste por acaso.
      className="cursor-grab rounded-lg border border-line bg-raised p-3 transition-colors hover:border-line-strong active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <Avatar size="xs" style={avatarPair(card.phone)}>
            {ini ?? <User size={14} />}
          </Avatar>
          {/* Mesma regra (`quemAtende`, lib/crm) E mesmo desenho
              (`QuemAtendeBadge`) da lista de conversas, para as duas telas não
              discordarem sobre o mesmo contato nem no dado nem no pixel. */}
          {quem !== "pessoa" && (
            <span title={quemAtendeTexto(quem)}>
              <QuemAtendeBadge quem={quem} tamanho="sm" />
            </span>
          )}
        </div>
        <span className="min-w-0 flex-1 truncate text-apoio font-medium">
          {label}
        </span>
        {card.unread > 0 && (
          <Badge variant="nao-lidas">
            {card.unread > 99 ? "99+" : card.unread}
          </Badge>
        )}
        {/* IDADE, e não hora do relógio (desenho de 18/09/2026). Num quadro de
            funil o que importa é "parado há quanto tempo", e "17:36" não conta
            isso: o card de 12 dias e o de hoje mostravam a mesma coisa. */}
        {idade && (
          <span
            className="shrink-0 text-legenda tabular-nums text-ink-3"
            suppressHydrationWarning
          >
            {idade}
          </span>
        )}
      </div>

      {/* Resumo da IA em tinta NORMAL, não em âmbar. Ele acende sempre que existe
          uma qualificação, para sempre e em qualquer estágio, então pintá-lo de
          âmbar dizia "pendência" num card que podia estar fechado há semanas.
          Âmbar ficou reservado para handoff em aberto, que é pendência de fato. */}
      {card.summary ? (
        <div className="mt-2 flex items-start gap-1 text-legenda text-ink-2">
          <Bot size={12} className="mt-0.5 shrink-0 text-ink-3" />
          <span className="line-clamp-2">{card.summary}</span>
        </div>
      ) : (
        <div className="mt-2 truncate text-legenda text-ink-2">
          {card.lastFrom === "out" ? `Você: ${preview}` : preview}
        </div>
      )}

      {/* "Sua vez": handoff em aberto, o único âmbar do card.
          ⚠️ O desenho traz aqui uma frase por card dizendo o que fazer ("Cobrar
          o retorno ou mover para Fechado") e, nos cards sem handoff, o que a IA
          está fazendo ("está montando o orçamento pela tabela"). Esse texto NÃO
          existe no banco: `conversation_qualifications` guarda action, summary e
          preferência de horário, e nada disso vira instrução em prosa. Escrever
          uma frase plausível ali seria inventar o estado da conversa na tela em
          que o time decide o que fazer. Fica só o rótulo, que é verdade. */}
      {card.handoffAt && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-warn-line bg-warn-surface px-2 py-1 text-legenda text-warn-ink">
          <Bot size={11} className="shrink-0 opacity-80" />
          <span className="shrink-0 font-medium">Sua vez</span>
          {/* A ESPERA vem do mesmo `formatEspera` da lista de conversas: as duas
              telas falam do mesmo contato e não podem discordar no número. */}
          <span className="truncate tabular-nums" suppressHydrationWarning>
            · {formatEspera(card.handoffAt)} esperando
          </span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-legenda text-ink-3">
          {origemDoCard(card.stageSource)}
        </span>
        {member && (
          <span
            title={`Atendente: ${memberName(member.email)}`}
            className="flex shrink-0 items-center gap-1 text-legenda text-ink-3"
          >
            <Avatar size="3xs" style={avatarPair(member.email)}>
              {memberInitials(member.email).slice(0, 1)}
            </Avatar>
            {memberName(member.email)}
          </span>
        )}
      </div>
    </div>
  );
}

function StageManager({
  aberto,
  stages,
  onClose,
  onAdd,
  onPatch,
  onDelete,
  onMove,
  onReorder,
}: {
  aberto: boolean;
  stages: Stage[];
  onClose: () => void;
  onAdd: (name: string) => void;
  onPatch: (id: number, patch: Partial<StageRow>) => void;
  onDelete: (id: number) => void;
  /** Caminho de teclado: sobe ou desce um lugar. */
  onMove: (id: number, dir: -1 | 1) => void;
  /** Caminho de mouse: solta o arrastado na posição do alvo. */
  onReorder: (fromId: number, toId: number) => void;
}) {
  const [newName, setNewName] = useState("");
  // Quem está sendo arrastado e sobre quem ele está. O segundo existe só para
  // desenhar a linha de inserção: sem retorno visual, arrastar é adivinhação.
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const ordered = [...stages]
    .filter((s) => !s.archived)
    .sort((a, b) => a.position - b.position);
  const archived = stages.filter((s) => s.archived);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent tamanho="gestao">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings2 size={18} className="text-brand-ink" />
            <DialogTitle>Estágios do pipeline</DialogTitle>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-chrome" aria-label="Fechar">
              <X size={18} />
            </Button>
          </DialogClose>
        </div>

        <AreaRolavel className="flex min-h-0 flex-1 flex-col gap-4 p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd(newName);
              setNewName("");
            }}
            className="flex gap-2"
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Novo estágio (ex.: Proposta enviada)"
              aria-label="Nome do novo estágio"
              maxLength={40}
              className="flex-1"
            />
            <Button type="submit" size="field" disabled={!newName.trim()}>
              <Plus size={15} /> Criar
            </Button>
          </form>

          <ul className="flex flex-col gap-2">
            {ordered.map((s, i) => (
              <StageRowItem
                key={s.id}
                stage={s}
                canUp={i > 0}
                canDown={i < ordered.length - 1}
                onMove={onMove}
                onPatch={onPatch}
                arrastando={arrastando === s.id}
                alvo={sobre === s.id && arrastando !== null && arrastando !== s.id}
                onDragStart={() => setArrastando(s.id)}
                onDragEnter={() => setSobre(s.id)}
                onDragEnd={() => {
                  setArrastando(null);
                  setSobre(null);
                }}
                onDropOn={() => {
                  if (arrastando !== null) onReorder(arrastando, s.id);
                  setArrastando(null);
                  setSobre(null);
                }}
              />
            ))}
          </ul>

          {archived.length > 0 && (
            <div>
              <div className="mb-2 text-rotulo uppercase text-ink-3">
                Arquivados
              </div>
              <ul className="flex flex-col gap-2">
                {archived.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-bloco px-3 py-2"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full opacity-60"
                      style={{ background: stageColor(s.color) }}
                    />
                    <span className="flex-1 truncate text-apoio text-ink-2">
                      {s.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="chrome"
                      onClick={() => onPatch(s.id, { archived: false })}
                    >
                      <ArchiveRestore size={13} /> Restaurar
                    </Button>
                    {/* ⚠️ APAGAR DE VEZ (21/09/2026, pedido do dono: o funil
                        dele estava com dezenas de "Teste e2e ... renomeado"
                        arquivados e sem como sumir). Arquivar tirava da tela e
                        deixava para sempre nesta lista, que virou depósito.
                        Só aqui, no arquivado, e nunca na coluna viva: arquivar
                        primeiro é o que torna a decisão deliberada. */}
                    <Button
                      variant="danger-ghost"
                      size="icon-chrome"
                      aria-label={`Apagar ${s.name}`}
                      title="Apagar de vez"
                      onClick={() => onDelete(s.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogDescription className="text-legenda text-ink-3">
            Os estágios Novo, Qualificado e Aguardando atendimento são usados pela
            IA para mover o card sozinha. Você pode renomeá-los e reordená-los.
          </DialogDescription>
        </AreaRolavel>
      </DialogContent>
    </Dialog>
  );
}

function StageRowItem({
  stage,
  canUp,
  canDown,
  onMove,
  onPatch,
  arrastando,
  alvo,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDropOn,
}: {
  stage: Stage;
  canUp: boolean;
  canDown: boolean;
  onMove: (id: number, dir: -1 | 1) => void;
  onPatch: (id: number, patch: Partial<StageRow>) => void;
  arrastando: boolean;
  alvo: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}) {
  const [name, setName] = useState(stage.name);

  function commitName() {
    const clean = name.trim();
    if (clean && clean !== stage.name) onPatch(stage.id, { name: clean });
    else setName(stage.name);
  }

  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // O HTML exige carga no dataTransfer para o arraste começar no Firefox.
        e.dataTransfer.setData("text/plain", String(stage.id));
        onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn();
      }}
      // A linha inteira é arrastável, então a mãozinha é dela também, e não só
      // do punho: quem pega a linha pela borda não descobria que dava para
      // arrastar. O punho segue existindo para dizer ONDE pegar e para operar por
      // teclado.
      className={`flex cursor-grab items-center gap-2 rounded-lg border bg-bloco px-2 py-2 transition-colors active:cursor-grabbing ${
        arrastando ? "opacity-50" : ""
      } ${alvo ? "border-brand-ink ring-1 ring-[var(--brand-ink)]" : "border-line"}`}
    >
      {/* Punho de arraste. Substituiu as duas setas, mas ELE mesmo responde a
          seta para cima e para baixo: arraste nativo do HTML não funciona por
          teclado, e trocar as setas por arraste puro tiraria a reordenação de
          quem não usa mouse. Um controle, dois jeitos de operar. */}
      <Button
        variant="ghost"
        size="none"
        aria-label={`Reordenar ${stage.name}. Arraste, ou use as setas para cima e para baixo.`}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" && canUp) {
            e.preventDefault();
            onMove(stage.id, -1);
          } else if (e.key === "ArrowDown" && canDown) {
            e.preventDefault();
            onMove(stage.id, 1);
          }
        }}
        className="cursor-grab rounded p-1 text-ink-3 active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </Button>

      {/* Amostra de cor, não botão do sistema: aqui a cor É o conteúdo, então
          nenhuma variante do Button se aplica (todas pintariam por cima). */}
      <button
        type="button"
        aria-label="Trocar cor"
        title="Trocar cor"
        onClick={() => {
          const i = STAGE_COLOR_KEYS.indexOf(stage.color);
          const next = STAGE_COLOR_KEYS[(i + 1) % STAGE_COLOR_KEYS.length];
          onPatch(stage.id, { color: next });
        }}
        className="h-4 w-4 shrink-0 rounded-full ring-1 ring-line"
        style={{ background: stageColor(stage.color) }}
      />

      <Input
        variant="limpo"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        maxLength={40}
        className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-apoio transition-colors hover:border-line"
      />

      {stage.isDefault ? (
        <span className="shrink-0 rounded-full bg-[var(--active-bg)] px-2 py-0.5 text-legenda text-ink-2">
          default
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon-chrome"
          onClick={() => onPatch(stage.id, { archived: true })}
          aria-label="Arquivar estágio"
          title="Arquivar"
        >
          <Archive size={14} />
        </Button>
      )}
    </li>
  );
}
