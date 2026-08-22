import Link from "next/link";
import { Clock, CalendarClock, Settings2 } from "lucide-react";
import type { FraseValor, ValorResumo as Resumo } from "@/lib/valor";

// Valor percebido, em frase pronta.
//
// Componente de apresentação puro: a página calcula por RLS e passa o resumo; o
// /design passa mock. Mesmo vocabulário visual do DashboardCards, porque as duas
// seções dividem a tela do painel.
//
// A diferença de propósito importa: o DashboardCards responde "como foi a
// semana"; aqui a pergunta é "o que eu perderia se cancelasse". Por isso o
// destaque é a FRASE, e não o número solto.

function Bloco({ numero, texto }: { numero: string; texto: string }) {
  return (
    <div className="rounded-xl border border-line bg-bloco p-5">
      <div className="font-display text-display tabular-nums">{numero}</div>
      <p className="mt-1 text-apoio text-ink-2">{texto}</p>
    </div>
  );
}

export default function ValorResumo({
  resumo,
  frases,
  periodo,
  hrefConfigurar = "/agente",
}: {
  resumo: Resumo;
  frases: FraseValor[];
  /** Rótulo do período, ex.: "em julho de 2026". */
  periodo: string;
  /** Link para configurar o horário, quando falta. */
  hrefConfigurar?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock size={16} className="text-brand-ink" />
        <h2 className="text-corpo font-semibold">O que a IA fez por você</h2>
        <span className="text-legenda text-ink-3">{periodo}</span>
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

      {frases.length === 0 ? (
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {frases.map((f) => (
            <Bloco key={f.key} numero={f.numero} texto={f.texto} />
          ))}
        </div>
      )}
    </section>
  );
}
