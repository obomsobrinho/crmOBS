"use client";

import { notFound } from "next/navigation";
import { ErroDoBloco } from "@/components/ui/erro-do-bloco";
import { bestName, cleanName, nomeDoContato } from "@/lib/inbox";
import { useSessao } from "@/lib/sessao";
import { aberturaDoNavegador } from "../api/navegador";
import { useAberturaDaConversa } from "../hooks/useConversas";
import ConversationView from "./ConversationView";
import MolduraDaConversa from "./MolduraDaConversa";

/**
 * A conversa aberta, na rota `/inbox/[id]`. Até o passo 4 a página lia tudo no servidor
 * e o clique esperava; agora a moldura aparece no clique e as MESMAS leituras vêm do
 * navegador (RLS). Uma conversa que não existe (ou não é desta empresa) continua dando
 * "não encontrado". A abertura é sempre lida de novo (nada de conversa guardada velha):
 * dali em diante quem mantém as mensagens é o canal da própria conversa.
 */
export default function ConversaDaRota({ phone }: { phone: string }) {
  const s = useSessao();
  const q = useAberturaDaConversa(phone, aberturaDoNavegador);
  if (q.data === null) notFound();
  if (q.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <ErroDoBloco frase="Não deu para abrir esta conversa." aoTentar={() => void q.refetch()} tentando={q.isFetching} />
      </div>
    );
  }
  if (!q.data) return <MolduraDaConversa />;
  const { linhas, contato, conversa, membros, resumo } = q.data;
  return (
    <ConversationView
      key={phone}
      phone={phone}
      // display_name (CRM) precede o nomewpp (pushName do WhatsApp).
      name={nomeDoContato(contato) ?? bestName(linhas)}
      nomeBase={cleanName(contato?.nomewpp) ?? bestName(linhas)}
      fotoPath={contato?.foto_path ?? null}
      atendimentoIa={contato?.atendimento_ia ?? null}
      initialRows={linhas}
      firstMessageAt={resumo.primeira ?? linhas[0]?.created_at ?? null}
      messageCount={resumo.total || linhas.length}
      temAntigas={resumo.total > linhas.length}
      assignedUserId={conversa?.assigned_user_id ?? null}
      members={membros}
      myUserId={s.userId}
      conversationId={conversa?.id ?? null}
      pendingInstruction={conversa?.pending_instruction ?? null}
      handoffAtInicial={conversa ? conversa.handoff_at : undefined}
      clientId={s.clientId}
      displayName={contato?.display_name ?? null}
      customFields={contato?.custom_fields ?? null}
      contactEmail={contato?.email ?? null}
      contactBirthDate={contato?.birth_date ?? null}
      contactExists={!!contato}
      readOnly={s.access.blocked}
    />
  );
}
