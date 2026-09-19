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
import ContactTags from "./ContactTags";

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
// ⚠️ ESTRUTURA REFEITA EM 18/09/2026, pelo desenho aprovado (a coluna da direita
// de `atendimento.html`). Quatro mudanças de ESTRUTURA, e não de enfeite:
//
// 1. A coluna deixou de ser uma pilha de seções separadas por um fio interno e
//    passou a ser BLOCOS: o primeiro (identificação, números e tags) tem
//    superfície própria e fecha com uma borda que atravessa a coluna inteira.
//    Por isso o respiro saiu da raiz (`p-3.5`) e foi para dentro de cada bloco:
//    com padding na raiz, a borda do bloco nascia recuada dos dois lados e lia
//    como sublinhado de texto, não como divisão de bloco.
// 2. OS DOIS NÚMEROS SUBIRAM. Eram uma linha de rodapé em 12px cinza,
//    "Cliente desde 20 jul · 68 mensagens", colada no pé da coluna; agora são
//    dois cartõezinhos logo abaixo do nome, cada um com o valor em cima e o
//    rótulo embaixo. É a diferença entre uma nota de rodapé e um dado.
//    ⚠️ O RODAPÉ NÃO VOLTA. O desenho ainda traz a linha antiga no pé, mas com
//    `margin-top:auto` dentro de um `overflow:hidden`: medida no navegador, ela
//    cai em y=1090 numa coluna que termina em 1080, ou seja, NUNCA aparece. É
//    sobra da versão anterior do desenho. Trazer as duas coisas poria o mesmo
//    número duas vezes na mesma coluna, que é exatamente como um produto começa
//    a ter duas opiniões sobre o mesmo dado.
// 3. AS TAGS ENTRARAM AQUI, vindas da segunda faixa do cabeçalho da conversa.
//    Ver o comentário de `ContactTags`, que explica por que a faixa de lá
//    parou de desenhar.
// 4. A ordem virou a do desenho: identificação, Dados, Notas. Antes as notas
//    vinham antes do cadastro. Cadastro primeiro é o que a pessoa procura
//    quando abre a coluna ("quem é esse?"); nota é o que ela lê depois.
//
// A seção "Atendimento" saiu daqui na migração de UI: quem atende agora é um
// chip no cabeçalho da conversa, e ter os dois era a mesma decisão em dois
// lugares.
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
  /** ⚠️ `clientId` VOLTOU (18/09/2026) porque as tags vieram para cá: criar e
   *  aplicar rótulo é escrita em `tags`/`conversation_tags`, que são por tenant.
   *  Ele tinha saído em 18/09 junto com o Entendimento, quando nada nesta coluna
   *  consultava por tenant. */
  clientId: string;
  editableName: string | null;
  customFields: Record<string, unknown> | null;
  contactExists: boolean;
}) {
  const displayName = name || prettyPhone(phone);
  const ini = initials(name);
  const number = prettyPhone(phone);

  return (
    <div className="flex flex-col pb-4">
      {/* BLOCO 1: quem é a pessoa. Identificação, os dois números de contexto e
          as tags, os três dentro da mesma caixa e fechados por uma borda que
          atravessa a coluna (`border-line-soft`, o divisor INTERNO de cartão).
          Respiro medido no desenho: 14px em cima, 16px nas laterais, 13px
          embaixo, 10px entre as três partes. */}
      <div className="flex flex-col gap-2.5 border-b border-line-soft px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2.5">
          {/* 40px, o mesmo degrau do avatar do cabeçalho da conversa, que é o
              que o desenho mostra. Era 44px (`xl`), e o contato aparecia maior
              na lateral do que no topo da própria conversa.
              ⚠️ O desenho desenha este avatar como quadrado de raio 13px, e ele
              continua REDONDO aqui de propósito: o cabeçalho da conversa já foi
              aplicado e ficou redondo, e duas formas de avatar na mesma tela é
              pior do que uma divergência assumida contra a prancha. */}
          <Avatar size="lg" style={avatarPair(phone)}>
            {ini ?? <User size={16} />}
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div
              data-slot="painel-nome"
              className="truncate text-corpo font-semibold text-ink"
            >
              {displayName}
            </div>
            {/* O TELEFONE é o endereço de WhatsApp da pessoa, e por isso ponto
                verde e tinta verde (`human-ink`, o papel de TINTA, nunca
                `fill`), igual ao cabeçalho da conversa. Era cinza de rodapé.
                ⚠️ Aqui ele CONTINUA link, ao contrário do cabeçalho: existe ação
                de verdade por trás (abrir a conversa no WhatsApp), que é o que
                falta lá. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  data-slot="painel-telefone"
                  href={`https://wa.me/${phoneDigits(phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-1.5 text-legenda font-semibold text-human-ink transition-opacity hover:opacity-80"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-human"
                  />
                  <span className="truncate">{number}</span>
                </a>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Abrir esta conversa no WhatsApp
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* OS DOIS NÚMEROS DE CONTEXTO. Valor em cima, rótulo embaixo, cada um
            ocupando metade da largura. */}
        <div className="flex gap-1.5">
          <Metrica
            valor={fmtDate(firstMessageAt)}
            rotulo="Cliente desde"
            suppressHydrationWarning
          />
          <Metrica
            valor={String(messageCount)}
            rotulo={messageCount === 1 ? "Mensagem" : "Mensagens"}
          />
        </div>

        <ContactTags
          conversationId={conversationId}
          clientId={clientId}
        />
      </div>

      {/* ⚠️ O "Entendimento" SAIU daqui em 18/09/2026: virou a faixa "O cliente
          quer" no topo da conversa. Ter os dois seria a mesma frase duas vezes na
          mesma tela, e a de cima é a que a pessoa lê primeiro. O componente
          continua existindo, e agora tem um lugar só. */}

      {!contactExists && (
        /* Este número ainda não tem linha em `dados_cliente` (quem cria é o n8n,
           na primeira mensagem). Sem o aviso, o bloco "Dados" simplesmente não
           aparecia e a pessoa ficava sem saber por quê.
           ⚠️ O desenho põe aqui um botão "Salvar contato". Ele NÃO foi feito:
           não existe caminho no produto que insira em `dados_cliente` pelo
           browser (o grant é de UPDATE em colunas, e todo INSERT passa pelo n8n
           ou pela importação). Desenhar o botão seria prometer uma ação que não
           existe, então o aviso fica só com o texto, e a frase foi reescrita
           para não mandar salvar o que não dá para salvar. */
        <div className="mx-3 mt-3 rounded-lg border border-dashed border-warn-line bg-warn-surface p-3">
          <span
            className="text-apoio text-ink-2"
            style={{ textWrap: "pretty" }}
          >
            Este número ainda não está na sua agenda. Enquanto isso não dá para
            guardar nome nem campos personalizados por aqui.
          </span>
        </div>
      )}

      <ContactFields
        phone={phone}
        initialDisplayName={editableName}
        initialCustomFields={customFields}
        editable={contactExists}
      />

      <ContactNotes
        conversationId={conversationId}
        myUserId={myUserId}
        members={members}
      />
    </div>
  );
}

