import TituloDaPagina from "@/components/TituloDaPagina";
import { cardVariants } from "@/components/ui/card";
import { Esqueleto } from "@/components/ui/esqueleto";
import { cn } from "@/lib/utils";

/**
 * A moldura estática de uma rota (13/11/2026, passo 0 de
 * docs/plano-dados-e-estado.md): o que o `loading.tsx` de cada rota desenha NA
 * HORA do clique, enquanto o servidor confere a sessão e lê a página. Título,
 * ícone e o desenho dos blocos, sem dado e sem sessão: nada aqui é sensível, e
 * o redirecionamento do gate continua acontecendo antes de qualquer dado.
 *
 * Uma peça só para todas as rotas, para o esqueleto não virar uma cópia de
 * classes por tela. O título é o mesmo `TituloDaPagina` da página quando a
 * página usa ele (`cabecalho="solto"`); nas telas com barra de filtros
 * (`cabecalho="barra"`) a barra é desenhada aqui, com o título real e os
 * controles como esqueleto.
 *
 * `loading.tsx` não recebe os parâmetros da URL: a moldura nunca desenha aba
 * ativa nem filtro escolhido.
 */
type Corpo = "lista" | "colunas" | "grade" | "formulario" | "semana";

export default function MolduraDeCarregamento({
  titulo,
  cabecalho = "barra",
  apoio = false,
  voltar = false,
  controles = 0,
  barra = "baixa",
  controlesAbaixo = false,
  corpo,
  cartao = true,
  className,
}: {
  titulo?: string;
  /** `solto`: título com a linha de apoio, como Painel, Equipe e Perfil; `barra`: a faixa de cima com borda. */
  cabecalho?: "solto" | "barra";
  /** Linha de apoio como esqueleto (o texto dela depende da conta). */
  apoio?: boolean;
  /** Botão de voltar antes do título (Nova busca). */
  voltar?: boolean;
  /** Quantos controles (abas, filtros, botões) a barra mostra como esqueleto. */
  controles?: number;
  /** `alta`: a barra com campo de busca (Pipeline), 16px em volta e controles de 36px. */
  barra?: "baixa" | "alta";
  /** Os controles numa linha própria, embaixo do título (Pedidos). */
  controlesAbaixo?: boolean;
  corpo: Corpo;
  /** `false` no Painel, que não tem cartão em volta (a página é a área rolável). */
  cartao?: boolean;
  className?: string;
}) {
  const linhaDeApoio = apoio ? <Esqueleto className="mt-1 h-4 w-56" /> : undefined;
  return (
    <div
      aria-busy
      data-slot="moldura-carregando"
      className={cn(
        cartao && cardVariants({ variant: "pagina" }),
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        cartao && cabecalho === "solto" && "p-6 max-md:p-4",
        !cartao && "gap-5 pr-1 max-md:px-4 max-md:pb-6 max-md:pt-4",
        className
      )}
    >
      {cabecalho === "solto" ? (
        titulo && <TituloDaPagina titulo={titulo} apoio={linhaDeApoio} className={cartao ? "mb-5" : undefined} />
      ) : (
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 border-b border-line max-md:px-4",
            barra === "alta" ? "p-4" : "px-5 py-3"
          )}
        >
          {voltar && <Esqueleto className="size-9 rounded-lg" />}
          {titulo && <h1 className="text-pagina">{titulo}</h1>}
          {controles > 0 && (
            <div className={cn("flex flex-wrap items-center gap-3", controlesAbaixo && "basis-full")}>
              {Array.from({ length: controles }, (_, i) => (
                <Esqueleto key={i} forma="pilula" className={cn(barra === "alta" ? "h-9" : "h-8", i === 0 ? "w-48" : "w-36")} />
              ))}
            </div>
          )}
        </div>
      )}
      <Corpo corpo={corpo} solto={cabecalho === "solto"} />
    </div>
  );
}

function Corpo({ corpo, solto }: { corpo: Corpo; solto: boolean }) {
  const respiro = solto ? "" : "p-5 max-md:p-4";
  switch (corpo) {
    case "lista":
      return (
        <div className={cn("flex flex-col gap-3", respiro)}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Esqueleto forma="circulo" className="size-9 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Esqueleto className="h-4 w-40" />
                <Esqueleto className="h-3 w-64 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      );
    case "colunas":
      return (
        <div className={cn("flex min-h-0 flex-1 gap-3 overflow-hidden", respiro)}>
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} forma="bloco" className="h-full min-h-48 w-72 shrink-0 max-md:w-full" />
          ))}
        </div>
      );
    case "grade":
      // O desenho do Painel: a coluna larga (o número grande, depois quatro
      // cartões) e, no computador grande, a coluna estreita à direita.
      return (
        <div className={cn("grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]", respiro)}>
          <div className="flex flex-col gap-5">
            <Esqueleto forma="bloco" className="h-64" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Esqueleto key={i} forma="bloco" className="h-60" />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-5 max-xl:hidden">
            <Esqueleto forma="bloco" className="h-24" />
            <Esqueleto forma="bloco" className="h-72" />
            <Esqueleto forma="bloco" className="h-40" />
          </div>
        </div>
      );
    case "formulario":
      return (
        <div className={cn("flex max-w-2xl flex-col gap-5", respiro)}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Esqueleto className="h-3 w-28" />
              <Esqueleto forma="bloco" className={i === 2 ? "h-32" : "h-10"} />
            </div>
          ))}
        </div>
      );
    case "semana":
      return (
        // O mês pequeno à esquerda (só no computador) e a semana ao lado.
        <div className="flex min-h-0 flex-1">
          <div className="w-[244px] shrink-0 border-r border-line p-4 max-md:hidden">
            <Esqueleto forma="bloco" className="h-56" />
          </div>
          <div className={cn("grid min-h-0 flex-1 grid-cols-7 gap-2 max-md:grid-cols-3", respiro)}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Esqueleto key={i} forma="bloco" className="h-full min-h-48" />
            ))}
          </div>
        </div>
      );
  }
}
