"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, MessageCircle, MessageSquareText, Paperclip, UserRound, type LucideIcon } from "lucide-react";
import { cardVariants } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatRotulo } from "@/components/ui/stat";
import { horaNoDiaDe } from "@/lib/fuso";
import { ehNumeroDeAvisos } from "@/lib/avisos";
import { ehAberto, type PedidoItem } from "@/lib/pedidos";
import type { FontePedidos } from "@/lib/pedidos-fonte";
import {
  HISTORIA_VAZIA,
  encaixarNaHistoria,
  fimDepois,
  janelaDoPedido,
  montarSecoes,
  type HistoriaDoPedido,
  type LinhaHistoria,
  type MensagemDaSecao,
} from "@/lib/historia-do-pedido";
import { useCanalConversa } from "@/lib/use-canal-ao-vivo";
import { cn } from "@/lib/utils";

// O QUE ACONTECEU NO PEDIDO, EM SEÇÕES (08/10/2026, redesenho de Pedidos; regra
// em lib/historia-do-pedido.ts). Decisão do dono: nada de linha do tempo, só
// blocos com o que aconteceu, numa COLUNA SÓ em qualquer tela, e só os que têm
// conteúdo:
//   "O que o cliente escreveu" (sempre; vazio diz que não achou; inclui, depois
//   de um divisor, o que ele mandou enquanto o pedido esperava) ->
//   "Orientação do time" (se houve) -> "Resposta da IA" / "Resposta do time".
// Motivo, horários e solução NÃO aparecem aqui: moram só na faixa de fatos.
// Nunca balão de conversa (decisão de 30/09/2026); quem quer a conversa abre.
//
// CARREGA só quando o pedido é aberto (`fonte.historia`, três consultas
// limitadas). TEMPO REAL: enquanto o pedido espera ou a janela do "depois" está aberta, o
// canal da conversa (`useCanalConversa`, `chat_messages` filtrado pelo telefone
// no servidor) encaixa a LINHA que chegou pelo payload, zero consulta; reconectar
// ou voltar o foco relê só este pedido.

type Estado = { carregando: boolean; erro: boolean; historia: HistoriaDoPedido };

