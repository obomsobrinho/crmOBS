"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, HandHelping } from "lucide-react";
import MessageComposer, { type OutgoingMedia } from "./MessageComposer";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { createClient } from "@/lib/supabase/client";
import { formatEspera, formatTime, prettyPhone } from "@/lib/format";
import { ESPERA_AVISO_MS } from "@/lib/painel";
import {
  mensagensDeContexto,
  montarFila,
  type ContatoLinha,
  type MensagemContexto,
  type PedidoAberto,
  type PedidoLinha,
} from "@/lib/pedidos";
import { cn } from "@/lib/utils";

// PEDIDOS ABERTOS (29/09/2026, docs/plano-pedidos.md, aprovado pelo dono).
//
// Todos os pedidos de ajuda da IA ainda sem resposta, de todas as conversas,
// do MAIS ANTIGO para o mais novo. Clicar na linha abre o contexto (as últimas
// mensagens) e a MESMA caixa de escrita da conversa, com as três saídas.
//
// ⚠️ NENHUM CAMINHO NOVO para fechar pedido. Orientar é `POST
// /api/conversations/orientar`, Responder é `POST /api/send` com `pedidoId`, e
// Resolvido é `POST /api/conversations/resolve`: as mesmas três rotas da
// conversa, que passam por `fecharPedido`. Uma quarta porta seria a primeira a
// esquecer de recalcular a espera ou de devolver a IA.
//
// ⚠️ A CAIXA É O `MessageComposer`, não uma parecida (decisão do dono na
// bancada: "mostrar de um jeito na montagem e de outro quando funcionar não é
// bom"). Nota interna fica de fora: sem `onAddNote`, a opção não aparece.

type Resultado = { tom: "ok" | "aviso" | "erro"; texto: string };

const SEM_SERVIDOR: Resultado = { tom: "erro", texto: "Não foi possível contatar o servidor." };

/** POST com JSON. `null` = a rede falhou (a tela diz isso, em vez de ficar muda). */
async function postar(url: string, corpo: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  } catch {
    return null;
  }
}

