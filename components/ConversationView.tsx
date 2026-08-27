"use client";

import { useCallback, useEffect, useState } from "react";
import Thread from "./Thread";
import ContextPanel from "./ContextPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/lib/supabase/client";
import { anunciarIa } from "@/lib/ia-bus";
import type { Member } from "@/lib/team";
import type { ChatRow } from "@/lib/types";

// Compõe a thread + o painel de contexto. Dono do estado da IA
// (atendimento_ia) para que header e painel fiquem sempre sincronizados —
// um único realtime + toggle otimista, compartilhado pelos dois.
export default function ConversationView({
  phone,
  name,
  atendimentoIa,
  initialRows,
  firstMessageAt,
  messageCount,
  assignedUserId,
  members,
  myUserId,
  conversationId,
  pendingInstruction,
  clientId,
  displayName,
  customFields,
  contactExists,
  readOnly,
}: {
  phone: string;
  name: string | null;
  atendimentoIa: string | null;
  initialRows: ChatRow[];
  firstMessageAt: string | null;
  messageCount: number;
  assignedUserId: string | null;
  members: Member[];
  myUserId: string;
  conversationId: number | null;
  pendingInstruction: string | null;
  clientId: string;
  displayName: string | null;
  customFields: Record<string, unknown> | null;
  contactExists: boolean;
  /** Conta bloqueada por assinatura: a conversa é visível, mas não se trabalha. */
  readOnly?: boolean;
}) {
  const supabase = createClient();
  const [showContext, setShowContext] = useState(true);
  const [iaState, setIaState] = useState<string | null>(atendimentoIa);
  const [iaProp, setIaProp] = useState<string | null>(atendimentoIa);
  const [assigned, setAssigned] = useState<string | null>(assignedUserId);
  const [assignedProp, setAssignedProp] = useState<string | null>(assignedUserId);
  const [instruction, setInstruction] = useState<string | null>(pendingInstruction);
  const [instructionProp, setInstructionProp] = useState<string | null>(
    pendingInstruction
  );

  // Ajuste em tempo de render (sem efeito) quando o estado da IA, a atribuição
  // ou a orientação vindas do servidor mudam ao trocar de conversa. Ver
  // react.dev "adjusting state when a prop changes".
  //
  // O da IA era um `useEffect` com `setState` dentro, o que gera renderização em
  // cascata: React pinta com o valor antigo, o efeito roda, e ele pinta de novo.
  // Aqui o ajuste acontece ANTES da primeira pintura, então a chave nunca
  // aparece na posição da conversa anterior.
  if (iaProp !== atendimentoIa) {
    setIaProp(atendimentoIa);
    setIaState(atendimentoIa);
  }
  if (assignedProp !== assignedUserId) {
    setAssignedProp(assignedUserId);
    setAssigned(assignedUserId);
  }
  if (instructionProp !== pendingInstruction) {
    setInstructionProp(pendingInstruction);
    setInstruction(pendingInstruction);
  }

  // Realtime da atribuição desta conversa (outro atendente pode assumir).
  useEffect(() => {
    const channel = supabase
      .channel(`conv-assign-${phone}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `phone=eq.${phone}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { assigned_user_id?: string | null };
          if (row && "assigned_user_id" in row) {
            setAssigned(row.assigned_user_id ?? null);
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [phone, supabase]);

  // Assumir / transferir / soltar a conversa. A RLS libera UPDATE de
  // conversations ao tenant, então filtrar por telefone atinge só a linha dele.
  const assign = useCallback(
    async (userId: string | null) => {
      const prev = assigned;
      setAssigned(userId); // otimista
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_user_id: userId })
        .eq("phone", phone);
      if (error) setAssigned(prev); // reverte
    },
    [assigned, phone, supabase]
  );

  // Abrir a conversa marca como lida (zera o contador). A RLS restringe o update
  // ao tenant do usuário, então filtrar por telefone atinge só a linha dele.
  //
  // ⚠️ O `await` NÃO é decoração: o query builder do Supabase é LAZY e só manda a
  // requisição quando alguém chama `.then()`. Isto era `void supabase...`, que
  // descarta o valor sem acionar o builder, então o PATCH jamais saía e o
  // contador de não lidas ficava aceso para sempre. Provado por rede: abrir a
  // conversa não gerava PATCH nenhum. Com Promise de verdade `void` funciona,
  // porque ela já está em execução; com builder preguiçoso, não. Os outros
  // `void supabase.removeChannel(...)` do projeto seguem corretos, porque
  // `removeChannel` devolve Promise, e não builder.
  useEffect(() => {
    void (async () => {
      await supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("phone", phone)
        .gt("unread_count", 0);
    })();
  }, [phone, supabase]);

  // Realtime do estado da IA deste contato.
  useEffect(() => {
    const channel = supabase
      .channel(`cliente-${phone}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dados_cliente",
          filter: `telefone=eq.${phone}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as { atendimento_ia?: string | null };
          if (row && "atendimento_ia" in row) {
            setIaState(row.atendimento_ia ?? null);
          }
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [phone, supabase]);

  // Nota interna e orientação da IA vêm das abas da caixa de escrita. Estavam
  // as duas na coluna da direita, cada uma com a sua própria caixa de texto,
  // então havia três lugares para escrever na mesma tela.
  const addNote = useCallback(
    async (body: string) => {
      if (conversationId == null) return;
      await supabase.from("conversation_notes").insert({
        client_id: clientId,
        conversation_id: conversationId,
        author_user_id: myUserId,
        body,
      });
    },
    [supabase, clientId, conversationId, myUserId]
  );

  // Orienta a IA e reativa: ela consome a orientação na PRÓXIMA mensagem do
  // cliente (consumo único em /api/agent) e segue sozinha.
  const instruct = useCallback(
    async (text: string) => {
      const { error } = await supabase
        .from("conversations")
        .update({
          pending_instruction: text,
          pending_instruction_at: new Date().toISOString(),
          pending_instruction_by: myUserId,
        })
        .eq("client_id", clientId)
        .eq("phone", phone);
      if (error) return;
      await supabase
        .from("dados_cliente")
        .update({ atendimento_ia: "reativada" })
        .eq("telefone", phone);
      setInstruction(text);
      setIaState("reativada");
    },
    [supabase, clientId, phone, myUserId]
  );

  const cancelInstruction = useCallback(async () => {
    const prev = instruction;
    setInstruction(null); // otimista
    const { error } = await supabase
      .from("conversations")
      .update({
        pending_instruction: null,
        pending_instruction_at: null,
        pending_instruction_by: null,
      })
      .eq("client_id", clientId)
      .eq("phone", phone);
    if (error) setInstruction(prev); // reverte
  }, [supabase, clientId, phone, instruction]);

  const toggleIa = useCallback(async () => {
    // Conta bloqueada não liga nem desliga a IA. A guarda fica aqui (e não só no
    // botão) porque o mesmo callback é usado pelo header e pelo painel lateral.
    if (readOnly) return;
    const pausada = iaState === "pause";
    const next = pausada ? "ativa" : "pause";
    const prev = iaState;
    setIaState(next); // otimista
    // A lista de conversas mostra QUEM está atendendo no canto do avatar, e ela é
    // outro componente. Sem este aviso ela só descobre pelo realtime (ida ao
    // Postgres, volta do WebSocket e três consultas), então a marca ficava
    // atrasada em relação à chave que a pessoa acabou de virar.
    anunciarIa({ phone, estado: next });
    const { error } = await supabase
      .from("dados_cliente")
      .update({ atendimento_ia: next })
      .eq("telefone", phone);
    if (error) {
      setIaState(prev); // reverte em caso de falha
      anunciarIa({ phone, estado: prev });
    }
  }, [iaState, phone, supabase, readOnly]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* Conversa e contato dividem o cartão com a lista. Cartão dentro de
          cartão não é hierarquia, é sujeira: o que separa as colunas é uma
          linha de 1px, e só a área de mensagens tem superfície própria. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-msg">
        <Thread
          phone={phone}
          name={name}
          iaState={iaState}
          onToggleIa={toggleIa}
          initialRows={initialRows}
          onToggleContext={() => setShowContext((v) => !v)}
          contextOpen={showContext}
          clientId={clientId}
          readOnly={readOnly}
          onAddNote={conversationId != null ? addNote : undefined}
          onInstruct={instruct}
          pendingInstruction={instruction}
          onCancelInstruction={cancelInstruction}
          assignedUserId={assigned}
          members={members}
          myUserId={myUserId}
          onAssign={assign}
          conversationId={conversationId}
        />
      </div>
      {showContext && (
        <aside className="hidden w-[296px] shrink-0 border-l border-line bg-conteudo lg:block">
          <ScrollArea fade className="h-full">
            <ContextPanel
              name={name}
              phone={phone}
              firstMessageAt={firstMessageAt}
              messageCount={messageCount}
              members={members}
              myUserId={myUserId}
              conversationId={conversationId}
              clientId={clientId}
              editableName={displayName}
              customFields={customFields}
              contactExists={contactExists}
            />
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}