export default function SecoesDoPedido({
  p,
  fonte,
  clientId,
  preview,
  numeroAvisos,
  agora,
}: {
  p: PedidoItem;
  fonte: FontePedidos;
  clientId?: string;
  preview: boolean;
  numeroAvisos: string | null;
  /** O "agora" da tela (fixado a cada minuto pelo pai): ler o relógio no render é impuro. */
  agora: number;
}) {
  const closedAt = ehAberto(p) ? null : p.closedAt;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a janela muda só com a abertura e o fechamento
  const janela = useMemo(() => janelaDoPedido(p), [p.openedAt, closedAt]);
  // O número de avisos nunca é conversa (lib/avisos.ts): nada a buscar.
  const ehAvisos = ehNumeroDeAvisos(p.phone, numeroAvisos);
  const [estado, setEstado] = useState<Estado>({ carregando: !ehAvisos, erro: false, historia: HISTORIA_VAZIA });

  const carregar = useCallback(async () => {
    if (ehAvisos) return;
    try {
      const historia = await fonte.historia(p);
      setEstado({ carregando: false, erro: false, historia });
    } catch (e) {
      console.error("mensagens do pedido:", e);
      setEstado((s) => ({ ...s, carregando: false, erro: true }));
    }
    // O pedido muda de objeto a cada evento da lista; o que importa é ele e a janela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte, p.id, p.phone, janela, ehAvisos]);

  // IIFE de propósito: o lint (react-hooks/set-state-in-effect) recusa `void carregar()` direto no efeito.
  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  // Só escuta enquanto o "depois" ainda pode crescer (pedido velho não muda).
  const vivo = !!clientId && !preview && !ehAvisos && (closedAt == null || Date.parse(fimDepois(janela)) > agora);
  useCanalConversa({
    nome: "pedido-secoes",
    tabela: "chat_messages",
    filtro: `phone=eq.${p.phone}`,
    modo: "aplicar",
    ativo: vivo,
    revalidar: () => void carregar(),
    aoEvento: (ev) => {
      if (ev.tipo === "DELETE" || !ev.novo || ev.novo.client_id !== clientId) return;
      // A linha do payload é a do banco (mesmo cast de `useMensagensDaConversa`).
      const linha = ev.novo as LinhaHistoria;
      // Linha igual à que já está na tela (UPDATE sem mudança): mesmo estado, sem render.
      setEstado((s) => {
        const historia = encaixarNaHistoria(s.historia, linha, janela);
        return historia === s.historia ? s : { ...s, historia };
      });
    },
  });

  const secoes = useMemo(() => montarSecoes(estado.historia), [estado.historia]);
  const orientacao = ehAberto(p) ? null : p.orientacao;
  const hora = (iso: string) => horaNoDiaDe(iso, p.openedAt);
  const semCliente = secoes.cliente.length === 0 && secoes.durante.length === 0;

  return (
    <div data-slot="pedido-secoes" className="flex min-w-0 flex-col gap-3">
      <Secao rotulo="O que o cliente escreveu" icone={MessageCircle} slot="pedido-cliente">
        {estado.carregando ? (
          <Vazio slot="pedido-secoes-carregando">Carregando as mensagens…</Vazio>
        ) : estado.erro ? (
          <Vazio>Não foi possível carregar as mensagens. Abra a conversa para ver.</Vazio>
        ) : semCliente ? (
          <Vazio slot="pedido-sem-mensagens">Nenhuma mensagem do cliente encontrada antes do pedido.</Vazio>
        ) : (
          <>
            {secoes.cliente.length > 0 && (
              <Mensagens itens={secoes.cliente} hora={hora} slot="pedido-mensagem-cliente" tom="cliente" />
            )}
            {secoes.durante.length > 0 && (
              <>
                {/* Divisor discreto: daqui para baixo o pedido já estava com o time. */}
                <div data-slot="pedido-depois-do-pedido" className="flex items-center gap-2 text-legenda text-ink-3">
                  <Separator className="w-auto flex-1" />
                  depois do pedido
                  <Separator className="w-auto flex-1" />
                </div>
                {secoes.duranteCortado && (
                  <Vazio slot="pedido-durante-cortado">Há mensagens anteriores a estas: veja na conversa.</Vazio>
                )}
                <Mensagens itens={secoes.durante} hora={hora} slot="pedido-mensagem-durante" tom="cliente" />
              </>
            )}
          </>
        )}
      </Secao>
      {orientacao && (
        <Secao rotulo="Orientação do time" icone={MessageSquareText} slot="pedido-orientacao-secao">
          <p data-slot="pedido-orientacao" className="whitespace-pre-wrap break-words text-corpo text-ink" style={{ textWrap: "pretty" }}>
            {orientacao}
          </p>
        </Secao>
      )}
      {secoes.respostas.map((r) => (
        <Secao
          key={r.quem}
          rotulo={r.quem === "ia" ? "Resposta da IA" : "Resposta do time"}
          icone={r.quem === "ia" ? Bot : UserRound}
          slot={`pedido-resposta-${r.quem}`}
        >
          <Mensagens itens={r.mensagens} hora={hora} slot="pedido-resposta" tom={r.quem} />
        </Secao>
      ))}
    </div>
  );
}

/** Um bloco do detalhe: rótulo com ícone e o conteúdo. É a seção que É o cartão. */
function Secao({
  rotulo,
  icone: Icone,
  slot,
  children,
}: {
  rotulo: string;
  icone: LucideIcon;
  slot: string;
  children: React.ReactNode;
}) {
  return (
    <section data-slot={slot} className={cn(cardVariants({ variant: "secao" }), "flex min-w-0 flex-col gap-3")}>
      <StatRotulo asChild>
        <h3 className="flex items-center gap-1.5">
          <Icone size={13} aria-hidden />
          {rotulo}
        </h3>
      </StatRotulo>
      {children}
    </section>
  );
}

function Vazio({ slot, children }: { slot?: string; children: React.ReactNode }) {
  return (
    <p data-slot={slot} className="text-apoio text-ink-3">
      {children}
    </p>
  );
}

/** Mensagens em citação (fio à esquerda), cada uma com a hora. Nunca balão. */
function Mensagens({
  itens,
  hora,
  slot,
  tom,
}: {
  itens: MensagemDaSecao[];
  hora: (iso: string) => string;
  slot: string;
  tom: "cliente" | "ia" | "time";
}) {
  return (
    <ul className="flex flex-col gap-3">
      {itens.map((m) => (
        <li
          key={m.chave}
          data-mensagem={tom}
          className={cn("flex flex-col gap-1 border-l-2 pl-3", tom === "ia" ? "border-brand-line" : "border-line-strong")}
        >
          {m.texto && (
            <p data-slot={slot} className="whitespace-pre-wrap break-words text-corpo text-ink" style={{ textWrap: "pretty" }}>
              {m.texto}
            </p>
          )}
          <span className="flex items-center gap-1.5 text-legenda tabular-nums text-ink-3" suppressHydrationWarning>
            {m.midia && (
              <>
                <Paperclip size={12} aria-hidden />
                {m.midia}
                <span aria-hidden>·</span>
              </>
            )}
            {hora(m.em)}
          </span>
        </li>
      ))}
    </ul>
  );
}
