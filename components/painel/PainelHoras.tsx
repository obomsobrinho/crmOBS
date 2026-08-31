import type * as React from "react";
import type { BarraHora } from "@/lib/painel";

// Em que horas a IA respondeu, dentro do cartão da manchete.
//
// ⚠️ A REGRA MAIS IMPORTANTE DESTE ARQUIVO: a soma das partes ROXAS é
// exatamente o número da manchete. Quem garante isso é `barrasDeHora` em
// lib/painel.ts, que conta as MESMAS linhas que `atendidasForaDoHorario` conta
// (resposta da IA, classificada por `dentroDoHorario`). Este componente só
// desenha; se ele começasse a filtrar qualquer coisa, a igualdade quebraria e o
// cliente descobriria conferindo no WhatsApp dele.
//
// ⚠️ Dentro ou fora considera o DIA DA SEMANA, não só a hora. 14h de domingo é
// FORA, para quem não abre domingo. Por isso a legenda diz "incluindo fim de
// semana e feriado": sem essa frase, uma barra roxa às 14h pareceria erro.
//
// Sem SVG e sem biblioteca: são 24 retângulos, e o hover é CSS (`.painel-horas`
// no globals.css). Estado no React aqui significaria re-renderizar 24 colunas a
// cada pixel de movimento do mouse.

/** Horas que ganham rótulo no eixo. O resto seria ilegível em 24 colunas. */
const EIXO = [0, 6, 12, 18, 23];

export default function PainelHoras({
  colunas,
  rotuloDentro,
  rotulo = "Em que horas as mensagens chegaram",
  escopo,
}: {
  colunas: BarraHora[];
  /** Horário da empresa em uma linha, ex.: "Segunda a sexta: 08:00 às 18:00". */
  rotuloDentro: string;
  /**
   * O título do gráfico.
   *
   * ⚠️ O PADRÃO É O DA PRANCHA ("as mensagens chegaram"), por pedido do dono em
   * 30/08/2026, e ele NÃO descreve o que a barra mede hoje: `barrasDeHora`
   * conta RESPOSTA DA IA, que é o que faz a soma das partes roxas fechar
   * exatamente com o número da manchete. Contar chegada daria outro conjunto
   * (mensagem que chega às 23h e é respondida no dia seguinte entra num e não
   * no outro) e a igualdade quebraria. É prop justamente para a troca ser uma
   * linha, seja qual for o lado que o dono decidir fechar.
   */
  rotulo?: string;
  /** Canto direito do cabeçalho, ex.: "julho de 2026 · 486 recebidas". */
  escopo?: string;
}) {
  const total = (c: BarraHora) => c.dentro + c.fora;
  // A hora mais cheia vale 100%. Piso de 1 para não dividir por zero.
  const maior = Math.max(1, ...colunas.map(total));

  return (
    <div data-slot="painel-horas" className="min-w-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <span className="text-apoio font-semibold text-ink-2">{rotulo}</span>
        {escopo && (
          <span className="shrink-0 text-legenda text-ink-3">{escopo}</span>
        )}
      </div>

      {/* ⚠️ NUNCA `items-end` nesta linha, e a coluna PRECISA de `h-full`. Com
          `items-end` a coluna fica com a altura do conteúdo, e a barra, que tem
          altura em PORCENTAGEM, resolve para ZERO. Foi assim que o gráfico de 14
          dias renderizou invisível em produção com o e2e passando. Quem encosta
          a barra no chão é o `justify-end` da coluna. */}
      <div className="painel-horas flex h-24 gap-[5px] border-b border-line-soft pb-1.5">
        {colunas.map((c) => {
          const t = total(c);
          const pctDentro = `${(c.dentro / maior) * 100}%`;
          const pctFora = `${(c.fora / maior) * 100}%`;
          return (
            <div
              key={c.hora}
              className="painel-hora relative flex h-full min-w-0 flex-1 flex-col justify-end gap-px"
              // A contagem sai também em atributo, e não só no balão: é assim
              // que o teste soma as partes roxas e confere com a manchete sem
              // depender de medir altura de pixel, que é proporcional e não
              // absoluta.
              data-hora={c.hora}
              data-fora={c.fora}
              data-dentro={c.dentro}
            >
              {/* O balão. Ancorado no centro da própria coluna e acima do topo
                  do gráfico, então ele não precisa seguir o mouse: já nasce no
                  lugar certo, e por isso não existe arrasto atrás do cursor. */}
              <div className="painel-balao absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 text-legenda text-ink shadow-[var(--panel-shadow)]">
                <span className="font-semibold tabular-nums">{c.hora}h</span>
                {t === 0 ? (
                  <span className="text-ink-3"> · sem resposta</span>
                ) : (
                  <>
                    <span className="text-brand-ink"> · {c.fora} fora</span>
                    <span className="text-ink-3"> · {c.dentro} dentro</span>
                  </>
                )}
              </div>

              {/* Dentro em cima, fora embaixo: o roxo é a fundação da coluna, do
                  mesmo jeito que a IA é a fundação do atendimento no gráfico de
                  movimento. O raio de topo vai em quem estiver por cima. */}
              {c.dentro > 0 && (
                <div
                  className="painel-barra shrink-0 rounded-t-[3px] bg-ink-faint"
                  style={{ "--altura": pctDentro } as React.CSSProperties}
                />
              )}
              {c.fora > 0 && (
                <div
                  className={`painel-barra shrink-0 bg-brand ${
                    c.dentro > 0 ? "" : "rounded-t-[3px]"
                  }`}
                  style={{ "--altura": pctFora } as React.CSSProperties}
                />
              )}
              {/* Hora sem resposta nenhuma: trilho no chão, não coluna ausente.
                  Sem ele o eixo encurta e o buraco some, e o buraco É a
                  informação (a madrugada em que ninguém escreve). */}
              {t === 0 && <div className="h-0.5 shrink-0 bg-line-strong" />}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex gap-[5px]">
        {colunas.map((c) => (
          <span
            key={c.hora}
            className="min-w-0 flex-1 text-center text-legenda text-ink-faint"
          >
            {EIXO.includes(c.hora) ? `${c.hora}h` : ""}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-legenda text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-brand" aria-hidden />
          fora do expediente desta conta, incluindo fim de semana e feriado
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-sm bg-ink-faint"
            aria-hidden
          />
          dentro{rotuloDentro ? ` (${rotuloDentro})` : ""}
        </span>
      </div>
    </div>
  );
}
