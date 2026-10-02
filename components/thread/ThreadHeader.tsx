"use client";

import { useState } from "react";
import {
  Bot,
  User,
  UserPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  EllipsisVertical,
  PanelRight,
} from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatTime, prettyPhone } from "@/lib/format";
import { avatarPair } from "@/lib/inbox";
import { memberName, memberInitials, type Member } from "@/lib/team";
import type { QuemAtende } from "@/lib/crm";
import AvatarContato from "@/components/AvatarContato";

/** O cabeçalho da conversa: quem é a pessoa, quem atende, a chave da IA. */
export function ThreadHeader({
  phone,
  name,
  fotoPath,
  displayName,
  lastAt,
  quem,
  estadoLinha,
  iaState,
  iaPausada,
  onToggleIa,
  readOnly,
  attendant,
  assignedUserId,
  members,
  myUserId,
  onAssign,
  onOpenContato,
  onToggleContext,
  contextOpen,
}: {
  phone: string;
  name: string | null;
  fotoPath: string | null;
  displayName: string;
  lastAt: string | null;
  quem: QuemAtende;
  estadoLinha: string;
  iaState: string | null;
  iaPausada: boolean;
  onToggleIa: () => void;
  readOnly?: boolean;
  attendant: Member | null;
  assignedUserId?: string | null;
  members?: Member[];
  myUserId?: string;
  onAssign?: (userId: string | null) => void;
  onOpenContato?: () => void;
  onToggleContext?: () => void;
  contextOpen?: boolean;
}) {
  const [assignOpen, setAssignOpen] = useState(false);
  return (
    <>
      {/* Cabeçalho em DUAS faixas. Antes o nome, o telefone, o estado da IA e a
          hora da última mensagem dividiam o mesmo bloco, e o resultado lia como
          um amontoado. Em cima fica quem é a pessoa e o que dá para fazer; a
          faixa de baixo é referência, num tom próprio e com tipo menor. */}
      {/* ⚠️ O CABEÇALHO NÃO PROJETA SOMBRA NENHUMA, e essa história teve três
        capítulos em 19/09/2026. Era um `box-shadow` aqui, e `box-shadow` pinta
        para FORA: com a faixa "O cliente quer" entre ele e a conversa, a sombra
        caía sobre uma superfície opaca e virava um borrão cinza com borda.
        Virou um elemento absoluto dentro da área que rola, e ainda assim lia
        como risco. No fim saiu: quem diz que há conversa passando por baixo é a
        DISSOLUÇÃO, e o que separa as superfícies é o `border-b` desta faixa. */}
      <header className="relative z-10 shrink-0 border-b border-line bg-raised">
        <div className="flex h-[62px] items-center gap-3.5 pl-[22px] pr-5 max-md:gap-2 max-md:pl-1 max-md:pr-1">
          {/* Celular: a conversa é uma tela só, e voltar para a lista é esta
              seta (a barra de abas some aqui dentro). */}
          <Link
            href="/inbox"
            aria-label="Voltar para as conversas"
            data-slot="conversa-voltar"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 md:hidden"
          >
            <ChevronLeft size={22} />
          </Link>
          <AvatarContato size="lg" phone={phone} name={name} fotoPath={fotoPath} />
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            {/* O NOME, na tipografia de título da casa e na TINTA PRINCIPAL.
              Ele vinha pintado com a cor do avatar do contato, e era o primeiro
              item da lista do dono ("título do nome está diferente"): a cor do
              avatar existe para diferenciar UMA linha da outra numa lista de
              conversas: aqui só existe um nome, então a cor não distingue nada e
              ainda tira do nome a autoridade de ser o texto mais forte da faixa.
              18/600 em Space Grotesk, medido no desenho aprovado. */}
            <b
              data-slot="conversa-nome"
              className="truncate font-display text-titulo text-ink"
            >
              {displayName}
            </b>
            {/* O TELEFONE deixou de ser nota de rodapé. Ele e a hora da última
              mensagem eram a mesma linha cinza de 12px, coladas por um ponto
              médio, e as duas liam como sobra. No desenho o telefone é o
              endereço de WhatsApp daquela pessoa: ponto verde e tinta verde
              (`ink`, nunca `fill`), porque verde neste produto é o humano no
              WhatsApp. A hora fica ao lado, em tinta de apoio, que é o peso que
              ela merece.
              ⚠️ Não é link: não existe ação por trás dele neste produto, e um
              texto sublinhável que não leva a lugar nenhum é promessa falsa. */}
            <span
              data-slot="conversa-estado"
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-legenda font-semibold md:hidden",
                quem === "ia"
                  ? "text-brand-ink"
                  : quem === "ninguem"
                    ? "text-warn-ink"
                    : "text-human-ink",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  quem === "ia"
                    ? "bg-brand"
                    : quem === "ninguem"
                      ? "bg-warn"
                      : "bg-human",
                )}
                aria-hidden
              />
              <span className="truncate">{estadoLinha}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5 max-md:hidden">
              <span
                data-slot="conversa-telefone"
                className="flex min-w-0 items-center gap-1 text-legenda font-semibold text-human-ink"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-human"
                  aria-hidden
                />
                {/* `min-w-0` + `truncate` em vez de `shrink-0`: com `shrink-0` o
                  telefone não cabia em 1280 e ESCAPAVA da faixa, cortado pela
                  borda do cartão em vez de terminar em reticências. */}
                <span className="truncate">{prettyPhone(phone)}</span>
              </span>
              {/* ⚠️ `2xl` (1536px) e não sempre: MEDIDO em 1280, que é a janela
                dos testes e de um notebook comum. Com a lista de conversas, a
                coluna do cliente e os três controles da direita, sobram 426px
                para esta faixa, e o bloco do nome ficava com ZERO: o nome do
                contato desaparecia da tela. O desenho é desenhado em 1920, onde
                tudo cabe. A ordem de quem cede é a ordem de importância: a hora
                da última mensagem é referência passiva, então é a primeira a
                sair; depois os rótulos do chip de quem atende e do botão do
                painel, que continuam com `aria-label`; o nome nunca sai. */}
              {lastAt && (
                <span
                  data-slot="conversa-ultima"
                  className="hidden truncate text-legenda text-ink-3 2xl:block"
                  suppressHydrationWarning
                >
                  · última mensagem {formatTime(lastAt)}
                </span>
              )}
            </span>
          </span>

          {/* CELULAR: os três controles da direita viram UM menu de três pontos
              (desenho do mobile). Ele chama os MESMOS handlers do
              `ConversationView` (`onAssign`, `onToggleIa`), então atribuir
              continua pausando a IA e religar continua largando o responsável:
              nenhuma regra nova, só outro arranjo. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="none"
                aria-label="Mais ações da conversa"
                data-slot="conversa-mais"
                className="size-11 shrink-0 rounded-lg text-ink-2 md:hidden"
              >
                <EllipsisVertical size={20} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-64">
              {onAssign && myUserId && (
                <>
                  {/* O rótulo diz a AÇÃO, e não a pergunta (pedido do dono,
                      23/09/2026): "Quem atende" em cima de uma lista de nomes
                      lia como informação, e tocar num nome é passar a conversa. */}
                  <DropdownMenuLabel>
                    {attendant ? "Transferir para" : "Atribuir a"}
                  </DropdownMenuLabel>
                  {(members ?? []).map((m) => (
                    <DropdownMenuItem
                      key={m.userId}
                      disabled={readOnly}
                      onSelect={() => onAssign(m.userId)}
                      className="min-h-11"
                    >
                      <Avatar size="2xs" style={avatarPair(m.email)}>
                        {memberInitials(m.email).slice(0, 1)}
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate">
                        {m.userId === myUserId ? "Você" : memberName(m.email)}
                      </span>
                      {m.userId === assignedUserId && (
                        <Check size={13} className="shrink-0 text-brand-ink" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  {attendant && (
                    <DropdownMenuItem
                      disabled={readOnly}
                      onSelect={() => onAssign(null)}
                      className="min-h-11 text-ink-3"
                    >
                      Soltar a conversa
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              {iaState !== null && (
                <DropdownMenuItem
                  disabled={readOnly}
                  // `preventDefault` mantém o menu aberto: a pessoa vê a chave
                  // virar, que é a confirmação do gesto.
                  onSelect={(e) => {
                    e.preventDefault();
                    onToggleIa();
                  }}
                  className="min-h-11"
                  data-slot="conversa-mais-ia"
                >
                  <Bot size={15} className="shrink-0" />
                  <span className="flex-1">IA nesta conversa</span>
                  <SwitchTrack checked={!iaPausada}>
                    {/* Polegar desenhado à mão: o `SwitchThumb` do Radix exige
                        o Root do Switch em volta, e aqui o alvo é o item do
                        menu (foi esse o erro que derrubava a folha Mais). */}
                    <span
                      data-state={iaPausada ? "unchecked" : "checked"}
                      className="pointer-events-none block h-3 w-3 rounded-full transition-transform data-[state=checked]:translate-x-[13px] data-[state=checked]:bg-white data-[state=unchecked]:translate-x-[1px] data-[state=unchecked]:bg-[var(--ink-3)]"
                    />
                  </SwitchTrack>
                </DropdownMenuItem>
              )}
              {onOpenContato && (
                <DropdownMenuItem onSelect={onOpenContato} className="min-h-11">
                  <User size={15} className="shrink-0" />
                  Dados do contato
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="flex shrink-0 items-center gap-2 max-md:hidden">
            {/* QUEM ATENDE subiu para a mesma linha do nome (desenho aprovado).
              Morava numa segunda faixa do cabeçalho, sozinho num chip de 28px
              com meia tela vazia ao lado. Aqui ele fica encostado na chave da
              IA, que é a informação irmã: um diz quem é a pessoa responsável, o
              outro diz se a IA ainda responde. */}
            {onAssign && myUserId && (
              // Menu, e não interruptor: assumir, soltar e TRANSFERIR são a
              // mesma decisão (de quem é esta conversa), então moram no mesmo
              // controle. Transferir era um <select> perdido no painel da
              // direita.
              //
              // Os dois Roots (DropdownMenu e Tooltip) NÃO renderizam elemento.
              // Por isso os dois gatilhos se encadeiam por asChild até chegarem
              // ao mesmo <button>: se o DropdownMenuTrigger envolvesse o
              // <Tooltip>, ele estaria clonando props num nada e o menu não
              // abriria.
              <DropdownMenu open={assignOpen} onOpenChange={setAssignOpen}>
                <Tooltip>
                  <DropdownMenuTrigger asChild>
                    <TooltipTrigger asChild>
                      <Badge
                        asChild
                        variant={attendant ? "contorno" : "tracejado"}
                        className={cn(
                          // 32px e raio de controle, e não a pílula de 28px:
                          // no desenho ele é do mesmo degrau da chave da IA e
                          // do botão do painel, os três na mesma linha.
                          "h-8 cursor-pointer rounded-lg text-apoio transition-colors",
                          attendant
                            ? "bg-campo pl-1.5 pr-2.5 font-semibold hover:bg-[var(--active-bg)]"
                            : "font-medium hover:text-ink-2",
                        )}
                      >
                        {/* eslint-disable-next-line no-restricted-syntax -- o visual é do Badge (asChild), nenhuma variante do Button o reproduz igual */}
                        <button
                          type="button"
                          // O rótulo some abaixo de 1536px (ver a nota de
                          // largura na linha do telefone), então o nome
                          // acessível vem daqui e não do texto visível: sem
                          // isto, em 1280 este botão não teria nome nenhum.
                          aria-label={
                            attendant
                              ? attendant.userId === myUserId
                                ? "Você"
                                : memberName(attendant.email)
                              : "Ninguém assumiu ainda"
                          }
                        >
                          {attendant ? (
                            <>
                              <Avatar
                                size="2xs"
                                style={avatarPair(attendant.email)}
                              >
                                {memberInitials(attendant.email).slice(0, 1)}
                              </Avatar>
                              <span className="hidden 2xl:inline">
                                {attendant.userId === myUserId
                                  ? "Você"
                                  : memberName(attendant.email)}
                              </span>
                            </>
                          ) : (
                            <>
                              <UserPlus size={13} className="shrink-0" />
                              <span className="hidden 2xl:inline">
                                Ninguém assumiu ainda
                              </span>
                            </>
                          )}
                          <ChevronDown
                            size={12}
                            className="shrink-0 text-ink-faint"
                          />
                        </button>
                      </Badge>
                    </TooltipTrigger>
                  </DropdownMenuTrigger>
                  <TooltipContent side="bottom">
                    Quem atende esta conversa
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" sideOffset={4} className="w-56">
                  {(members ?? []).map((m) => (
                    <DropdownMenuItem
                      key={m.userId}
                      onSelect={() => onAssign(m.userId)}
                    >
                      <Avatar size="2xs" style={avatarPair(m.email)}>
                        {memberInitials(m.email).slice(0, 1)}
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate">
                        {m.userId === myUserId ? "Você" : memberName(m.email)}
                      </span>
                      {m.userId === assignedUserId && (
                        <Check size={13} className="shrink-0 text-brand-ink" />
                      )}
                    </DropdownMenuItem>
                  ))}
                  {attendant && (
                    <DropdownMenuItem
                      onSelect={() => onAssign(null)}
                      className="mt-1 border-t border-line pt-1 text-ink-3 hover:text-ink-2 focus:text-ink-2"
                    >
                      Soltar a conversa
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Interruptor da IA. Estava em 40px e dominava a faixa; agora é um
              controle do degrau `control`, do mesmo tamanho dos outros. */}
            {/* A pílula INTEIRA é a chave: o Root do Radix é ela, não o trilho.
              Assim o rótulo continua dentro do alvo de clique e o anel de foco
              cerca a pílula, como sempre cercou. Ver components/ui/switch.tsx. */}
            {iaState !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Switch
                    checked={!iaPausada}
                    onCheckedChange={onToggleIa}
                    disabled={readOnly}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-2 rounded-lg border pl-2.5 pr-2 text-apoio font-semibold transition-colors",
                      // ⚠️ PAUSADA É ÂMBAR, e não o cinza de antes. Âmbar neste
                      // produto quer dizer "precisa de você", que é exatamente o
                      // que uma IA pausada significa: a partir daqui ninguém
                      // responde sozinho. O cinza dizia "controle desligado",
                      // como se fosse uma preferência.
                      iaPausada
                        ? "border-warn-line bg-warn-surface text-warn-ink"
                        : "border-brand-line bg-brand-surface text-brand-ink",
                    )}
                  >
                    {/* O rótulo voltou a dizer só o estado da IA. Ele nomeava o
                        responsável ("Você atendendo", "Bruna atendendo") porque
                        o chip de quem atende morava numa faixa abaixo; agora os
                        dois estão lado a lado, e repetir o nome aqui seria a
                        mesma informação duas vezes em dois centímetros. */}
                    {iaPausada ? "IA pausada" : "IA ligada"}
                    <SwitchTrack checked={!iaPausada}>
                      <SwitchThumb checked={!iaPausada} />
                    </SwitchTrack>
                  </Switch>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {readOnly
                    ? "Conta bloqueada: a IA não atende enquanto a assinatura não estiver em dia"
                    : iaPausada
                      ? "IA pausada, clique para reativar (a IA volta a responder)"
                      : "IA ativa, clique para assumir (a IA para de responder)"}
                </TooltipContent>
              </Tooltip>
            )}

            {/* O botão do painel voltou a ser SÓ ÍCONE (pedido do dono,
              23/09/2026: o rótulo "Ocultar cliente" era texto demais no
              cabeçalho). O nome fica no `aria-label` e no tooltip. Aceso, ele
              usa o par surface/ink da marca, nunca `fill` como tinta. */}
            {onToggleContext && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-control"
                    onClick={onToggleContext}
                    aria-label={contextOpen ? "Ocultar cliente" : "Ver cliente"}
                    className={cn(
                      "hidden lg:flex",
                      contextOpen &&
                      "border-brand-line bg-brand-surface text-brand-ink",
                    )}
                  >
                    <PanelRight size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {contextOpen ? "Ocultar cliente" : "Ver cliente"}
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>

        {/* ⚠️ A FAIXA DAS TAGS SAIU daqui em 18/09/2026, junto com o redesenho da
          coluna do cliente: as tags moram lá agora, que é onde o desenho as põe e
          onde o resto do cadastro do contato já estava. Enquanto as duas existiam,
          a mesma tag aparecia duas vezes na mesma tela. Com a linha fora, o
          cabeçalho fecha nos 62px do desenho, em vez dos 73px que sobravam com
          uma faixa vazia de 10px.
          Quem estava aqui e JÁ TINHA SUBIDO é o chip de quem atende: ele mora na
          linha do nome, junto da chave da IA. */}
      </header>
    </>
  );
}
