import Link from "next/link";
import { Clock, CalendarClock, Settings2 } from "lucide-react";
import type { FraseValor, ValorResumo as Resumo } from "@/lib/valor";
import type { BarraHora } from "@/lib/painel";
import PainelHoras from "@/components/painel/PainelHoras";
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";

// Valor percebido, em frase pronta.
//
// Componente de apresentação puro: a página calcula por RLS e passa o resumo; o
// /design passa mock. NENHUM número é calculado aqui, e é de propósito: a regra
// de valor mora em lib/valor.ts, e duas opiniões sobre o mesmo número é o começo
// de um número inventado.
//
// A diferença de propósito importa: a operação responde "como foi a
// semana"; aqui a pergunta é "o que eu perderia se cancelasse". Por isso o
// destaque é a FRASE, e não o número solto.
//
// POR QUE EXISTE UMA MANCHETE, e não seis blocos iguais: seis blocos do mesmo
// tamanho não têm manchete, e sem manchete a pessoa não lê nenhum. A frase mais
// forte (a ordem vem de `frasesDeValor`) ganha superfície da marca, largura
// inteira e a frase em corpo maior; o resto desce para a grade. O acumulado
// entra como segunda linha da manchete, porque "213 no mês" convence, mas "1.876
// desde o início" é o que trava a mão de quem ia cancelar.

/**
 * Bloco secundário: número em cima, frase embaixo.
 *
 * `compacto` (numeral de 18px) e não `padrao` (24px), e isso é o ponto da rodada
 * de 26/08: antes os DEZ números do painel usavam o mesmo `text-display`, e a
 * manchete só se distinguia por cor de fundo. Com 32 / 24 / 18 a tela passa a ter
 * ordem de leitura antes de qualquer palavra ser lida.
 */
