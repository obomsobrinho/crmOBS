import Link from "next/link";
import {
  Clock3,
  CheckCircle2,
  MessageSquareQuote,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ESPERA_AVISO_MS } from "@/lib/painel";

// Blocos pequenos do painel, sem estado, juntos num arquivo só para a página não
// virar um arquivo de 400 linhas. Nenhum deles calcula nada: quem calcula é a
// página, por RLS, e o /design passa mock. Duas opiniões sobre o mesmo número é
// o começo de um número inventado.

// ---------------------------------------------------------------------------
// A fila, no cabeçalho da página
// ---------------------------------------------------------------------------

/**
 * Quem está esperando você, em UMA LINHA, ao lado do título da página.
 *
 * ⚠️ SAIU DA TRILHA E VIROU LINHA DE CABEÇALHO (rodada 3). Antes ocupava um
 * cartão inteiro na coluna da direita para mostrar um número que na maioria dos
 * dias é zero. Como `/painel` é onde o dono cai ao entrar, o lugar certo dessa
 * informação é a primeira linha que ele lê, e o tamanho certo dela é uma linha.
 *
 * ⚠️ NEUTRA ATÉ `ESPERA_AVISO_MS`, ÂMBAR DEPOIS. O limiar está em lib/painel.ts,
 * nomeado, porque veio da ferramenta de desenho e não do dono do produto: âmbar
 * em toda fila ensinaria a ignorar o âmbar.
 *
 * Sem selo de variação de propósito: é foto de AGORA e não período, e comparar
 * "agora" com "agora da semana passada" não significa nada.
 */