export default function PedidosAbertos({
  initialPedidos,
  initialContatos,
  numeroAvisos,
  clientId,
  readOnly = false,
  abrirId = null,
  preview = false,
  contextoPreview,
}: {
  initialPedidos: PedidoLinha[];
  initialContatos: ContatoLinha[];
  /** Destino dos avisos: esse número nunca é pedido (lib/avisos.ts). */
  numeroAvisos: string | null;
  clientId: string;
  /** Conta bloqueada: vê a fila, não age (as rotas já respondem 402). */
  readOnly?: boolean;
  /** `?abrir=` do link do aviso: a linha que já nasce aberta. */
  abrirId?: number | null;
  /** /design: sem banco, e as ações só simulam. */
  preview?: boolean;
  contextoPreview?: Record<string, MensagemContexto[]>;
}) {
  const supabase = useMemo(() => (preview ? null : createClient()), [preview]);
  const [pedidos, setPedidos] = useState(initialPedidos);
  const [contatos, setContatos] = useState(initialContatos);
  const [aberto, setAberto] = useState<number | null>(abrirId);
  // O que aconteceu com o pedido depois da ação, por alguns segundos, antes de
  // ele sair da lista. Fica fora da fila: o pedido já foi fechado no banco.
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // "Agora" do cálculo da espera, fixado a cada carga e a cada minuto: ler
  // `Date.now()` no render é impuro, e a espera é grossa (minutos, horas).
  const [agora, setAgora] = useState(() => Date.now());

  const fila = useMemo(
    () => montarFila(pedidos, contatos, numeroAvisos),
    [pedidos, contatos, numeroAvisos]
  );

  const refetch = useCallback(async () => {
    if (!supabase) return;
    const [{ data: hs }, { data: cs }] = await Promise.all([
      supabase
        .from("handoffs")
        .select("id, phone, opened_at, summary")
        .is("closed_at", null)
        .order("opened_at", { ascending: true }),
      supabase.from("dados_cliente").select("telefone, nomewpp, display_name"),
    ]);
    setPedidos((hs ?? []) as PedidoLinha[]);
    setContatos((cs ?? []) as ContatoLinha[]);
    setAgora(Date.now());
  }, [supabase]);

  // Tempo real nas duas regras da casa (CLAUDE.md, "Realtime cai"): callback
  // no subscribe, primeira assinatura PULADA (a lista acabou de vir do
  // servidor) e re-busca a cada reassinatura, que é quando um evento pode ter
  // se perdido.
  const primeira = useRef(true);
  useEffect(() => {
    if (!supabase) return;
    const canal = supabase
      .channel("pedidos-abertos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "handoffs" },
        () => void refetch()
      )
      .subscribe((status: string) => {
        if (status !== "SUBSCRIBED") return;
        if (primeira.current) {
          primeira.current = false;
          return;
        }
        void refetch();
      });
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => {
      void supabase.removeChannel(canal);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      clearInterval(relogio);
    };
  }, [supabase, refetch]);

  /** Tira o pedido da tela e diz o que aconteceu com ele. */
  function concluir(id: number, r: Resultado) {
    setResultado(r);
    setPedidos((ps) => ps.filter((p) => p.id !== id));
    setAberto((a) => (a === id ? null : a));
  }

  async function orientar(p: PedidoAberto, texto: string) {
    if (preview) {
      concluir(p.id, { tom: "ok", texto: "Orientado. A IA respondeu ao cliente." });
      return;
    }
    const res = await postar("/api/conversations/orientar", {
      phone: p.phone,
      instruction: texto,
      pedidoId: p.id,
    });
    if (!res) return setResultado(SEM_SERVIDOR);
    if (res.status === 409) {
      concluir(p.id, { tom: "aviso", texto: "Esse pedido já tinha sido resolvido." });
      return;
    }
    if (!res.ok) {
      setResultado({ tom: "erro", texto: "Não foi possível orientar. Tente de novo." });
      return;
    }
    const data = (await res.json()) as { enviado?: boolean };
    concluir(
      p.id,
      data.enviado
        ? { tom: "ok", texto: "Orientado. A IA respondeu ao cliente." }
        : {
            tom: "aviso",
            texto:
              "Orientado. A IA não conseguiu responder agora e usa a orientação na próxima mensagem do cliente.",
          }
    );
  }

  async function responder(p: PedidoAberto, texto: string) {
    if (preview) {
      concluir(p.id, { tom: "ok", texto: "Resposta enviada. A conversa ficou com você." });
      return;
    }
    const res = await postar("/api/send", { phone: p.phone, text: texto, pedidoId: p.id });
    if (!res) return setResultado(SEM_SERVIDOR);
    if (!res.ok) {
      setResultado({ tom: "erro", texto: "A mensagem não saiu. Tente de novo." });
      return;
    }
    concluir(p.id, { tom: "ok", texto: "Resposta enviada. A conversa ficou com você." });
  }

  async function responderMidia(p: PedidoAberto, media: OutgoingMedia) {
    if (preview) return;
    // Igual à conversa: mídia não fecha pedido (só o texto respondido fecha).
    const res = await postar("/api/send", { phone: p.phone, media });
    setResultado(
      res?.ok
        ? { tom: "ok", texto: "Arquivo enviado." }
        : { tom: "erro", texto: "O arquivo não saiu. Tente de novo." }
    );
  }

  async function resolvido(p: PedidoAberto) {
    if (preview) {
      concluir(p.id, { tom: "ok", texto: "Marcado como resolvido." });
      return;
    }
    const res = await postar("/api/conversations/resolve", { phone: p.phone, pedidoId: p.id });
    if (!res) return setResultado(SEM_SERVIDOR);
    if (!res.ok) {
      setResultado({ tom: "erro", texto: "Não foi possível resolver. Tente de novo." });
      return;
    }
    concluir(p.id, { tom: "ok", texto: "Marcado como resolvido." });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {resultado && (
        <p
          role="status"
          data-slot="pedidos-resultado"
          className={cn(
            "mb-3 rounded-lg border px-3 py-2 text-apoio",
            resultado.tom === "ok" && "border-human-line bg-human-surface text-human-ink",
            resultado.tom === "aviso" && "border-warn-line bg-warn-surface text-warn-ink",
            resultado.tom === "erro" && "border-danger-line bg-danger-surface text-danger-ink"
          )}
        >
          {resultado.texto}
        </p>
      )}

      {fila.length === 0 ? (
        <div
          data-slot="pedidos-vazio"
          className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center"
        >
          <HandHelping size={28} className="text-ink-faint" aria-hidden />
          <p className="text-corpo font-semibold">Nenhum pedido esperando.</p>
          <p className="max-w-sm text-apoio text-ink-3">
            Quando a IA pedir ajuda, o pedido aparece aqui e no WhatsApp de avisos.
          </p>
        </div>
      ) : (
        <AreaRolavel className="min-h-0 flex-1">
          <ul data-slot="pedidos-lista" className="divide-y divide-line rounded-xl border border-line">
            {fila.map((p) => (
              <LinhaPedido
                key={p.id}
                p={p}
                agora={agora}
                aberto={aberto === p.id}
                onAlternar={() => {
                  setResultado(null);
                  setAberto((a) => (a === p.id ? null : p.id));
                }}
                clientId={clientId}
                readOnly={readOnly}
                supabase={supabase}
                contextoPreview={contextoPreview?.[p.phone]}
                onOrientar={(t) => orientar(p, t)}
                onResponder={(t) => responder(p, t)}
                onResponderMidia={(m) => responderMidia(p, m)}
                onResolvido={() => resolvido(p)}
              />
            ))}
          </ul>
        </AreaRolavel>
      )}
    </div>
  );
}