/**
 * Um dos dois números de contexto.
 *
 * Valor em cima, rótulo embaixo, dentro de um bloco tingido (`bg-bloco`, a
 * superfície de bloco DENTRO de cartão) com raio interno de 10px. Medidas do
 * desenho: 7px/10px de respiro, 1px entre as duas linhas.
 *
 * ⚠️ O valor é `apoio` (13px) e não os 14px do desenho: 14 não é papel desta
 * casa, e a escala tipográfica (18/16/15/13/12) vale mais do que um pixel de
 * fidelidade. O que o desenho pede de verdade aqui é a INVERSÃO de peso, valor
 * forte sobre rótulo fraco, e isso está.
 */
function Metrica({
  valor,
  rotulo,
  suppressHydrationWarning,
}: {
  valor: string;
  rotulo: string;
  suppressHydrationWarning?: boolean;
}) {
  return (
    <span
      data-slot="painel-metrica"
      className="flex min-w-0 flex-1 flex-col gap-px rounded-lg bg-bloco px-2.5 py-[7px]"
    >
      <span
        className="truncate text-apoio font-semibold tracking-[-0.01em] text-ink"
        suppressHydrationWarning={suppressHydrationWarning}
      >
        {valor}
      </span>
      <span className="truncate text-legenda font-normal text-ink-2">
        {rotulo}
      </span>
    </span>
  );
}
