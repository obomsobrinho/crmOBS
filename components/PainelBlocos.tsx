import Link from "next/link";
import {
  Clock3,
  CheckCircle2,
  ShieldQuestion,
  MessageSquareQuote,
  ArrowRight,
  Sparkles,
} from "lucide-react";

// Três blocos pequenos do painel, sem estado, juntos num arquivo só para a
// página não virar um arquivo de 400 linhas. Nenhum deles calcula nada: quem
// calcula é a página, por RLS, e o /design passa mock. Duas opiniões sobre o
// mesmo número é o começo de um número inventado.

// ---------------------------------------------------------------------------
// O que preciso fazer agora
// ---------------------------------------------------------------------------

/**
 * A fila do "precisa de você". É o ÚNICO número acionável do painel e a única
 * coisa colorida abaixo da manchete, e é por isso que ele existe: sem ele a tela
 * é relatório, com ele é tarefa.
 *
 * A IDADE vem junto da contagem porque ela é a informação: "3" é uma fila,
 * "a mais antiga há 6 horas" é um problema.
 *
 * Sem selo de variação de propósito: é foto de AGORA e não período, e comparar
 * "agora" com "agora da semana passada" não significa nada.
 */
export function PainelEspera({
  quantas,
  espera,
  href = "/inbox",
}: {
  /** Conversas com handoff em aberto agora. `null` = não foi possível medir. */
  quantas: number | null;
  /** Espera da mais antiga, já legível ("há 6 horas"). Vazio quando não há. */
  espera: string;
  href?: string;
}) {
  if (quantas === null) {
    return (
      <div className="rounded-xl border border-line bg-raised px-5 py-4 shadow-[var(--panel-shadow)]">
        <p className="text-apoio text-ink-2">
          Não foi possível medir a fila agora. Recarregue a página.
        </p>
      </div>
    );
  }

  // Zero é presente, não vazio: é a frase que diz que ele pode ir dormir.
  if (quantas === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-raised px-5 py-4 shadow-[var(--panel-shadow)]">
        <CheckCircle2 size={20} className="shrink-0 text-human-ink" />
        <p className="text-corpo text-ink">Ninguém está esperando você agora.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-warn-line bg-warn-surface px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <Clock3 size={20} className="shrink-0 text-warn-ink" />
        <div className="min-w-0">
          <p className="text-titulo text-warn-ink">
            {quantas} {quantas === 1 ? "pessoa esperando" : "pessoas esperando"}{" "}
            você
          </p>
          <p className="text-apoio text-ink-2">
            {espera ? `A mais antiga ${espera}. ` : ""}A IA avisou que ia
            verificar e ninguém respondeu ainda.
          </p>
        </div>
      </div>
      <Link
        href={href}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-warn px-3 py-2 text-apoio font-semibold text-[var(--warn-on)] transition-opacity hover:opacity-90"
      >
        Ver quem está esperando
        <ArrowRight size={15} aria-hidden />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// O que a IA passou para você
// ---------------------------------------------------------------------------

export interface Escalada {
  /** Chave estável (id da qualificação). */
  id: number;
  /** Quando, já legível ("há 2 horas"). */
  quando: string;
  /** O resumo que a própria IA escreveu do pedido. */
  texto: string;
  /** A resposta foi retida pelo guardrail (e não uma escalada normal). */
  guardrail: boolean;
  /** Link para a conversa. */
  href: string;
}

/**
 * Transforma o painel de espelho em ferramenta: cada linha é um convite a
 * ensinar o agente, e cada resposta ensinada aumenta o custo de troca.
 *
 * ⚠️ O RÓTULO NÃO É "o que a IA não soube responder", e a diferença não é
 * estética. `action = 'pausar'` também dispara nos gatilhos fixos de escalada,
 * que são política e não buraco de conhecimento. Chamar tudo de "não soube"
 * seria acusar a IA de uma falha que ela não cometeu, num produto cujo eixo é
 * não exagerar. "Passou para você" é o que de fato aconteceu nos dois casos.
 */
export function PainelEscaladas({
  itens,
  hrefBase = "/agente",
}: {
  itens: Escalada[];
  /** Onde "Ensinar a resposta" leva (a base de conhecimento do agente). */
  hrefBase?: string;
}) {
  if (itens.length === 0) return null;

  return (
    <section data-slot="painel-escaladas" className="space-y-3">
      <h2 className="text-rotulo uppercase text-ink-3">
        O que a IA passou para você
      </h2>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--panel-shadow)]">
        {itens.map((it) => (
          <div
            key={it.id}
            className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <ShieldQuestion
                size={16}
                className="mt-0.5 shrink-0 text-ink-faint"
              />
              <div className="min-w-0">
                <Link
                  href={it.href}
                  className="text-corpo text-ink hover:underline"
                >
                  {it.texto}
                </Link>
                <p className="text-legenda text-ink-3">
                  {it.quando} ·{" "}
                  {it.guardrail
                    ? "a resposta foi retida antes de sair"
                    : "precisa de você"}
                </p>
              </div>
            </div>
            <Link
              href={hrefBase}
              className="flex shrink-0 items-center gap-1.5 text-legenda font-semibold text-brand-ink transition-opacity hover:opacity-80"
            >
              <Sparkles size={13} aria-hidden />
              Ensinar a resposta
            </Link>
          </div>
        ))}
      </div>
      <p className="text-legenda text-ink-3">
        Os pedidos mais recentes que a IA escalou. Ensinar a resposta leva para a
        base de conhecimento do agente.
      </p>
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
 * ⚠️ SEMPRE A MAIS RECENTE, NUNCA ESCOLHIDA A DEDO. Um dia ela vai mostrar uma
 * resposta ruim no topo do painel, e isso é o ponto: é o caminho mais curto até
 * o conserto. No dia em que ele descobrir sozinho que a gente escolhia as boas,
 * a perda de confiança é permanente.
 */
export function PainelUltimaResposta({
  texto,
  nome,
  quando,
  href,
}: {
  texto: string;
  /** Nome de quem recebeu, já resolvido por `lib/inbox.ts`. */
  nome: string;
  /** Já legível ("há 14 minutos"). */
  quando: string;
  href: string;
}) {
  return (
    <section
      data-slot="painel-ultima-resposta"
      className="rounded-xl border border-line bg-raised p-5 shadow-[var(--panel-shadow)]"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
          <MessageSquareQuote size={13} aria-hidden />A última coisa que o agente
          respondeu
        </h2>
        <span className="text-legenda text-ink-3">
          {quando} · para {nome}
        </span>
      </div>
      <p className="border-l-2 border-brand-line pl-3 text-corpo italic text-ink-2">
        {texto}
      </p>
      <Link
        href={href}
        className="mt-3 flex w-fit items-center gap-1.5 text-legenda font-semibold text-brand-ink transition-opacity hover:opacity-80"
      >
        Ver a conversa
        <ArrowRight size={13} aria-hidden />
      </Link>
    </section>
  );
}
