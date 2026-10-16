import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ORDEM_PERIODOS, PERIODOS, ehPeriodo, type PeriodoKey } from "@/lib/periodo";

/**
 * O seletor de período do painel: Dia, Semana, Quinzena, Mês (`lib/periodo.ts`),
 * a bandeja `painel` do `Tabs`. UMA peça para "A operação", "Por que a IA te
 * chamou" e as abas Uso de IA e Atendimento da central do dono, para o período
 * nunca ter duas opiniões. Cada bloco guarda o próprio período (quem chama
 * guarda o estado); a bandeja nasce na cor do cartão, e dentro de um cartão o
 * chamador a recua por `className` se precisar.
 */
export default function SeletorDePeriodo({
  valor,
  aoMudar,
  className,
}: {
  /** `null` = nenhum chip aceso (a central escolheu um mês passado ou "Todo o período" por outro controle). */
  valor: PeriodoKey | null;
  aoMudar: (p: PeriodoKey) => void;
  className?: string;
}) {
  return (
    <Tabs value={valor ?? ""} onValueChange={(v) => ehPeriodo(v) && aoMudar(v)} className={className}>
      <TabsList variant="painel" aria-label="Período">
        {ORDEM_PERIODOS.map((k) => (
          <TabsTrigger key={k} value={k} variant="painel">
            {PERIODOS[k].aba}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
