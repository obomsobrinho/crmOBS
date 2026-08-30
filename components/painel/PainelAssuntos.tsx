"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// "Assuntos em alta": o que mais perguntam para a IA, em acordeão.
//
// ⚠️ DUAS FACES, e a diferença é ter dado ou não:
//
// - COM `itens`: a lista de verdade, como a prancha da rodada 3 desenha. É o
//   que o preview `/design/painel` mostra, com conteúdo mockado.
// - SEM `itens`: o estado vazio honesto, com número literalmente `XX`, rótulo
//   POSICIONAL e barra CINZA. É o que a tela real mostra hoje, porque
//   classificar o assunto de um turno exige instrumentação que não existe:
//   `conversation_qualifications` guarda `action`, `summary` e
//   `preferencia_horario`, e nenhuma das três diz sobre o que perguntaram.
//
// A troca entre as duas é um TESTE DE DADO, não um interruptor: no dia em que a
// página passar uma lista, o estado vazio some sozinho.

export interface PedidoDoAssunto {
  texto: string;
  /** Já legível ("há 2 h", "ontem"). */
  quando: string;
}

export interface AssuntoEmAlta {
  titulo: string;
  contagem: number;
  /**
   * Variação já formatada ("+6", "igual", "novo").
   *
   * ⚠️ SEMPRE NEUTRA, nunca verde nem vermelha: mais pergunta sobre um assunto
   * não é boa nem má notícia, é demanda. Pintar isso ensinaria o dono a torcer
   * pelo número errado.
   */
  variacao: string;
  /** Uma frase que interpreta o assunto. */
  resumo: string;
  pedidos: PedidoDoAssunto[];
}

