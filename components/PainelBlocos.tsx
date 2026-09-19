import Link from "next/link";
import { CheckCircle2, MessageSquareQuote, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { ESPERA_AVISO_MS } from "@/lib/painel";

// Blocos pequenos do painel, sem estado, juntos num arquivo só para a página não
// virar um arquivo de 400 linhas. Nenhum deles calcula nada: quem calcula é a
// página, por RLS, e o /design passa mock. Duas opiniões sobre o mesmo número é
// o começo de um número inventado.

// ---------------------------------------------------------------------------
// A fila do "precisa de você"
// ---------------------------------------------------------------------------

/**
 * A fila como CARTÃO DA TRILHA, que é como a prancha da rodada 3 desenha.
 *
 * A IDADE vem junto da contagem porque ela é a informação: "3" é uma fila,
 * "a mais antiga há 12 minutos" é um problema.
 *
 * ⚠️ NEUTRA ATÉ `ESPERA_AVISO_MS`, ÂMBAR DEPOIS. O limiar está em lib/painel.ts,
 * nomeado, porque veio da ferramenta de desenho e não do dono do produto: âmbar
 * em toda fila ensinaria a ignorar o âmbar. Na versão âmbar a caixa e a altura
 * são AS MESMAS; o que muda é fundo, borda e tinta.
 *
 * Sem selo de variação de propósito: é foto de AGORA e não período, e comparar
 * "agora" com "agora da semana passada" não significa nada.
 */
export function PainelFilaCartao({
  quantas,
  esperaMs,
  espera,
  href = "/inbox",
}: {
  /** Conversas com handoff em aberto agora. `null` = não foi possível medir. */
  quantas: number | null;
  /** Espera da mais antiga, em ms. `null` quando não há fila. */
  esperaMs: number | null;
  /** A mesma espera, já legível ("há 12 minutos"). */
  espera: string;
  href?: string;
}) {
  const urgente =
    quantas !== null &&
    quantas > 0 &&
    esperaMs !== null &&
    esperaMs >= ESPERA_AVISO_MS;

  return (
    <section
      data-slot="painel-fila"
      data-urgente={urgente ? "sim" : "nao"}
      className={`rounded-xl border p-6 ${
        urgente
          ? "border-warn-line bg-warn-surface"
          : "border-line bg-raised shadow-[var(--panel-shadow)]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2
          className={`text-rotulo uppercase ${
            urgente ? "text-warn-ink" : "text-ink-3"
          }`}
        >
          Precisa de você
        </h2>
        <span className="shrink-0 text-legenda text-ink-3">agora</span>
      </div>

      {quantas === null ? (
        <p className="mt-2 text-apoio text-ink-3">
          Não foi possível medir a fila agora.
        </p>
      ) : quantas === 0 ? (
        // Zero é presente, não vazio: é a frase que diz que ele pode ir dormir.
        <p className="mt-3 flex items-center gap-2 text-apoio text-ink-2">
          <CheckCircle2 size={16} className="shrink-0 text-human-ink" />
          Ninguém está esperando você agora.
        </p>
      ) : (
        <>
          {/* ⚠️ A FRASE ACOMPANHA O NUMERAL, em corpo 600 na tinta cheia, e não
              em apoio na tinta 2. É assim na prancha, e a razão é que "3" e
              "pessoas esperando você" são UMA informação: enfraquecer a segunda
              metade faz o número parecer um enfeite ao lado de um rótulo. */}
          <p className="mb-1.5 mt-2.5 flex items-baseline gap-2.5">
            <span
              className={`font-display text-numero tabular-nums ${
                urgente ? "text-warn-ink" : "text-ink"
              }`}
            >
              {quantas}
            </span>
            <span className="text-corpo font-semibold text-ink">
              {quantas === 1
                ? "pessoa esperando você"
                : "pessoas esperando você"}
            </span>
          </p>
          <p className="text-apoio text-ink-2">
            {espera ? `A mais antiga ${espera}. ` : ""}A IA avisou que ia
            verificar.
          </p>
          {/* ⚠️ `Button` com `asChild`, e NÃO classe solta. Isto era um `<Link>`
              com `h-9 rounded-[10px]` escrito à mão, que é literalmente o
              `size="primary"` da base (36px = --h-primary, 10px = rounded-lg)
              reescrito em outro lugar. Quando o degrau de altura mudar, este
              botão só mudaria junto se alguém lembrasse dele. */}
          <Button
            asChild
            variant={urgente ? "warn" : "outline"}
            size="primary"
            className={`painel-pressiona mt-3.5 w-full justify-center ${
              urgente ? "" : "bg-bloco"
            }`}
          >
            <Link href={href}>
              Ver quem está esperando
              <ArrowRight size={14} aria-hidden />
            </Link>
          </Button>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// A última resposta do agente
// ---------------------------------------------------------------------------

/**
 * Uma frase real, do jeito que saiu.
 *
 * POR QUE ISTO VALE MAIS QUE UM AGREGADO: o medo do dono não é estatístico, é
 * linguístico. Ele quer saber se essa coisa fala como a empresa dele ou como um
 * robô de banco. Uma frase resolve o que dez números não resolvem.
 *
 * ⚠️ REGRA OBJETIVA, NUNCA ESCOLHIDA A DEDO. Quem escolhe é `escolherVerbatim`
 * em lib/painel.ts. Um dia ela vai mostrar uma resposta ruim no topo do painel,
 * e isso é o ponto: é o caminho mais curto até o conserto.
 */
export function PainelUltimaResposta({
  mensagens,
  nome,
  quando,
  href,
  etiqueta = "a mais recente",
  pergunta,
  perguntaHora,
  latencia,
  foraDoHorario = false,
}: {
  /**
   * O turno já separado em mensagens.
   *
   * ⚠️ ARRAY e não string: o n8n grava um turno de duas mensagens numa linha só,
   * unido por `" | "`. Quem desfaz é `separarMensagens` em lib/painel.ts. Sem
   * isso a citação sai com um pipe no meio, que é o oposto de mostrar como o
   * agente fala de verdade (medido na Loja Teste em 29/08/2026).
   */
  mensagens: string[];
  /** Nome de quem recebeu, já resolvido por `lib/inbox.ts`. */
  nome: string;
  /** Já legível ("há 14 minutos"). */
  quando: string;
  href: string;
  /** Canto direito do cabeçalho. A prancha usa "a mais recente". */
  etiqueta?: string;
  /**
   * A PERGUNTA do cliente que gerou esta resposta.
   *
   * ⚠️ É ela que dá sentido à citação: a resposta sozinha prova que o agente
   * escreve bem, o PAR prova que ele entendeu. Ausente, o bloco degrada para só
   * a resposta, que é o que dá para mostrar.
   */
  pergunta?: string;
  /** Hora da pergunta, já legível ("21h34"). */
  perguntaHora?: string;
  /**
   * Quanto tempo depois a IA respondeu, já legível ("9 segundos").
   *
   * ⚠️ Opcional porque nem sempre dá para medir: o n8n grava pergunta e resposta
   * na MESMA linha de `chat_messages`, com um único `created_at`, então a
   * diferença entre as duas não existe no dado. Sem ela a frase sai sem o tempo,
   * em vez de inventar um número.
   */
  latencia?: string;
  /** A resposta saiu com a empresa fechada. É a prova do valor, então é selo. */
  foraDoHorario?: boolean;
}) {
  return (
    // ⚠️ Coluna com `overflow-hidden`: é o que permite este cartão ENCOLHER
    // quando a tela é mais baixa. Sem isso o texto da citação virava um piso de
    // altura, e uma resposta longa do agente sozinha empurrava a página para
    // fora da primeira tela. Quem cede é a citação, e só ela.
    <section
      data-slot="painel-ultima-resposta"
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-raised p-6 shadow-[var(--panel-shadow)]"
    >
      <div className="mb-3 flex shrink-0 flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
          <MessageSquareQuote size={13} aria-hidden />A última resposta do agente
        </h2>
        <span className="shrink-0 text-legenda text-ink-3">{etiqueta}</span>
      </div>

      {/* A PERGUNTA primeiro, em balão de recebido, como na conversa. */}
      {pergunta && (
        <>
          <p className="text-legenda text-ink-3">
            {nome} perguntou{perguntaHora ? `, às ${perguntaHora}` : ""}
          </p>
          <p className="mt-1.5 rounded-lg border border-line bg-bloco px-3 py-2 text-apoio text-ink-2">
            {pergunta}
          </p>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p className="text-legenda text-ink-3">
          A IA respondeu{latencia ? `, ${latencia} depois` : ""}
        </p>
        {/* "Fora do horário" é a PROVA do valor: a empresa estava fechada e
            alguém foi atendido. Verde porque é notícia boa, e verde neste
            sistema é estado, não enfeite. */}
        {foraDoHorario && (
          <span className="shrink-0 rounded-full bg-human-surface px-2 py-0.5 text-legenda font-semibold text-human-ink">
            fora do horário
          </span>
        )}
      </div>

      {/* Uma linha por mensagem, como saiu no WhatsApp: o agente responde em 1
          ou 2 mensagens, e juntar as duas num parágrafo só faria a citação
          parecer um texto corrido que ele nunca mandou. */}
      <AreaRolavel className="mt-1.5 min-h-0 flex-1 space-y-1.5 border-l-2 border-brand-line pl-3">
        {mensagens.map((m, i) => (
          <p key={i} className="text-corpo italic text-ink-2">
            {m}
          </p>
        ))}
      </AreaRolavel>

      {/* Rodapé de duas pontas: quando e para quem à esquerda, o caminho para a
          conversa à direita. */}
      <div className="mt-3 flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-legenda text-ink-3">
          {quando} · para {nome}
        </span>
        <Link
          href={href}
          className="painel-pressiona flex shrink-0 items-center gap-1.5 text-legenda font-semibold text-brand-ink transition-opacity hover:opacity-80"
        >
          Ver a conversa
          <ArrowRight size={13} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
