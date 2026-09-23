import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// O que sobrou da barra de onboarding: UMA LINHA.
//
// ⚠️ ELA NÃO CONTA PASSOS, e isso é a regra. A antiga `OnboardingBar` mostrava
// "2 de 4", uma barra de progresso e a lista dos quatro passos, em toda página
// do app. Com o assistente de `/montagem` existindo, aquilo produziria dois
// contadores de progresso na mesma conta, um deles dentro do outro. Agora existe
// um contador só, e ele mora dentro do assistente; aqui fica apenas a porta de
// volta.
//
// Some sozinha quando o agente vai ao ar (o layout deixa de renderizar), então
// não tem botão de fechar: fechar daria a sensação de pronto sem estar.
//
// Sem "use client": não tem estado nenhum, ao contrário da barra que ela
// substitui, que precisava de estado só para expandir a lista de passos.
export default function AvisoMontagem() {
  return (
    <div
      data-slot="aviso-montagem"
      className={cn(
        cardVariants(),
        "flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:py-2"
      )}
    >
      <Rocket size={17} className="shrink-0 text-brand-ink" aria-hidden />
      <p className="min-w-0 flex-1 text-apoio">
        Seu agente ainda não está no ar.
        <span className="ml-1.5 text-ink-2">
          Ninguém recebe resposta automática até você ativar.
        </span>
      </p>
      <Link
        href="/montagem"
        className="flex shrink-0 items-center gap-1.5 text-apoio font-semibold text-brand-ink transition-opacity hover:opacity-80"
      >
        Continuar a montagem
        <ArrowRight size={15} aria-hidden />
      </Link>
    </div>
  );
}
