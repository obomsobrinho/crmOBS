"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { memberName, type Member } from "@/lib/team";
import type { ConversationNote } from "@/lib/crm";

const VISIVEIS = 3;

// Notas internas da conversa (visíveis só ao time, nunca vão ao WhatsApp).
//
// Aqui é só LEITURA, em linha do tempo. Escrever nota agora é a aba "Nota
// interna" do campo de escrita: manter uma segunda caixa de texto na lateral
// era pedir para a pessoa escolher entre dois lugares que fazem a mesma coisa.
// O realtime existe justamente por isso: a nota escrita no rodapé aparece aqui
// sem recarregar a página.
export default function ContactNotes({
  conversationId,
  myUserId,
  members,
}: {
  conversationId: number | null;
  myUserId: string;
  members: Member[];
}) {
  const supabase = createClient();
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [todas, setTodas] = useState(false);

  const authorLabel = useCallback(
    (userId: string | null) => {
      if (!userId) return "Removido";
      if (userId === myUserId) return "Você";
      const m = members.find((x) => x.userId === userId);
      return m ? memberName(m.email) : "Colega";
    },
    [members, myUserId]
  );

  const load = useCallback(async () => {
    if (conversationId == null) return;
    const { data } = await supabase
      .from("conversation_notes")
      .select("id, body, author_user_id, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });
    setNotes(
      ((data ?? []) as {
        id: number;
        body: string;
        author_user_id: string | null;
        created_at: string;
      }[]).map((n) => ({
        id: n.id,
        body: n.body,
        authorUserId: n.author_user_id,
        createdAt: n.created_at,
      }))
    );
  }, [supabase, conversationId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // Nota escrita na aba "Nota interna" do rodapé cai aqui na hora.
  useEffect(() => {
    if (conversationId == null) return;
    const channel = supabase
      .channel(`notes-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_notes",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, load]);

  async function remove(id: number) {
    setNotes((n) => n.filter((x) => x.id !== id));
    const { error } = await supabase
      .from("conversation_notes")
      .delete()
      .eq("id", id);
    if (error) await load();
  }

  if (conversationId == null) return null;

  const mostradas = todas ? notes : notes.slice(0, VISIVEIS);
  const restantes = notes.length - mostradas.length;

  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3">
      <div className="flex items-baseline gap-2">
        <span className="text-rotulo uppercase text-ink-3">
          Notas
        </span>
        <span className="ml-auto text-legenda text-ink-3">
          {notes.length > 0 ? notes.length : "nenhuma"}
        </span>
      </div>

      {mostradas.map((n, i) => (
        <div key={n.id} className="group flex gap-2.5">
          {/* Ponto âmbar e fio: nota é assunto interno do time, e âmbar é a cor
              que já marca isso na caixa de escrita. O fio some na última para a
              linha do tempo não terminar no vazio. */}
          <span className="flex shrink-0 flex-col items-center pt-1.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--warn-fill)]"
            />
            {i < mostradas.length - 1 && (
              <span aria-hidden className="mt-1 w-px flex-1 bg-line" />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 pb-1.5">
            <span
              className="whitespace-pre-wrap break-words text-apoio font-medium text-ink-2"
              style={{ textWrap: "pretty" }}
            >
              {n.body}
            </span>
            <span className="flex items-center gap-1.5 text-legenda text-ink-3">
              <span suppressHydrationWarning>
                {authorLabel(n.authorUserId)} ·{" "}
                {new Date(n.createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
              <Button
                variant="ghost"
                size="none"
                onClick={() => remove(n.id)}
                aria-label="Remover nota"
                className="rounded p-0.5 text-ink-3 opacity-0 transition-opacity hover:bg-transparent hover:text-danger-ink group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </Button>
            </span>
          </span>
        </div>
      ))}

      {notes.length === 0 && (
        <span className="text-apoio text-ink-3">
          Nenhuma nota ainda. Use a aba Nota interna no campo de escrita.
        </span>
      )}

      {restantes > 0 && (
        <Button
          variant="brand-ghost"
          size="none"
          onClick={() => setTodas(true)}
          className="self-start text-legenda transition-opacity hover:bg-transparent hover:opacity-80"
        >
          ver todas as {notes.length}
        </Button>
      )}
    </div>
  );
}
