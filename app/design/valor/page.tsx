import NavRail from "@/components/NavRail";
import ValorResumo from "@/components/ValorResumo";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { frasesDeValor, rotuloDoMes, type ValorResumo as Resumo } from "@/lib/valor";

// Preview de design do resumo de valor percebido (dev-only, liberado pelo proxy).
//
// Mostra os TRÊS estados que importam:
// 1. com horário de atendimento configurado (manchete cheia mais acumulado);
// 2. sem horário: o número mais forte é omitido, com aviso. É o estado real da
//    OBM hoje, então precisa ficar apresentável também;
// 3. mês fechado vazio e acumulado com dado, que é a conta nova no primeiro mês.
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

// Acumulado desde o início: os mesmos indicadores, sem janela de data.
const ACUMULADO: Resumo = {
  recebidas: 4312,
  atendidasForaDoHorario: 1876,
  atendidasEmFimDeSemanaOuFeriado: 402,
  conversasSemHumano: 311,
  leadsQualificados: 164,
  pedidosDeAgendamento: 52,
  respostasEmMenosDeUmMinuto: 1094,
  primeiraRespostaMs: 39000,
  pico: { diaSemana: 0, hora: 17, mensagens: 268 },
  temHorario: true,
};

// Mês fechado sem nenhum movimento: conta que começou depois do mês virar.
const MES_VAZIO: Resumo = {
  recebidas: 0,
  atendidasForaDoHorario: 0,
  atendidasEmFimDeSemanaOuFeriado: 0,
  conversasSemHumano: 0,
  leadsQualificados: 0,
  pedidosDeAgendamento: 0,
  respostasEmMenosDeUmMinuto: 0,
  primeiraRespostaMs: null,
  pico: null,
  temHorario: true,
};

const FRASES_ACUMULADAS = frasesDeValor(ACUMULADO, "desde o início");

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
            acumulado={ACUMULADO}
            frasesAcumuladas={FRASES_ACUMULADAS}
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

          <div className="border-t border-line pt-6">
            <p className="mb-3 text-rotulo uppercase text-ink-3">
              Mês fechado sem movimento, com acumulado
            </p>
            <ValorResumo
              resumo={MES_VAZIO}
              frases={frasesDeValor(MES_VAZIO, PERIODO)}
              periodo={PERIODO}
              acumulado={ACUMULADO}
              frasesAcumuladas={FRASES_ACUMULADAS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