function LinhaPedido({
  p,
  agora,
  aberto,
  onAlternar,
  clientId,
  readOnly,
  supabase,
  contextoPreview,
  onOrientar,
  onResponder,
  onResponderMidia,
  onResolvido,
}: {
  p: PedidoAberto;
  agora: number;
  aberto: boolean;
  onAlternar: () => void;
  clientId: string;
  readOnly: boolean;
  supabase: ReturnType<typeof createClient> | null;
  contextoPreview?: MensagemContexto[];
  onOrientar: (t: string) => Promise<void>;
  onResponder: (t: string) => Promise<void>;
  onResponderMidia: (m: OutgoingMedia) => Promise<void>;
  onResolvido: () => Promise<void>;
}) {
  const longa = agora - Date.parse(p.openedAt) >= ESPERA_AVISO_MS;
  const quem = p.nome ?? prettyPhone(p.phone);
  const ref = useRef<HTMLLIElement>(null);

  // A linha do link do aviso nasce aberta; rola até ela uma vez.
  useEffect(() => {
    if (aberto) ref.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <li ref={ref} data-slot="pedido-linha" data-pedido={p.id} data-aberto={aberto ? "sim" : undefined}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--active-bg)]"
      >
        <span
          data-slot="pedido-espera"
          data-longa={longa ? "sim" : undefined}
          suppressHydrationWarning
          className={cn(
            "mt-0.5 w-[4.5rem] shrink-0 whitespace-nowrap text-apoio font-semibold tabular-nums",
            longa ? "text-warn-ink" : "text-ink-2"
          )}
        >
          há {formatEspera(p.openedAt, agora)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-corpo font-semibold text-ink">{quem}</span>
            {p.total > 1 && (
              <span data-slot="pedido-posicao" className="text-legenda text-ink-3">
                {p.posicao} de {p.total} nesta conversa
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-apoio text-ink-2">
            {p.summary?.trim() || "Ela não soube responder e passou para o time."}
          </span>
        </span>
        {aberto ? (
          <ChevronDown size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        ) : (
          <ChevronRight size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
        )}
      </button>

      {aberto && (
        <DetalhePedido
          p={p}
          clientId={clientId}
          readOnly={readOnly}
          supabase={supabase}
          contextoPreview={contextoPreview}
          onOrientar={onOrientar}
          onResponder={onResponder}
          onResponderMidia={onResponderMidia}
          onResolvido={onResolvido}
        />
      )}
    </li>
  );
}

const PELE: Record<MensagemContexto["autor"], string> = {
  cliente:
    "self-start border-line-soft bg-[var(--bubble-in-bg)] text-[var(--bubble-in-fg)] shadow-[var(--bubble-shadow)]",
  ia: "self-end border-brand-line bg-[var(--bubble-ia-bg)] text-[var(--bubble-ia-fg)]",
  time: "self-end border-human-line bg-[var(--bubble-you-bg)] text-[var(--bubble-you-fg)]",
};

function DetalhePedido({
  p,
  clientId,
  readOnly,
  supabase,
  contextoPreview,
  onOrientar,
  onResponder,
  onResponderMidia,
  onResolvido,
}: {
  p: PedidoAberto;
  clientId: string;
  readOnly: boolean;
  supabase: ReturnType<typeof createClient> | null;
  contextoPreview?: MensagemContexto[];
  onOrientar: (t: string) => Promise<void>;
  onResponder: (t: string) => Promise<void>;
  onResponderMidia: (m: OutgoingMedia) => Promise<void>;
  onResolvido: () => Promise<void>;
}) {
  const [contexto, setContexto] = useState<MensagemContexto[] | null>(
    contextoPreview ?? null
  );

  // As últimas mensagens da conversa, lidas ao abrir a linha. O estado só muda
  // depois da resposta (regra do lint de efeito).
  useEffect(() => {
    if (!supabase) return;
    let vivo = true;
    void supabase
      .from("chat_messages")
      .select("user_message, bot_message, message_type, created_at")
      .eq("phone", p.phone)
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }: { data: unknown[] | null }) => {
        if (!vivo) return;
        const linhas = ((data ?? []) as {
          user_message: string | null;
          bot_message: string | null;
          message_type: string | null;
          created_at: string;
        }[]).reverse();
        setContexto(mensagensDeContexto(linhas));
      });
    return () => {
      vivo = false;
    };
  }, [supabase, p.phone]);

  return (
    <div
      data-slot="pedido-detalhe"
      className="border-t border-line bg-bloco px-4 pb-4 pt-3 max-md:px-2"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-rotulo uppercase text-ink-3">Últimas mensagens</p>
        <Link
          href={`/inbox/${encodeURIComponent(p.phone)}`}
          className="text-legenda font-semibold text-brand-ink hover:underline"
        >
          Abrir conversa
        </Link>
      </div>

      <div data-slot="pedido-contexto" className="mb-3 flex flex-col gap-2">
        {contexto === null ? (
          <p className="text-legenda text-ink-3">Carregando…</p>
        ) : contexto.length === 0 ? (
          <p className="text-legenda text-ink-3">Sem mensagens nesta conversa.</p>
        ) : (
          contexto.map((m, i) => (
            <div
              key={i}
              data-autor={m.autor}
              className={cn(
                "max-w-[85%] rounded-xl border px-3 py-2 text-apoio whitespace-pre-wrap",
                PELE[m.autor]
              )}
            >
              {m.texto}
              <span className="ml-2 text-legenda opacity-70" suppressHydrationWarning>
                {formatTime(m.em)}
              </span>
            </div>
          ))
        )}
      </div>

      {!readOnly && (
        <MessageComposer
          pedido={{
            handoff: {
              id: p.id,
              openedAt: p.openedAt,
              summary: p.summary,
              instruction: null,
              closedAt: null,
              closedHow: null,
            },
            posicao: p.posicao,
            total: p.total,
            onOrientar,
            onResolvido,
          }}
          onSend={onResponder}
          onSendMedia={onResponderMidia}
          clientId={clientId}
          embutida
        />
      )}
    </div>
  );
}
