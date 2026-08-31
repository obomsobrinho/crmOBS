"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Selo, NumeroAnimado } from "@/components/painel/pecas";
import { calcularDelta } from "@/lib/delta";
import type { Barra } from "@/lib/metrics";

// "Movimento": quantas conversas por dia, com o número grande à esquerda e a
// área sangrando na borda do cartão.
//
// ⚠️ UMA SÉRIE SÓ. A divisão IA contra time SAIU do gráfico e virou texto no
// rodapé. O motivo é a paleta: neste sistema verde, âmbar e vermelho são ESTADO,
// então sobra uma cor categórica (a marca) mais o cinza. Duas séries empilhadas
// gastavam as duas para responder uma pergunta ("cresceu?") que precisa de uma.
//
// Sem biblioteca de gráfico, de novo por cor e por tema: qualquer biblioteca
// receberia os tokens por JS e quebraria a troca de tema por cookie que o resto
// da casa usa.

/**
 * Janela do gráfico. São 14 e 30 dias, e não os quatro períodos da operação:
 * movimento é tendência, e tendência de 24 horas não existe.
 */
export interface MovimentoJanela {
  dias: number;
  barras: Barra[];
  /** Conversas distintas no período. */
  conversas: number;
  /** Conversas no período anterior de mesmo tamanho. `null` = sem base. */
  conversasAnterior: number | null;
  /**
   * Contatos cuja PRIMEIRA mensagem nesta conta caiu na janela.
   *
   * ⚠️ Vive aqui porque a seção "Está crescendo?" deixou de existir na rodada 3,
   * e este número era o cartão dela. Ele não aparece no desenho aprovado, mas
   * `computeMetrics` continua calculando: descartar em silêncio uma métrica que
   * o dono já lia seria pior do que colocá-la no rodapé de quem responde a mesma
   * pergunta. Ver o relatório do passo.
   */
  pessoasNovas: number;
}

export type MovimentoKey = "14" | "30";
const ORDEM: MovimentoKey[] = ["14", "30"];

/** Geometria da área. `preserveAspectRatio="none"` estica isto na largura. */
const W = 560;
const H = 160;

const DIA_LONGO = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

/** "2026-08-20" vira o instante do meio-dia daquele dia, para comparar datas. */
function instanteDoDia(chave: string): number {
  return Date.parse(`${chave}T12:00:00Z`);
}

/** "2026-08-20" vira "20/08". A string já está no fuso certo. */
function legivel(chave: string): string {
  const [, m, d] = chave.split("-");
  return `${d}/${m}`;
}

function nomeDoDia(chave: string): string {
  return DIA_LONGO[new Date(instanteDoDia(chave)).getUTCDay()];
}

