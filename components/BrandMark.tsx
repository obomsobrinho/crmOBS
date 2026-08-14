import { BRAND } from "@/lib/brand";

// Selo + nome do produto. Estava copiado em 6 telas; agora é um componente, então
// trocar a marca é editar `lib/brand.ts` (nome) e os tokens de cor do
// `globals.css`, sem passar de arquivo em arquivo.
export default function BrandMark({
  size = "md",
}: {
  /** sm = nav rail (7), md = telas de entrada (8). */
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-7 w-7 text-sm" : "h-8 w-8 text-base";
  const label = size === "sm" ? "text-base" : "text-xl";

  return (
    <div className="flex items-center gap-2">
      <div
        className={`brand-grad flex shrink-0 items-center justify-center rounded-lg font-display font-bold ${box}`}
        aria-hidden
      >
        {BRAND.initial}
      </div>
      <span className={`font-display font-bold tracking-tight ${label}`}>
        {BRAND.name}
      </span>
    </div>
  );
}
