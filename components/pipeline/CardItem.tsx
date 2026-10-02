"use client";

import { Bot, ArrowRightLeft } from "lucide-react";
import { formatEspera, prettyPhone } from "@/lib/format";
import { memberName, type Member } from "@/lib/team";
import { quemAtende } from "@/lib/crm";
import { idadeEmDias, origemDoCard, type PipelineCard } from "@/lib/pipeline";
import AvatarContato from "../AvatarContato";
import AvatarMembro from "../AvatarMembro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import QuemAtendeBadge, { quemAtendeTexto } from "../QuemAtendeBadge";

export function CardItem({
  card,
  member,
  onOpen,
  onMover,
}: {
  card: PipelineCard;
  member: Member | null | undefined;
  onOpen: () => void;
  /** Celular: abre a folha de estágios (o arrastar é só do desktop). */
  onMover?: () => void;
}) {
  const label = card.name || prettyPhone(card.phone);
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
          <AvatarContato
            size="xs"
            phone={card.phone}
            name={card.name}
            fotoPath={card.fotoPath}
          />
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
            <AvatarMembro size="3xs" email={member.email} />
            {memberName(member.email)}
          </span>
        )}
      </div>

      {onMover && (
        <div className="mt-2 flex justify-end border-t border-line-soft pt-2 md:hidden">
          <Button
            variant="outline"
            size="none"
            data-slot="pipeline-mover"
            onClick={(e) => {
              // O card inteiro abre a conversa; o botão não pode abrir junto.
              e.stopPropagation();
              onMover();
            }}
            className="h-9 gap-1.5 rounded-lg px-3 text-apoio"
          >
            <ArrowRightLeft size={14} />
            Mover
          </Button>
        </div>
      )}
    </div>
  );
}
