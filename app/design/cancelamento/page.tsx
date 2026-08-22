import BillingCheckout from "@/components/BillingCheckout";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { frasesDeValor, type ValorResumo } from "@/lib/valor";

// Preview de design do passo de cancelar (dev-only, liberado pelo proxy).
//
// Existe separado do /design/assinatura porque lá o mock é de quem nunca
// contratou, e o botão de cancelar só aparece para quem tem assinatura viva.
// É neste passo que mora o antídoto: o acumulado de valor desde o início.
export const dynamic = "force-dynamic";

const ACUMULADO: ValorResumo = {
  recebidas: 4210,
  atendidasForaDoHorario: 1876,
  atendidasEmFimDeSemanaOuFeriado: 402,
  conversasSemHumano: 311,
  leadsQualificados: 164,
  pedidosDeAgendamento: 58,
  respostasEmMenosDeUmMinuto: 1104,
  primeiraRespostaMs: 38000,
  pico: { diaSemana: 0, hora: 19, mensagens: 210 },
  temHorario: true,
};

export default function DesignCancelamentoPage() {
  return (
    <div className="flex min-h-screen items-start justify-center bg-canvas p-4 py-10">
      <div className={cn(cardVariants(), "w-full max-w-lg p-7")}>
        <BillingCheckout
          planoAtual="profissional"
          temAssinatura
          nomePadrao="Ótica Vision"
          emailPadrao="dono@oticavision.com.br"
          planoSugerido={null}
          frasesAcumuladas={frasesDeValor(ACUMULADO, "desde o início")}
        />
      </div>
    </div>
  );
}
