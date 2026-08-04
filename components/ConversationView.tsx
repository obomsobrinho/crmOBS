"use client";

import { useCallback, useEffect, useState } from "react";
import Thread from "./Thread";
import ContextPanel from "./ContextPanel";
import { createClient } from "@/lib/supabase/client";
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
  clientId,
  displayName,
  customFields,
  contactExists,
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
  clientId: string;
  displayName: string | null;
  customFields: Record<string, unknown> | null;
  contactExists: boolean;
}) {
  const supabase = createClient();
  const [showContext, setShowContext] = useState(true);
  const [iaState, setIaState] = useState<string | null>(atendimentoIa);
  const [assigned, setAssigned] = useState<string | null>(assignedUserId);
  const [assignedProp, setAssignedProp] = useState<string | null>(assignedUserId);

  // Ressincroniza ao navegar entre conversas.
  useEffect(() => {
    setIaState(atendimentoIa);
  }, [atendimentoIa]);
  // Ajuste em tempo de render (sem efeito) quando a atribuição vinda do servidor
  // muda ao trocar de conversa. Ver react.dev "adjusting state when a prop changes".
  if (assignedProp !== assignedUserId) {
    setAssignedProp(assignedUserId);
    setAssigned(assignedUserId);
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
  useEffect(() => {
    void supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("phone", phone)
      .gt("unread_count", 0);
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

  const toggleIa = useCallback(async () => {
    const pausada = iaState === "pause";
    const next = pausada ? "ativa" : "pause";
    const prev = iaState;
    setIaState(next); // otimista
    const { error } = await supabase
      .from("dados_cliente")
      .update({ atendimento_ia: next })
      .eq("telefone", phone);
    if (error) setIaState(prev); // reverte em caso de falha
  }, [iaState, phone, supabase]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Thread
          phone={phone}
          name={name}
          iaState={iaState}
          onToggleIa={toggleIa}
          initialRows={initialRows}
          onToggleContext={() => setShowContext((v) => !v)}
          contextOpen={showContext}
          clientId={clientId}
        />
      </div>
      {showContext && (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-line lg:block">
          <ContextPanel
            name={name}
            phone={phone}
            iaState={iaState}
            onToggleIa={toggleIa}
            firstMessageAt={firstMessageAt}
            messageCount={messageCount}
            assignedUserId={assigned}
            members={members}
            myUserId={myUserId}
            onAssign={assign}
            conversationId={conversationId}
            clientId={clientId}
            editableName={displayName}
            customFields={customFields}
            contactExists={contactExists}
          />
        </aside>
      )}
    </div>
  );
}
