import { cn } from "@/lib/utils";

/**
 * Cabeçalho de página (título e uma linha de apoio). A MESMA peça desenha a
 * página e o `loading.tsx` dela, para a moldura que aparece no clique e a página
 * que chega depois não pularem (passo 0 de docs/plano-dados-e-estado.md).
 *
 * Título em `text-pagina` (28/700), sem ícone (24/11/2026, decisão do dono): o
 * peso do título do login levado para o app. O ícone roxo de 20px ao lado de um
 * título de 18px era o que deixava a cabeça da página leve e roxa demais.
 *
 * `apoio` pode ser um esqueleto no `loading.tsx` (que não sabe o nome da conta):
 * por isso a linha é um `div`, nunca um `p` (um esqueleto é um `div`).
 */
export default function TituloDaPagina({
  titulo,
  apoio,
  className,
}: {
  titulo: string;
  apoio?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <h1 className="mb-1 text-pagina">{titulo}</h1>
      {apoio != null && <div className="text-apoio text-ink-2">{apoio}</div>}
    </div>
  );
}
