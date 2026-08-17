"use client";

import { User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { prettyPhone, phoneDigits } from "@/lib/format";
import { initials, avatarPair } from "@/lib/inbox";
import type { Member } from "@/lib/team";
import ContactNotes from "./ContactNotes";
import ContactFields from "./ContactFields";
import AiSummary from "./AiSummary";

// "20 jul", não "20 de jul." O pt-BR devolve a forma longa com preposição e
// ponto final, que numa legenda de rodapé vira ruído.
function fmtDate(iso: string | null): string {
  if (!iso) return "sempre";
  return new Date(iso)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(" de ", " ")
    .replace(".", "");
}

// Coluna da direita: quem é a pessoa e o que se sabe dela.
//
// A ordem é uma decisão, não acaso: Entendimento (o que ela quer), Notas (o que
// o time já descobriu) e Dados (o cadastro). Tudo aberto, sem sanfona, porque
// há espaço de sobra e esconder três linhas atrás de um clique não economiza
// nada. A seção "Atendimento" saiu daqui: quem atende agora é um chip no
// cabeçalho da conversa, junto da conversa, e ter os dois era a mesma decisão
// em dois lugares.
export default function ContextPanel({
  name,
  phone,
  firstMessageAt,
  messageCount,
  members,
  myUserId,
  conversationId,
  clientId,
  editableName,
  customFields,
  contactExists,
}: {
  name: string | null;
  phone: string;
  firstMessageAt: string | null;
  messageCount: number;
  /** Só para nomear o autor de cada nota. */
  members: Member[];
  myUserId: string;
  conversationId: number | null;
  clientId: string;
  editableName: string | null;
  customFields: Record<string, unknown> | null;
  contactExists: boolean;
}) {
  const displayName = name || prettyPhone(phone);
  const ini = initials(name);
  const number = prettyPhone(phone);

  return (
    <div className="flex min-h-full flex-col gap-3.5 p-3.5">
      {/* Identidade do contato. O nome também está no cabeçalho, mas aqui ele
          ancora a coluna: sem isso a lateral abre direto em texto solto e não
          se sabe de quem é. O telefone entra porque é o dado que mais se copia.
          O bloco "Status da IA", os rótulos e o botão verde de WhatsApp saíram:
          os três já existem no cabeçalho, a dois centímetros daqui. */}
      <div className="flex items-center gap-2.5">
        <Avatar size="xl" style={avatarPair(phone)}>
          {ini ?? <User size={18} />}
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-corpo font-semibold">{displayName}</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`https://wa.me/${phoneDigits(phone)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-legenda font-normal text-ink-3 transition-colors hover:text-brand-ink"
              >
                {number}
              </a>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Abrir esta conversa no WhatsApp
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <AiSummary phone={phone} clientId={clientId} />

      <ContactNotes
        conversationId={conversationId}
        myUserId={myUserId}
        members={members}
      />

      <ContactFields
        phone={phone}
        initialDisplayName={editableName}
        initialCustomFields={customFields}
        editable={contactExists}
      />

      {/* Histórico em uma linha, no pé da coluna. Eram duas linhas rotuladas
          numa seção "Dados" que competia com o cadastro de verdade. */}
      <span
        className="mt-auto border-t border-line pt-3 text-legenda text-ink-3"
        suppressHydrationWarning
      >
        Cliente desde {fmtDate(firstMessageAt)} · {messageCount}{" "}
        {messageCount === 1 ? "mensagem" : "mensagens"}
      </span>
    </div>
  );
}