export default function PainelMovimento({
  janelas,
  desdeMs = null,
}: {
  janelas: Record<MovimentoKey, MovimentoJanela>;
  /**
   * Instante da primeira mensagem da conta. Os dias ANTERIORES a ele não são
   * "zero conversas", são dias que a conta não teve, e o desenho os marca com um
   * trilho em vez de um vale. Um vale ali contaria uma queda que nunca houve.
   */
  desdeMs?: number | null;
}) {
  const [key, setKey] = React.useState<MovimentoKey>("14");
  const j = janelas[key];
  const dados = j.barras;

  const total = (b: Barra) => b.ia + b.time;
  const existe = (b: Barra) =>
    desdeMs === null || instanteDoDia(b.chave) >= desdeMs;

  const reais = dados.filter(existe);
  const maior = Math.max(1, ...reais.map(total));
  const somaIa = reais.reduce((s, b) => s + b.ia, 0);
  const somaTime = reais.reduce((s, b) => s + b.time, 0);

  const pico = reais.reduce<Barra | null>(
    (a, b) => (a === null || total(b) > total(a) ? b : a),
    null
  );
  const menor = reais.reduce<Barra | null>(
    (a, b) => (a === null || total(b) < total(a) ? b : a),
    null
  );
  const media =
    reais.length > 0
      ? Math.round(
          (reais.reduce((s, b) => s + total(b), 0) / reais.length) * 10
        ) / 10
      : 0;

  const delta = calcularDelta({
    atual: j.conversas,
    anterior: j.conversasAnterior,
    // ⚠️ `maior-melhor`, e não `neutra`, porque é o que a prancha desenha: o
    // selo de +17% é VERDE nela. O custo, dito por inteiro: uma QUEDA de volume
    // passa a sair vermelha, e mês fraco costuma ser o mercado do cliente e não
    // a IA falhando. Voltar para `neutra` é uma linha, e é decisão do dono.
    direcao: "maior-melhor",
    semBase: "sem período anterior completo",
  });

  // Pontos da área. O eixo x cobre a largura inteira, então o primeiro dia
  // encosta na esquerda e o último na direita, que é a sangria do desenho.
  const passo = dados.length > 1 ? W / (dados.length - 1) : W;
  const pontos = dados.map((b, i) => ({
    barra: b,
    x: i * passo,
    y: existe(b) ? H - (total(b) / maior) * H : H,
  }));
  const linha = pontos.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `M0,${H} ${pontos.map((p) => `L${p.x},${p.y}`).join(" ")} L${W},${H} Z`;

  return (
    <section
      data-slot="painel-movimento"
      className="painel-cartao relative flex flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--panel-shadow)]"
      style={{ "--passo": 4 } as React.CSSProperties}
    >
      {/* ⚠️ CABEÇALHO PRÓPRIO, com uma linha que atravessa o cartão inteiro.
          O seletor já flutuou no canto, por cima da área, e estava errado: na
          prancha ele mora nesta faixa, ao lado do título, e a faixa termina num
          divisor de borda-suave (a `--line2` dela) de ponta a ponta. */}
      <div className="flex items-start justify-between gap-5 border-b border-line-soft px-6 py-[18px]">
        <div className="min-w-0">
          {/* Título de BLOCO (16/22, caixa normal) em Space Grotesk, e não
              rótulo de seção em caixa alta: é assim na prancha, e é o que
              separa o título de um CARTÃO do rótulo de uma SEÇÃO da página. */}
          <h2 className="font-display text-cartao text-ink">Movimento</h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            Conversas por dia
            {j.conversasAnterior !== null &&
              ` · ${j.conversasAnterior} no período anterior`}
          </p>
        </div>
        <Tabs value={key} onValueChange={(v) => setKey(v as MovimentoKey)}>
          {/* ⚠️ Bandeja no CANVAS, e não na cor do cartão: aqui ela está DENTRO
              de um cartão, então precisa recuar em vez de subir. Na operação,
              que flutua sobre o canvas, vale o padrão da variante. */}
          <TabsList
            variant="painel"
            className="bg-canvas"
            aria-label="Janela do movimento"
          >
            {ORDEM.map((k) => (
              <TabsTrigger
                key={k}
                value={k}
                variant="painel"
                className="py-1 text-legenda"
              >
                {k} dias
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* ⚠️ NÚMERO À ESQUERDA E ÁREA À DIREITA, NA MESMA LINHA. Empilhar (número
          em cima, gráfico embaixo em largura inteira) foi a primeira tentativa e
          está errado: come altura da primeira tela e tira do número o papel de
          ser lido ANTES do desenho, que é o arranjo que a rodada 3 fechou. */}
      <div className="flex flex-1 items-end gap-5">
        <div className="w-[210px] shrink-0 py-5 pl-6">
          {/* 44/48 (`text-destaque`), medido na prancha: é o degrau ENTRE a
              manchete de 68 e o cartão de indicador de 32. Com 32 aqui, o
              movimento lia com o mesmo peso de um cartão da operação. */}
          {/* ⚠️ Marcado. O título do cartão também é `font-display` desde que
              passou a usar Space Grotesk como na prancha, então "o primeiro
              .font-display do cartão" deixou de ser o numeral: o teste de
              degraus de numeral media 16px em vez de 44. */}
          <div
            data-slot="painel-movimento-numero"
            className="font-display text-destaque tabular-nums text-ink"
          >
            <NumeroAnimado valor={j.conversas} />
          </div>
          <p className="mt-0.5 text-apoio text-ink-2">
            {j.conversas === 1 ? "conversa" : "conversas"} nos últimos {j.dias}{" "}
            dias
          </p>
          {/* O selo traz CONTRA O QUE está comparando, numa peça só: "+17%
              vs. 36", como na prancha. */}
          <div className="mt-2.5">
            <Selo
              delta={delta}
              sufixo={
                j.conversasAnterior !== null
                  ? `vs. ${j.conversasAnterior}`
                  : undefined
              }
            />
          </div>
        </div>

        {/* A área sangra à direita e embaixo: sem respiro deste lado, e o
            `overflow-hidden` do cartão corta o que passar. */}
        {/* ⚠️ Piso de 100px e NÃO de 160px. A área escala sozinha (o SVG é
            `preserveAspectRatio="none"` em `inset-0`), então o piso serve só
            para o gráfico não virar um risco. Com 160 aqui o cartão tinha
            min-content alto demais e era ele que impedia a tela de caber em
            monitor com barra de favoritos. */}
        <div className="relative min-h-[100px] min-w-0 flex-1 self-stretch">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="painel-area absolute inset-0 h-full w-full"
          // Marcado porque os ícones do lucide também são `svg` com `polyline`
          // dentro: sem isto, um teste que contasse `svg polyline` no cartão
          // pegaria as setas do selo junto e diria que existem três séries.
          data-slot="painel-area"
          aria-hidden
        >
          <defs>
            <linearGradient id="mov-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--brand-fill)"
                stopOpacity="0.3"
              />
              <stop
                offset="100%"
                stopColor="var(--brand-fill)"
                stopOpacity="0.02"
              />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#mov-fill)" />
          <polyline
            points={linha}
            fill="none"
            stroke="var(--brand-fill)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            /* Sem isto o traço engorda junto com o `scaleY` da entrada e com o
               esticão do `preserveAspectRatio="none"`. */
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Faixas de hover, uma por dia. A guia, o ponto e o balão são CSS, e a
            posição é POR DIA, sem tween, então não existe arrasto atrás do
            mouse. Ficam por cima do SVG, que é `aria-hidden`. */}
        <div className="absolute inset-0 flex">
          {pontos.map((p) => {
            const t = total(p.barra);
            const inexistente = !existe(p.barra);
            return (
              <div
                key={p.barra.chave}
                className="painel-dia relative min-w-0 flex-1"
              >
                <div className="painel-guia absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line-strong" />
                {!inexistente && (
                  <div
                    className="painel-guia absolute left-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-[3px] ring-[var(--raised)]"
                    style={{ top: `${(p.y / H) * 100}%` }}
                  />
                )}
                <div className="painel-balao absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-legenda text-ink shadow-[var(--panel-shadow)]">
                  {inexistente ? (
                    <span className="text-ink-3">
                      {legivel(p.barra.chave)} · antes desta conta
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold">
                        {nomeDoDia(p.barra.chave)}, {legivel(p.barra.chave)}
                      </span>
                      <span className="text-ink-3">
                        {" "}
                        · {t} {t === 1 ? "conversa" : "conversas"}
                      </span>
                    </>
                  )}
                </div>
                {/* Dia que a conta não teve: trilho no chão, nunca um vale. */}
                {inexistente && (
                  <div className="absolute inset-x-0 bottom-0 mx-auto h-[3px] w-1/2 rounded-sm bg-line-strong" />
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Rodapé numa linha só, com as duas pontas: leitura do gráfico à
          esquerda, quem respondeu à direita. Separado por linha interna. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line-soft px-6 py-3">
        <p className="text-legenda text-ink-2">
          {pico && total(pico) > 0
            ? `pico de ${total(pico)} na ${nomeDoDia(pico.chave)}, ${legivel(pico.chave)}`
            : "sem pico no período"}
          {" · "}
          média de {media.toLocaleString("pt-BR")} por dia
          {menor && ` · menor dia ${total(menor)}, ${nomeDoDia(menor.chave)}`}
        </p>
        {/* A divisão IA contra time saiu do gráfico e virou texto.
            ⚠️ "Pessoas novas" NÃO entra aqui: a prancha traz só as duas séries,
            e eu tinha acrescentado o terceiro número por conta própria para não
            perder a métrica quando a seção "Está crescendo?" saiu. Perder a
            métrica é decisão do dono; encher o rodapé não era minha. Ela
            continua sendo calculada e chega no `MovimentoJanela`. */}
        <p className="text-legenda text-ink-3">
          <span className="font-semibold text-brand-ink">
            {somaIa.toLocaleString("pt-BR")}
          </span>{" "}
          respondidas pela IA ·{" "}
          <span className="font-semibold text-ink-2">
            {somaTime.toLocaleString("pt-BR")}
          </span>{" "}
          pelo time
        </p>
      </div>
    </section>
  );
}
