import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Fallback ao abrir um cliente da central (Suspense do segmento [id]): aparece NA HORA do
// clique, enquanto o servidor lê o cliente, e ocupa o lugar do detalhe (cabeçalho, as cinco
// abas e o corpo) para a tela não pular quando a página chega. É o mesmo desenho do
// `inbox/[id]/loading.tsx`: a lista que ficou para trás é do layout, só o corpo troca. Nada
// de texto aqui: o skeleton não diz o que a página é, e quem não é admin nunca vê a central
// (a guarda redireciona antes de qualquer conteúdo).
export default function Loading() {
  const bloco = "animate-pulse rounded bg-[var(--chip-bg)]";
  return (
    <div
      data-slot="central-detalhe-carregando"
      aria-busy
      className={cn(cardVariants({ variant: "pagina" }), "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden")}
    >
      <div className="border-b border-line px-4 pb-0 pt-3 md:px-5">
        <div className={cn(bloco, "h-8 w-24")} />
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--chip-bg)]" />
          <div className={cn(bloco, "h-5 w-48")} />
          <div className={cn(bloco, "h-5 w-20 rounded-full")} />
        </div>
        <div className={cn(bloco, "mt-3 h-4 w-56")} />
        <div className="mt-4 flex gap-3 pb-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={cn(bloco, "h-5 w-20")} />
          ))}
        </div>
      </div>
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 md:px-5 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-[var(--chip-bg)]/60" />
        ))}
      </div>
    </div>
  );
}
