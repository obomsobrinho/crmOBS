import Link from "next/link";
import { Clock, CalendarClock, Settings2 } from "lucide-react";
import type { FraseValor, ValorResumo as Resumo } from "@/lib/valor";

// Valor percebido, em frase pronta.
//
// Componente de apresentação puro: a página calcula por RLS e passa o resumo; o
// /design passa mock. NENHUM número é calculado aqui, e é de propósito: a regra
// de valor mora em lib/valor.ts, e duas opiniões sobre o mesmo número é o começo
// de um número inventado.
//
// A diferença de propósito importa: o DashboardCards responde "como foi a
// semana"; aqui a pergunta é "o que eu perderia se cancelasse". Por isso o
// destaque é a FRASE, e não o número solto.
//
// POR QUE EXISTE UMA MANCHETE, e não seis blocos iguais: seis blocos do mesmo
// tamanho não têm manchete, e sem manchete a pessoa não lê nenhum. A frase mais
// forte (a ordem vem de `frasesDeValor`) ganha superfície da marca, largura
// inteira e a frase em corpo maior; o resto desce para a grade. O acumulado
// entra como segunda linha da manchete, porque "213 no mês" convence, mas "1.876
// desde o início" é o que trava a mão de quem ia cancelar.

/** Bloco secundário: número em cima, frase embaixo. */
function Bloco({ numero, texto }: { numero: string; texto: string }) {
  return (
    <div className="rounded-xl border border-line bg-bloco p-5">
      <div className="font-display text-display tabular-nums">{numero}</div>
      <p className="mt-1 text-apoio text-ink-2">{texto}</p>
    </div>
  );
}

/**
 * Só formata com separador de milhar o que É número. `frasesDeValor` devolve
 * "17h" na frase de pico, e passar isso por Number daria "NaN" na tela.
 */
function numeroOuNull(valor: string): string | null {
  const n = Number(valor);
  return valor.trim() !== "" && Number.isFinite(n) ? n.toLocaleString("pt-BR") : null;
}

export default function ValorResumo({
  resumo,
  frases,
  periodo,
  acumulado,
  frasesAcumuladas,
  hrefConfigurar = "/agente",
}: {
  resumo: Resumo;
  frases: FraseValor[];
  /** Rótulo do período, ex.: "em julho de 2026". */
  periodo: string;
  /** Resumo sem janela de data (tudo que a IA já fez nesta conta). */
  acumulado?: Resumo;
  /** Frases do acumulado, já com o rótulo "desde o início". */
  frasesAcumuladas?: FraseValor[];
  /** Link para configurar o horário, quando falta. */
  hrefConfigurar?: string;
}) {
  const doAcumulado = frasesAcumuladas ?? [];

  // Conta nova ainda não tem mês fechado, e painel vazio no primeiro mês é
  // exatamente quando o cliente mais duvida da ferramenta. Nesse caso a manchete
  // passa a ser o acumulado, e o rótulo do período muda junto: as frases já
  // dizem "desde o início" dentro delas, mas o título não pode mentir.
  const caiuNoAcumulado = frases.length === 0 && doAcumulado.length > 0;
  const mostradas = caiuNoAcumulado ? doAcumulado : frases;
  const resumoMostrado = caiuNoAcumulado ? acumulado ?? resumo : resumo;
  const rotuloPeriodo = caiuNoAcumulado ? "desde o início" : periodo;

  const manchete = mostradas[0] ?? null;
  const resto = mostradas.slice(1);

  // Total acumulado da MESMA frase da manchete. Só aparece quando a manchete é
  // do mês (senão diria a mesma coisa duas vezes) e quando o valor é numérico.
  const totalDaManchete =
    manchete && !caiuNoAcumulado
      ? numeroOuNull(doAcumulado.find((f) => f.key === manchete.key)?.numero ?? "")
      : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CalendarClock size={16} className="text-brand-ink" />
        <h2 className="text-corpo font-semibold">O que a IA fez por você</h2>
        <span className="text-legenda text-ink-3">{rotuloPeriodo}</span>
        {/* Contexto, não métrica nova: `recebidas` já vem no resumo. Fora quando
            é zero, pela mesma regra das frases. */}
        {resumoMostrado.recebidas > 0 && (
          <span className="text-legenda text-ink-3">
            · {resumoMostrado.recebidas.toLocaleString("pt-BR")} mensagens recebidas
          </span>
        )}
      </div>

      {/* Sem horário configurado, o número mais forte do resumo (fora do
          horário) não existe. Dizer isso é melhor que estimar: o cliente
          confere no WhatsApp dele. */}
      {!resumo.temHorario && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warn-line bg-warn-surface px-4 py-3">
          <Settings2 size={16} className="mt-0.5 shrink-0 text-warn-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-apoio font-medium text-warn-ink">
              Falta o horário de atendimento
            </p>
            <p className="text-apoio text-ink-2">
              Sem ele não dá para dizer quantas mensagens a IA respondeu fora do
              horário, que é o número mais forte deste resumo. Nós não estimamos
              esse dado.
            </p>
          </div>
          <Link
            href={hrefConfigurar}
            className="shrink-0 text-legenda font-medium text-warn-ink underline transition-opacity hover:opacity-80"
          >
            Configurar
          </Link>
        </div>
      )}

      {!manchete ? (
        <div className="rounded-xl border border-line bg-bloco p-5">
          <div className="flex items-center gap-2 text-ink-2">
            <Clock size={16} className="text-ink-3" />
            <span className="text-apoio font-medium">
              Ainda sem movimento no período
            </span>
          </div>
          <p className="mt-1 text-legenda text-ink-3">
            Este resumo fica mais forte a cada mês de atendimento acumulado.
          </p>
        </div>
      ) : (
        <>
          {/* Manchete. Superfície da marca e largura inteira: é a frase que a
              pessoa precisa ler mesmo se não ler mais nada nesta tela. */}
          <div className="rounded-xl border border-brand-line bg-brand-surface p-6">
            <div className="font-display text-display tabular-nums text-brand-ink">
              {manchete.numero}
            </div>
            <p className="mt-1.5 text-titulo">{manchete.texto}</p>
            {totalDaManchete && (
              <p className="mt-2.5 text-apoio text-ink-2">
                <span className="font-semibold tabular-nums text-ink">
                  {totalDaManchete}
                </span>{" "}
                desde o início desta conta.
              </p>
            )}
          </div>

          {resto.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {resto.map((f) => (
                <Bloco key={f.key} numero={f.numero} texto={f.texto} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
