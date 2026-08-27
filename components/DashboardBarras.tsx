import type { BarraDia } from "@/lib/metrics";

// Movimento dos últimos 14 dias: quanto a IA respondeu e quanto o time respondeu.
//
// CSS PURO, sem SVG e sem biblioteca de gráfico. Não é preguiça, é escolha com
// custo medido: as alternativas que as referências usavam (sparkline por cartão,
// donut, área com linha de meta) custam de 40 a 45 linhas de SVG CADA, com
// normalização, guarda de divisão por zero e a armadilha do
// `preserveAspectRatio`, para dizer menos que estas barras. Barra empilhada é a
// única forma que responde à pergunta que o dono tem: a IA está segurando o
// atendimento sozinha?
//
// Sem tooltip de propósito: quatorze tooltips é uma interação que um dono de PME
// não vai executar. O que importa está no eixo e na legenda, e o `title` de cada
// coluna cobre quem quiser conferir.

export default function DashboardBarras({ dias }: { dias: BarraDia[] }) {
  if (dias.length === 0) return null;

  const total = (d: BarraDia) => d.ia + d.time;
  const maior = Math.max(1, ...dias.map(total));
  const pico = dias.reduce((a, b) => (total(b) > total(a) ? b : a), dias[0]);
  const somaIa = dias.reduce((s, d) => s + d.ia, 0);
  const somaTime = dias.reduce((s, d) => s + d.time, 0);

  return (
    <section className="rounded-xl border border-line bg-bloco p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-rotulo uppercase text-ink-3">
          Movimento dos últimos 14 dias
        </h2>
        {total(pico) > 0 && (
          <span className="text-legenda text-ink-3">
            pico: {total(pico)} respostas em {diaCurto(pico.dia)}
          </span>
        )}
      </div>

      {/* `items-end` mais altura fixa: a coluna cresce de baixo para cima, que é
          a única direção que se lê como volume. */}
      <div className="flex h-32 items-end gap-1.5">
        {dias.map((d) => {
          const t = total(d);
          return (
            <div
              key={d.dia}
              className="flex min-w-0 flex-1 flex-col justify-end gap-px"
              title={`${diaCurto(d.dia)}: ${d.ia} da IA, ${d.time} do time`}
            >
              {/* Time em cima, IA embaixo: a IA é a base do atendimento, e é ela
                  que precisa parecer a fundação da coluna. */}
              {d.time > 0 && (
                <div
                  className="rounded-t-sm bg-ink-faint"
                  style={{ height: `${(d.time / maior) * 100}%` }}
                />
              )}
              {d.ia > 0 && (
                <div
                  className={`bg-brand ${d.time > 0 ? "" : "rounded-t-sm"}`}
                  style={{ height: `${(d.ia / maior) * 100}%` }}
                />
              )}
              {/* Dia sem resposta nenhuma: risco no chão, não coluna ausente. Sem
                  ele o eixo encurta e o buraco desaparece, que é justamente a
                  informação (um dia sem movimento). */}
              {t === 0 && <div className="h-px bg-line-strong" />}
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {dias.map((d) => (
          <span
            key={d.dia}
            className="min-w-0 flex-1 text-center text-legenda text-ink-3"
          >
            {d.letra}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-legenda text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-brand" aria-hidden />
          {somaIa.toLocaleString("pt-BR")} respondidas pela IA
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-ink-faint" aria-hidden />
          {somaTime.toLocaleString("pt-BR")} respondidas pelo time
        </span>
      </div>
    </section>
  );
}

/** "2026-08-20" vira "20/08". Sem `Date` no meio: a string já está no fuso certo. */
function diaCurto(dia: string): string {
  const [, mes, d] = dia.split("-");
  return `${d}/${mes}`;
}
