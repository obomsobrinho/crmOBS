"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { memberName, type Member } from "@/lib/team";
import type { ConversationNote } from "@/lib/crm";
import { CabecalhoBloco } from "./ContactFields";

const VISIVEIS = 3;

// Notas internas da conversa (visíveis só ao time, nunca vão ao WhatsApp).
//
// Aqui é só LEITURA, em linha do tempo. Escrever nota agora é a aba "Nota
// interna" do campo de escrita: manter uma segunda caixa de texto na lateral
// era pedir para a pessoa escolher entre dois lugares que fazem a mesma coisa.
// O realtime existe justamente por isso: a nota escrita no rodapé aparece aqui
// sem recarregar a página.
//
// ⚠️ APARÊNCIA REFEITA EM 18/09/2026 pelo desenho aprovado. Duas mudanças:
// 1. O cabeçalho virou o mesmo do bloco "Dados" (rótulo mais filete, por
//    `CabecalhoBloco`), e a CONTAGEM à direita saiu. Ela dizia "nenhuma" ou um
//    número ao lado de uma lista que já mostra as notas e já tem um estado vazio
//    escrito por extenso: era o mesmo fato duas vezes na mesma linha.
// 2. ⚠️ O desenho põe um "+ nova" em âmbar na ponta direita deste cabeçalho, e
//    ele NÃO foi feito. Escrever nota é a aba "Nota interna" do campo de escrita
//    (decisão registrada acima), e esta coluna não tem como acionar o campo de
//    escrita sem passar por `Thread` e `MessageComposer`, que esta rodada não
//    pode tocar. O próprio desenho mantém a frase "Use a aba Nota interna no
//    campo de escrita" no estado vazio, ou seja, o caminho de verdade continua
//    sendo o de baixo. Um "+ nova" que abrisse uma SEGUNDA caixa de texto aqui
//    desfaria a decisão de propósito.
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
    <div className="flex flex-col gap-2.5 px-4 pt-4">
      <CabecalhoBloco rotulo="Notas" />

      {mostradas.map((n) => (
        <div key={n.id} data-slot="painel-nota" className="group flex gap-2">
          {/* Ponto âmbar: nota é assunto interno do time, e âmbar é a cor que já
              marca isso na caixa de escrita.
              ⚠️ O FIO que ligava um ponto ao outro SAIU (desenho de 18/09/2026).
              Ele desenhava uma linha do tempo, e nota interna não é uma: as duas
              notas de uma conversa não são etapas de nada, e o fio ainda obrigava
              cada item a carregar um `padding-bottom` só para o traço ter onde
              terminar. No desenho o que separa as notas é o respiro. */}
          <span
            aria-hidden
            className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-warn"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className="whitespace-pre-wrap break-words text-apoio text-ink-2"
              style={{ textWrap: "pretty" }}
            >
              {n.body}
            </span>
            {/* Autor e data em 12px na tinta de apoio, e o peso do corpo da nota
                caiu de 600 para o normal: no desenho o que se lê primeiro é o
                texto da nota, não quem escreveu. Com os dois em 600 o bloco
                inteiro tinha o mesmo peso. */}
            <span className="mt-0.5 flex items-center gap-1.5 text-legenda font-normal text-ink-3">
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
                className="rounded-sm p-0.5 text-ink-3 opacity-0 transition-opacity hover:bg-transparent hover:text-danger-ink focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </Button>
            </span>
          </span>
        </div>
      ))}

      {notes.length === 0 && (
        <span className="text-apoio text-ink-3" style={{ textWrap: "pretty" }}>
          Nenhuma nota ainda. Use a aba Nota interna no campo de escrita.
        </span>
      )}

      {restantes > 0 && (
        <Button
          variant="brand-ghost"
          size="none"
          onClick={() => setTodas(true)}
          className="self-start rounded-sm text-legenda transition-opacity hover:bg-transparent hover:opacity-80"
        >
          ver todas as {notes.length}
        </Button>
      )}
    </div>
  );
}