function Bloco({
  numero,
  texto,
  periodo,
}: {
  numero: string;
  texto: string;
  periodo: string;
}) {
  return (
    <Stat variant="elevado" tamanho="compacto">
      <StatValor tamanho="compacto">{numero}</StatValor>
      <StatFrase tamanho="compacto">{texto}</StatFrase>
      <StatLegenda>{periodo}</StatLegenda>
    </Stat>
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

/**
 * Qual pedaço renderizar.
 *
 * O painel usa os dois separadamente porque entre a manchete e o resto das
 * frases entram três blocos de outro assunto (a fila, os cartões de operação e
 * as escaladas), e a manchete precisa ficar no topo da tela. `tudo` continua
 * sendo o padrão para quem renderiza o resumo inteiro de uma vez, que é o caso
 * de `/design/valor`.
 */
export type ParteDoResumo = "tudo" | "manchete" | "resto";

export default function ValorResumo({
  resumo,
  frases,
  periodo,
  acumulado,
  frasesAcumuladas,
  hrefConfigurar = "/agente",
  parte = "tudo",
  horas,
  rotuloHorario = "",
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
  parte?: ParteDoResumo;
  /**
   * As 24 colunas do gráfico de hora, JÁ calculadas por `barrasDeHora` sobre a
   * MESMA janela da manchete. Ausente = sem gráfico, e é o caso de quem não tem
   * horário configurado.
   */
  horas?: BarraHora[];
  /** Horário da empresa em uma linha, para a legenda do gráfico. */
  rotuloHorario?: string;
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

  // O gráfico de hora acompanha a manchete de "fora do horário" e MAIS NENHUMA.
  // A chave vem de `frasesDeValor`, que é quem ordena as frases por força; se a
  // mais forte do período for outra, o gráfico não tem com o que fechar.
  const mostrarHoras =
    !!horas && horas.length > 0 && manchete?.key === "fora-do-horario";

  // Total acumulado da MESMA frase da manchete. Só aparece quando a manchete é
  // do mês (senão diria a mesma coisa duas vezes) e quando o valor é numérico.
  const totalDaManchete =
    manchete && !caiuNoAcumulado
      ? numeroOuNull(doAcumulado.find((f) => f.key === manchete.key)?.numero ?? "")
      : null;

  // Escopo da manchete, numa linha só. Era um `h2` de seção mais dois spans
  // acima do cartão; virou a legenda DO cartão, porque o período é do número e
  // não da seção. Foi assim que a tela mostrava "9 leads" (7 dias) e "19 leads"
  // (mês) sem nenhum dos dois dizer de quando era.
  const escopo =
    resumoMostrado.recebidas > 0
      ? `${rotuloPeriodo} · ${resumoMostrado.recebidas.toLocaleString("pt-BR")} mensagens recebidas`
      : rotuloPeriodo;

  // O "resto" é só a grade das frases secundárias: sem manchete, sem o aviso de
  // horário (que mora junto da manchete, onde o número que falta apareceria).
  if (parte === "resto") {
    if (resto.length === 0) return null;
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {resto.map((f) => (
          <Bloco
            key={f.key}
            numero={f.numero}
            texto={f.texto}
            periodo={rotuloPeriodo}
          />
        ))}
      </div>
    );
  }

  const soManchete = parte === "manchete";

  return (
    <section className="space-y-3">
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
        <Stat variant="vazio">
          <StatTopo>
            <StatRotulo asChild>
              <h2>O que a IA fez por você</h2>
            </StatRotulo>
          </StatTopo>
          <div className="flex items-center gap-2 text-ink-2">
            <Clock size={16} className="text-ink-3" />
            <span className="text-apoio font-medium">
              Ainda sem movimento no período
            </span>
          </div>
          <StatLegenda>
            Este resumo fica mais forte a cada mês de atendimento acumulado.
          </StatLegenda>
        </Stat>
      ) : (
        <>
          {/* Manchete. Superfície da marca, largura inteira e o ÚNICO numeral de
              32px da tela: é a frase que a pessoa precisa ler mesmo se não ler
              mais nada aqui. Antes ela tinha o mesmo tamanho de número dos outros
              nove blocos e se distinguia só pela cor de fundo. */}
          <Stat variant="marca" tamanho="manchete" className="painel-cartao">
            <StatTopo>
              {/* `h2` de verdade: o cartão É a seção, e o rótulo é o título dela.
                  Sem isso a página ficaria com um `h1` e nenhum `h2`. */}
              <StatRotulo asChild>
                <h2 className="flex items-center gap-1.5">
                  <CalendarClock size={13} aria-hidden />O que a IA fez por você
                </h2>
              </StatRotulo>
            </StatTopo>

            {/* Frase à esquerda, gráfico à direita. A coluna da esquerda é fixa
                em 400px para o numeral e a frase não mudarem de largura quando o
                gráfico aparece ou some. */}
            <div className="grid gap-8 xl:grid-cols-[400px_1fr]">
              <div className="flex min-w-0 flex-col gap-2">
                <StatValor tamanho="manchete" className="text-brand-ink">
                  {manchete.numero}
                </StatValor>
                <StatFrase tamanho="manchete">{manchete.texto}</StatFrase>
                {totalDaManchete && (
                  <p className="text-apoio text-ink-2">
                    <span className="font-semibold tabular-nums text-ink">
                      {totalDaManchete}
                    </span>{" "}
                    desde o início desta conta.
                  </p>
                )}
              </div>

              {/* ⚠️ O GRÁFICO SÓ APARECE COM A MANCHETE DE FORA DO HORÁRIO, e
                  isso não é detalhe de layout: a soma das partes roxas TEM que
                  ser o número da manchete. Se a frase mais forte for outra (a
                  conta sem horário configurado, ou um mês sem nenhuma resposta
                  fora do expediente), as duas coisas passariam a falar de
                  conjuntos diferentes lado a lado, e o cliente leria isso como
                  erro. Sem gráfico é melhor do que gráfico que não fecha. */}
              {mostrarHoras && (
                <PainelHoras colunas={horas!} rotuloDentro={rotuloHorario} />
              )}
            </div>

            <StatLegenda>{escopo}</StatLegenda>
          </Stat>

          {!soManchete && resto.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {resto.map((f) => (
                <Bloco
                  key={f.key}
                  numero={f.numero}
                  texto={f.texto}
                  periodo={rotuloPeriodo}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
