import NavRail from "@/components/NavRail";
import ValorResumo from "@/components/ValorResumo";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { frasesDeValor, rotuloDoMes, type ValorResumo as Resumo } from "@/lib/valor";

// Preview de design do resumo de valor percebido (dev-only, liberado pelo proxy).
//
// Mostra os DOIS estados que importam: com horário de atendimento configurado
// (resumo cheio) e sem horário (o número mais forte é omitido, com aviso). O
// segundo é o estado real da OBM hoje, então precisa ficar apresentável também.
export const dynamic = "force-dynamic";

const PERIODO = rotuloDoMes(2026, 7);

const COM_HORARIO: Resumo = {
  recebidas: 486,
  atendidasForaDoHorario: 213,
  atendidasEmFimDeSemanaOuFeriado: 47,
  conversasSemHumano: 38,
  leadsQualificados: 19,
  pedidosDeAgendamento: 6,
  respostasEmMenosDeUmMinuto: 122,
  primeiraRespostaMs: 42000,
  pico: { diaSemana: 0, hora: 17, mensagens: 31 },
  temHorario: true,
};

const SEM_HORARIO: Resumo = {
  ...COM_HORARIO,
  atendidasForaDoHorario: null,
  temHorario: false,
};

export default function DesignValorPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className={cn(
            cardVariants(),
            "flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-6"
          )}
        >
          <ValorResumo
            resumo={COM_HORARIO}
            frases={frasesDeValor(COM_HORARIO, PERIODO)}
            periodo={PERIODO}
          />

          <div className="border-t border-line pt-6">
            <p className="mb-3 text-rotulo uppercase text-ink-3">
              Sem horário de atendimento configurado
            </p>
            <ValorResumo
              resumo={SEM_HORARIO}
              frases={frasesDeValor(SEM_HORARIO, PERIODO)}
              periodo={PERIODO}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
