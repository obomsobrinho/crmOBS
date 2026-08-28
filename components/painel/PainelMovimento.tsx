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
    // Volume é NEUTRO e nunca vermelho: mês fraco é o mercado do cliente, não a
    // IA falhando, e pintar isso de vermelho joga o mercado dele na nossa conta.
    direcao: "neutra",
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
      className="painel-cartao overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--panel-shadow)]"
      style={{ "--passo": 4 } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-start gap-4 p-6 pb-0">
        {/* Coluna do número. Fica à esquerda e a área sangra à direita: é o
            arranjo que a rodada 3 fechou, e ele existe para o número ser lido
            antes do desenho, não depois. */}
        <div className="min-w-0 shrink-0 basis-[220px]">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-rotulo uppercase text-ink-3">Movimento</h2>
            <Selo delta={delta} />
          </div>
          <div className="font-display text-numero tabular-nums text-ink">
            <NumeroAnimado valor={j.conversas} />
          </div>
          <p className="text-apoio text-ink-2">
            {j.conversas === 1 ? "conversa" : "conversas"} nos últimos {j.dias}{" "}
            dias
          </p>
        </div>

        <div className="ml-auto shrink-0">
          <Tabs value={key} onValueChange={(v) => setKey(v as MovimentoKey)}>
            <TabsList variant="segmentado" aria-label="Janela do movimento">
              {ORDEM.map((k) => (
                <TabsTrigger key={k} value={k} variant="segmentado">
                  {k} dias
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* A área sangra embaixo e à direita. `overflow-hidden` está no cartão. */}
      <div className="relative mt-2 h-40">
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
                <div className="painel-balao absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-conteudo px-2.5 py-1.5 text-legenda text-ink shadow-[var(--panel-shadow)]">
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

      <div className="border-t border-line px-6 py-3.5">
        <p className="text-legenda text-ink-3">
          {pico && total(pico) > 0
            ? `pico de ${total(pico)} na ${nomeDoDia(pico.chave)}, ${legivel(pico.chave)}`
            : "sem pico no período"}
          {" · "}
          média de {media.toLocaleString("pt-BR")} por dia
          {menor && ` · menor dia ${total(menor)}, ${nomeDoDia(menor.chave)}`}
        </p>
        {/* A divisão IA contra time saiu do gráfico e virou esta linha. */}
        <p className="mt-0.5 text-legenda text-ink-3">
          <span className="font-semibold text-brand-ink">
            {somaIa.toLocaleString("pt-BR")}
          </span>{" "}
          respondidas pela IA ·{" "}
          <span className="font-semibold text-ink-2">
            {somaTime.toLocaleString("pt-BR")}
          </span>{" "}
          pelo time ·{" "}
          <span className="font-semibold text-ink-2">
            {j.pessoasNovas.toLocaleString("pt-BR")}
          </span>{" "}
          {j.pessoasNovas === 1
            ? "pessoa falou com você pela primeira vez"
            : "pessoas falaram com você pela primeira vez"}
        </p>
      </div>
    </section>
  );
}
