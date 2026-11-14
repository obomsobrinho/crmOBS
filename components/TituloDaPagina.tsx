import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página (ícone da marca, título e uma linha de apoio). A MESMA peça
 * desenha a página e o `loading.tsx` dela, para a moldura que aparece no clique e
 * a página que chega depois não pularem (passo 0 de docs/plano-dados-e-estado.md).
 *
 * `apoio` pode ser um esqueleto no `loading.tsx` (que não sabe o nome da conta):
 * por isso a linha é um `div`, nunca um `p` (um esqueleto é um `div`).
 */
export default function TituloDaPagina({
  icone: Icone,
  titulo,
  apoio,
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  apoio?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-center gap-2">
        <Icone size={20} className="text-brand-ink" />
        <h1 className="text-titulo">{titulo}</h1>
      </div>
      {apoio != null && <div className="text-apoio text-ink-2">{apoio}</div>}
    </div>
  );
}