export function PainelFilaLinha({
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
  if (quantas === null) {
    return (
      <p data-slot="painel-fila" className="text-apoio text-ink-3">
        Não foi possível medir a fila agora.
      </p>
    );
  }

  // Zero é presente, não vazio: é a frase que diz que ele pode ir dormir.
  if (quantas === 0) {
    return (
      <p
        data-slot="painel-fila"
        className="flex items-center gap-2 text-apoio text-ink-2"
      >
        <CheckCircle2 size={15} className="shrink-0 text-human-ink" />
        Ninguém está esperando você agora.
      </p>
    );
  }

  const urgente = esperaMs !== null && esperaMs >= ESPERA_AVISO_MS;

  return (
    <Link
      href={href}
      data-slot="painel-fila"
      data-urgente={urgente ? "sim" : "nao"}
      className={`painel-pressiona flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-apoio transition-colors ${
        urgente
          ? "border-warn-line bg-warn-surface text-warn-ink hover:brightness-105"
          : "border-line bg-bloco text-ink-2 hover:bg-[var(--active-bg)]"
      }`}
    >
      <Clock3
        size={15}
        className={`shrink-0 ${urgente ? "text-warn-ink" : "text-ink-3"}`}
      />
      <span className="font-semibold tabular-nums">{quantas}</span>
      {quantas === 1 ? "pessoa esperando" : "pessoas esperando"}
      {espera && <span className="text-ink-3">· a mais antiga {espera}</span>}
      <ArrowRight size={13} aria-hidden className="shrink-0" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Assuntos em alta (SEM DADO AINDA)
// ---------------------------------------------------------------------------

/**
 * O que mais perguntam para a IA.
 *
 * ⚠️ ESTE BLOCO NÃO TEM DADO, E O ESTADO VAZIO É HONESTO DE PROPÓSITO.
 * Classificar o ASSUNTO de cada turno é instrumentação que não existe:
 * `conversation_qualifications` guarda `action`, `summary` e
 * `preferencia_horario`, e nenhuma das três diz sobre o que a pessoa perguntou.
 *
 * Três regras fazem isto ser honesto em vez de enganoso, e nenhuma é opcional:
 *
 * 1. **O número é literalmente `XX`.** Nunca um valor plausível, nunca borrado,
 *    nunca esmaecido. O eixo do produto é que a IA não inventa; um print de um
 *    "17" borrado que alguém amplia destrói exatamente isso.
 * 2. **Os rótulos são POSICIONAIS, não conteúdo.** "1º assunto mais perguntado",
 *    e não "Garantia da lente antirreflexo". Escrever um assunto de mentira
 *    daria a entender que o sistema já sabe qual é e só não contou, que é uma
 *    mentira mais sutil que o número.
 * 3. **As barras são CINZAS.** Roxo é a cor de dado real nesta tela, e barra
 *    roxa lê como medição.
 *
 * ⚠️ Este bloco some SOZINHO quando o dado existir: quem decide é a página, que
 * só chama isto enquanto a lista vier vazia. Não existe interruptor manual.
 */
export function PainelAssuntos({
  hrefPedidos = "/inbox",
}: {
  hrefPedidos?: string;
}) {
  // Comprimentos variados só para mostrar a FORMA do bloco. Não representam
  // contagem nenhuma, e por isso são cinza.
  const formas = [72, 48, 30];

  return (
    <section
      data-slot="painel-assuntos"
      className="rounded-xl border border-line bg-raised p-5 shadow-[var(--panel-shadow)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
          <TrendingUp size={13} aria-hidden />
          Assuntos em alta
        </h2>
        <Badge variant="tracejado">Em breve</Badge>
      </div>

      <ol className="space-y-3">
        {formas.map((largura, i) => (
          <li key={largura} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-apoio text-ink-3">
                {i + 1}º assunto mais perguntado
              </p>
              <div className="mt-1.5 h-1 rounded-sm bg-bloco">
                <div
                  className="h-full rounded-sm bg-ink-faint"
                  style={{ width: `${largura}%` }}
                />
              </div>
            </div>
            <span className="shrink-0 font-display text-titulo tabular-nums text-ink-faint">
              XX
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-legenda text-ink-3">
        Um assunto começa a aparecer aqui quando se repete algumas vezes na
        semana. Ainda não medimos isso, e preferimos não mostrar número antes de
        ter como contar.
      </p>
      <Link
        href={hrefPedidos}
        className="painel-pressiona mt-3 flex w-fit items-center gap-1.5 text-legenda font-semibold text-brand-ink transition-opacity hover:opacity-80"
      >
        Ver os pedidos recentes
        <ArrowRight size={13} aria-hidden />
      </Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// A última coisa que o agente respondeu
// ---------------------------------------------------------------------------

/**
 * Uma frase real, do jeito que saiu.
 *
 * POR QUE ISTO VALE MAIS QUE UM AGREGADO: o medo do dono não é estatístico, é
 * linguístico. Ele quer saber se essa coisa fala como a empresa dele ou como um
 * robô de banco. Uma frase resolve o que dez números não resolvem.
 *
 * ⚠️ REGRA OBJETIVA, NUNCA ESCOLHIDA A DEDO. Quem escolhe é `escolherVerbatim`
 * em lib/painel.ts, e a regra mudou na rodada 3: era "a mais recente da IA" e
 * caía em "Perfeito, até amanhã!" metade das vezes. Agora é a mais recente de
 * uma conversa que a IA atendeu SOZINHA, com reserva por comprimento. Um dia ela
 * vai mostrar uma resposta ruim no topo do painel, e isso é o ponto: é o caminho
 * mais curto até o conserto.
 */
export function PainelUltimaResposta({
  mensagens,
  nome,
  quando,
  href,
  sozinha,
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
  /** A conversa correu sem ninguém do time responder. */
  sozinha: boolean;
}) {
  return (
    <section
      data-slot="painel-ultima-resposta"
      className="rounded-xl border border-line bg-raised p-5 shadow-[var(--panel-shadow)]"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
          <MessageSquareQuote size={13} aria-hidden />A última resposta do agente
        </h2>
        {/* ⚠️ A prancha escreve "a mais recente" aqui porque foi desenhada antes
            de a regra de escolha mudar. Hoje é a mais recente de uma conversa
            que a IA atendeu SOZINHA, e repetir o texto antigo descreveria errado
            o que a tela faz. */}
        <span className="shrink-0 text-legenda text-ink-3">
          {sozinha ? "atendida só pela IA" : "a mais recente"}
        </span>
      </div>
      {/* Uma linha por mensagem, como saiu no WhatsApp: o agente responde em 1
          ou 2 mensagens, e juntar as duas num parágrafo só faria a citação
          parecer um texto corrido que ele nunca mandou. */}
      <div className="space-y-1.5 border-l-2 border-brand-line pl-3">
        {mensagens.map((m, i) => (
          <p key={i} className="text-corpo italic text-ink-2">
            {m}
          </p>
        ))}
      </div>
      {/* Rodapé de duas pontas: quando e para quem à esquerda, o caminho para a
          conversa à direita. */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
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
