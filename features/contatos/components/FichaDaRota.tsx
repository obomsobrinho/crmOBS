"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import FichaContato from "@/components/FichaContato";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Esqueleto } from "@/components/ui/esqueleto";
import { ErroDoBloco } from "@/components/ui/erro-do-bloco";
import { cleanName, nomeDoContato } from "@/lib/inbox";
import { diasSemContato } from "@/lib/clientes";
import { agoraMs } from "@/lib/periodo";
import { useSessao } from "@/lib/sessao";
import { fichaDoNavegador } from "../api/navegador";
import { useFichaDoContato } from "../hooks/useContatos";

/**
 * A ficha na tela de Contatos. É a MESMA do painel da conversa (`FichaContato`), com
 * `superficie="clientes"`. Até o passo 3b a página lia tudo no servidor; agora lê do
 * navegador pelo cache (RLS), com o esqueleto enquanto chega, e um contato que não
 * existe (ou não é desta empresa) continua dando a página de "não encontrado".
 */
export default function FichaDaRota({ id }: { id: number }) {
  const s = useSessao();
  const q = useFichaDoContato(id, fichaDoNavegador);
  if (q.data === null) notFound();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No celular a ficha é a tela inteira, e este é o caminho de volta. */}
      <div className="border-b border-line px-4 py-2 md:hidden">
        <Link href="/contatos" className="inline-flex items-center gap-1.5 text-apoio font-semibold text-ink-2">
          <ArrowLeft size={16} />
          Contatos
        </Link>
      </div>
      <AreaRolavel className="min-h-0 flex-1">
        {q.isError ? (
          <ErroDoBloco frase="Não deu para abrir este contato." aoTentar={() => void q.refetch()} tentando={q.isFetching} />
        ) : !q.data ? (
          <div data-slot="ficha-carregando" className="flex flex-col gap-3 p-5">
            <Esqueleto forma="bloco" className="h-16" />
            <Esqueleto forma="linha" />
            <Esqueleto forma="linha" />
            <Esqueleto forma="bloco" className="h-40" />
          </div>
        ) : (
          <FichaContato
            key={q.data.contato.id}
            superficie="clientes"
            name={nomeDoContato(q.data.contato)}
            nomeBase={cleanName(q.data.contato.nomewpp)}
            phone={q.data.contato.telefone}
            firstMessageAt={q.data.resumo.primeira}
            messageCount={q.data.resumo.total}
            members={q.data.membros}
            myUserId={s.userId}
            conversationId={q.data.conversa?.id ?? null}
            diasSemContato={diasSemContato(q.data.conversa?.last_message_at ?? null, agoraMs())}
            clientId={s.clientId}
            editableName={q.data.contato.display_name ?? null}
            customFields={q.data.contato.custom_fields ?? null}
            email={q.data.contato.email ?? null}
            birthDate={q.data.contato.birth_date ?? null}
            entendimento={q.data.entendimento}
            podeEnviar={!s.access.blocked}
            fotoPath={q.data.contato.foto_path ?? null}
            contactExists
          />
        )}
      </AreaRolavel>
    </div>
  );
}
