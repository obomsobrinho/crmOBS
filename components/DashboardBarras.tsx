import type { Barra } from "@/lib/metrics";

// Movimento do período: quanto a IA respondeu e quanto o time respondeu.
//
// CSS PURO, sem SVG e sem biblioteca de gráfico. Não é preguiça, e a razão mais
// forte não é bundle, é COR: neste sistema verde, âmbar e vermelho são estado,
// então sobra UMA cor categórica (a marca) mais o cinza de contexto. Duas séries
// é o teto que a paleta permite, e duas séries é exatamente o que barra
// empilhada precisa. Qualquer biblioteca ainda teria que receber os tokens por
// JS, o que quebraria a troca de tema por cookie que o resto da casa usa.
//
// Sem tooltip de propósito: um dono de PME não vai passar o mouse em trinta
// colunas. O que importa está no eixo e na legenda, e o `title` de cada coluna
// cobre quem quiser conferir.

export default function DashboardBarras({
  dados,
  legenda,
}: {
  dados: Barra[];
  /** Período a que o gráfico se refere, ex.: "últimos 7 dias". */
  legenda: string;
}) {
  if (dados.length === 0) return null;

  const total = (d: Barra) => d.ia + d.time;
  const maior = Math.max(1, ...dados.map(total));
  const pico = dados.reduce((a, b) => (total(b) > total(a) ? b : a), dados[0]);
  const somaIa = dados.reduce((s, d) => s + d.ia, 0);
  const somaTime = dados.reduce((s, d) => s + d.time, 0);
  // Eixo denso (mês, 30 colunas) fica ilegível com um rótulo por coluna.
  const passo = dados.length > 16 ? 5 : 1;

  return (
    <section
      data-slot="painel-grafico"
      className="flex flex-col rounded-xl border border-line bg-raised p-5 shadow-[var(--panel-shadow)]"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-rotulo uppercase text-ink-3">Movimento</h3>
        {total(pico) > 0 && (
          <span className="text-legenda text-ink-3">
            pico: {total(pico)} respostas
          </span>
        )}
      </div>

      {/* ⚠️ NUNCA `items-end` nesta linha, e a coluna PRECISA de `h-full`.
          Com `items-end` a coluna não estica e fica com a altura do conteúdo;
          a barra tem altura em PORCENTAGEM, que contra pai de altura automática
          resolve para zero. Foi assim que o gráfico de 14 dias ficou renderizando
          invisível em produção (medido em 27/08/2026: coluna 1px, barra 0px),
          com o e2e passando, porque ele contava colunas e legenda e nunca mediu
          a altura de uma barra. O `justify-end` da coluna é quem encosta a barra
          no chão. */}
      <div className="flex h-32 gap-1">
        {dados.map((d) => {
          const t = total(d);
          return (
            <div
              key={d.chave}
              className="flex h-full min-w-0 flex-1 flex-col justify-end gap-0.5"
              title={d.titulo}
            >
              {/* Time em cima, IA embaixo: a IA é a base do atendimento, e é ela
                  que precisa parecer a fundação da coluna. */}
              {d.time > 0 && (
                <div
                  className="rounded-t bg-ink-faint"
                  style={{ height: `${(d.time / maior) * 100}%` }}
                />
              )}
              {d.ia > 0 && (
                <div
                  className={
                    d.time > 0 ? "rounded-b bg-brand" : "rounded bg-brand"
                  }
                  style={{ height: `${(d.ia / maior) * 100}%` }}
                />
              )}
              {/* Balde sem resposta nenhuma: risco no chão, não coluna ausente.
                  Sem ele o eixo encurta e o buraco desaparece, que é justamente
                  a informação (um dia sem movimento). */}
              {t === 0 && <div className="h-px bg-line-strong" />}
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1">
        {dados.map((d, i) => (
          <span
            key={d.chave}
            className="min-w-0 flex-1 text-center text-legenda text-ink-3"
          >
            {i % passo === 0 ? d.eixo : ""}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-legenda text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-brand" aria-hidden />
          {somaIa.toLocaleString("pt-BR")} respondidas pela IA
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-ink-faint" aria-hidden />
          {somaTime.toLocaleString("pt-BR")} respondidas pelo time
        </span>
        <span className="ml-auto">{legenda}</span>
      </div>
    </section>
  );
}
