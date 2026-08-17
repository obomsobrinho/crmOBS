import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

// Selo + nome da marca. Estava copiado em 6 telas; agora é um componente, então
// trocar a marca é editar `lib/brand.ts` (nome e caminho das artes) e os tokens
// de cor do `globals.css`, sem passar de arquivo em arquivo.
//
// As DUAS artes ficam no DOM e quem escolhe é o CSS (`.mark-light`/`.mark-dark`
// no globals.css, reagindo a [data-theme]). É de propósito: o tema vem de cookie
// e é aplicado no <html>, então decidir aqui em JS causaria troca visível depois
// da primeira pintura. Duas imagens de 35 KB custam menos que esse flash.
export default function BrandMark({
  size = "md",
}: {
  /** sm = nav rail (32px), md = telas de entrada (40px). */
  size?: "sm" | "md";
}) {
  const px = size === "sm" ? 32 : 40;
  const label = size === "sm" ? "text-corpo" : "text-titulo";

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="relative block shrink-0"
        style={{ width: px, height: px }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BRAND.markLight}
          alt=""
          width={px}
          height={px}
          className="mark-light h-full w-full object-contain"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BRAND.markDark}
          alt=""
          width={px}
          height={px}
          className="mark-dark h-full w-full object-contain"
        />
      </span>
      <span className={cn("truncate font-semibold", label)}>{BRAND.name}</span>
    </div>
  );
}
