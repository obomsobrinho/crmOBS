"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingUp, ChevronDown, ArrowRight, Sparkles } from "lucide-react";
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
    <section
      data-slot="painel-assuntos"
      className="overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--panel-shadow)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-[22px] pb-3 pt-[18px]">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
            <TrendingUp size={13} aria-hidden />
            Assuntos em alta
          </h2>
          <p className="mt-0.5 text-legenda text-ink-3">
            {temDado
              ? `${totalPerguntas ?? 0} perguntas, vs. os ${periodo} anteriores`
              : "ainda sem medição"}
          </p>
        </div>
        {temDado ? (
          <span className="shrink-0 rounded-full border border-line bg-bloco px-2.5 py-0.5 text-legenda text-ink-2">
            {periodo}
          </span>
        ) : (
          <Badge variant="tracejado">Em breve</Badge>
        )}
      </div>

      {temDado ? (
        <div className="divide-y divide-line border-t border-line">
          {itens.map((it, i) => {
            const estaAberto = aberto === i;
            return (
              <div key={it.titulo} className={estaAberto ? "bg-bloco" : ""}>
                <button
                  type="button"
                  onClick={() => setAberto(estaAberto ? null : i)}
                  aria-expanded={estaAberto}
                  className="painel-pressiona flex w-full items-center gap-3 px-[22px] py-3 text-left transition-colors hover:bg-[var(--active-bg)]"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-apoio ${
                        estaAberto ? "font-semibold text-ink" : "text-ink-2"
                      }`}
                    >
                      {it.titulo}
                    </span>
                    {/* Trilha proporcional à contagem, na cor da série. */}
                    <span className="mt-1.5 block h-[3px] rounded-sm bg-line">
                      <span
                        className="block h-full rounded-sm bg-brand"
                        style={{ width: `${(it.contagem / maior) * 100}%` }}
                      />
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-[15px] font-semibold tabular-nums text-ink">
                    {it.contagem}
                  </span>
                  <span className="shrink-0 text-legenda text-ink-3">
                    {it.variacao}
                  </span>
                  <ChevronDown
                    size={12}
                    aria-hidden
                    className={`shrink-0 text-ink-3 transition-transform duration-200 ${
                      estaAberto ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {estaAberto && (
                  <div className="px-[22px] pb-4">
                    <p className="text-apoio text-ink-2">{it.resumo}</p>
                    <p className="mt-3 text-legenda font-semibold uppercase tracking-[0.06em] text-ink-3">
                      Os pedidos que formaram este assunto
                    </p>
                    <ul className="mt-1.5 space-y-1">
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
        <div className="border-t border-line px-[22px] py-4">
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