export default function PainelAssuntos({
  itens,
  periodo = "7 dias",
  totalPerguntas,
  hrefPedidos = "/inbox",
  hrefEnsinar = "/agente",
}: {
  /** Vazio ou ausente = estado vazio honesto. */
  itens?: AssuntoEmAlta[];
  periodo?: string;
  /** Total de perguntas classificadas no período, para o subtítulo. */
  totalPerguntas?: number;
  hrefPedidos?: string;
  hrefEnsinar?: string;
}) {
  // Um aberto por vez: abrir um fecha o outro no mesmo quadro (3d).
  const [aberto, setAberto] = React.useState<number | null>(0);
  const temDado = !!itens && itens.length > 0;
  const maior = temDado ? Math.max(...itens.map((i) => i.contagem)) : 1;

  return (
    // ⚠️ `min-h-0` mais coluna: sem os dois, o `overflow-y-auto` da lista não
    // tem contra o que resolver e o cartão volta a crescer com o conteúdo.
    <section
      data-slot="painel-assuntos"
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--panel-shadow)]"
    >
      {/* Cabeçalho com o mesmo respiro do cartão de movimento (18px em cima e
          embaixo) e o divisor de borda-suave atravessando o cartão. */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line-soft px-[22px] py-[18px]">
        <div className="min-w-0">
          {/* Título de BLOCO em Space Grotesk, igual ao "Movimento". O ícone
              saiu junto com a caixa alta: os dois eram do papel RÓTULO, e este
              é o título de um cartão. */}
          <h2 className="font-display text-cartao text-ink">Assuntos em alta</h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            {temDado
              ? `${totalPerguntas ?? 0} perguntas, vs. os ${periodo} anteriores`
              : "ainda sem medição"}
          </p>
        </div>
        {temDado ? (
          <span className="flex h-[26px] shrink-0 items-center rounded-full border border-line bg-bloco px-2.5 text-legenda text-ink-2">
            {periodo}
          </span>
        ) : (
          <Badge variant="tracejado">Em breve</Badge>
        )}
      </div>

      {temDado ? (
        /* ⚠️ ROLAGEM DENTRO DO CARTÃO, e não altura livre. A lista é o único
           bloco da trilha que cresce com o conteúdo, e era ela que empurrava o
           cartão para baixo e abria um vão entre a operação e o movimento na
           coluna ao lado. Com a rolagem, quem manda na altura é a grade da
           página, e a linha de base dos dois lados fecha. */
        <div className="min-h-0 flex-1 divide-y divide-line-soft overflow-y-auto">
          {itens.map((it, i) => {
            const estaAberto = aberto === i;
            return (
              <div key={it.titulo} className={estaAberto ? "bg-bloco" : ""}>
                <button
                  type="button"
                  onClick={() => setAberto(estaAberto ? null : i)}
                  aria-expanded={estaAberto}
                  className="painel-pressiona block w-full px-[22px] py-3 text-left transition-colors hover:bg-bloco"
                >
                  {/* Linha de cima: o assunto à esquerda, contagem e seta à
                      direita. A VARIAÇÃO desceu para a linha da barra, como na
                      prancha: ela é leitura da barra, não do título. */}
                  <span className="flex items-baseline justify-between gap-2.5">
                    <span
                      className={`min-w-0 truncate text-corpo ${
                        estaAberto ? "font-semibold text-ink" : "text-ink"
                      }`}
                    >
                      {it.titulo}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="font-display text-[15px] font-semibold tabular-nums text-ink">
                        {it.contagem}
                      </span>
                      <ChevronDown
                        size={12}
                        aria-hidden
                        className={`shrink-0 text-ink-3 transition-transform duration-200 ${
                          estaAberto ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </span>
                  {/* Barra proporcional em DUAS peças com respiro entre elas, e
                      não um preenchimento dentro de um trilho: é o desenho da
                      prancha, e o respiro é o que deixa claro onde o roxo acaba
                      quando a proporção é alta.

                      ⚠️ A proporção vai em `flex-grow`, NUNCA em `width: %`. Com
                      porcentagem, a linha do maior assunto pedia 100% da largura
                      e os dois `gap` de 10px mais a variação sobravam para fora:
                      a lista ganhava rolagem HORIZONTAL, e só naquela linha
                      (medido: 392px de conteúdo em 368px de caixa). Com
                      `flex-grow` a divisão acontece DEPOIS de descontar respiro
                      e texto, então não existe transbordo possível. */}
                  <span className="mt-[7px] flex items-center gap-2.5">
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        className="h-[3px] rounded-sm bg-brand"
                        style={{ flexGrow: it.contagem, flexBasis: 0 }}
                      />
                      {/* O trilho cinza só existe quando sobra o que marcar: no
                          maior assunto ele teria largura zero e ainda comeria um
                          respiro de 10px, empurrando a variação. */}
                      {it.contagem < maior && (
                        <span
                          className="h-[3px] rounded-sm bg-line-soft"
                          style={{ flexGrow: maior - it.contagem, flexBasis: 0 }}
                        />
                      )}
                    </span>
                    <span className="shrink-0 text-legenda text-ink-3">
                      {it.variacao}
                    </span>
                  </span>
                </button>

                {estaAberto && (
                  <div className="px-[22px] pb-4">
                    <p className="text-apoio text-ink-2">{it.resumo}</p>
                    <p className="mb-1.5 mt-2.5 text-legenda font-semibold uppercase tracking-[0.06em] text-ink-3">
                      Os pedidos que formaram este assunto
                    </p>
                    <ul className="space-y-[3px]">
                      {it.pedidos.map((p) => (
                        <li key={p.texto} className="text-legenda text-ink-3">
                          {p.texto} · {p.quando}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={hrefEnsinar}
                      className="painel-pressiona mt-3 flex w-fit items-center gap-1.5 text-legenda font-semibold text-brand-ink transition-opacity hover:opacity-80"
                    >
                      <Sparkles size={13} aria-hidden />
                      Ensinar a resposta
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-4">
          {/* ⚠️ Número literalmente `XX`, rótulo POSICIONAL e barra CINZA. Um
              valor plausível, mesmo borrado, é indistinguível de medição num
              print ampliado, e "a IA não inventa" é o eixo do produto. */}
          <ol className="space-y-3">
            {[72, 48, 30].map((largura, i) => (
              <li key={largura} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-apoio text-ink-3">
                    {i + 1}º assunto mais perguntado
                  </p>
                  <div className="mt-1.5 h-[3px] rounded-sm bg-bloco">
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
            semana. Ainda não medimos isso, e preferimos não mostrar número antes
            de ter como contar.
          </p>
          <Link
            href={hrefPedidos}
            className="painel-pressiona mt-3 flex w-fit items-center gap-1.5 text-legenda font-semibold text-brand-ink transition-opacity hover:opacity-80"
          >
            Ver os pedidos recentes
            <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}
