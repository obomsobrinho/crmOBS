import { Bot, TriangleAlert } from "lucide-react";
import type { QuemAtende } from "@/lib/crm";

/**
 * Marca de "quem está atendendo" no canto do avatar. Uma só, usada pela lista de
 * conversas e pelo card do pipeline.
 *
 * VIROU COMPONENTE porque as duas telas já tinham divergido: a mesma marca
 * estava escrita duas vezes, com tamanho diferente (3,5 e 3) e com anéis
 * diferentes (`ring-surface` na lista, `ring-conteudo` no pipeline). O anel da
 * lista era mais ESCURO que o fundo dela (#15161d contra #1b1d23), e por isso a
 * marca lia como um disco escuro pendurado no avatar em vez de um glifo sobre a
 * superfície.
 *
 * O anel existe para abrir a folga entre a marca e o avatar, então ele tem que
 * ser a cor do FUNDO, nunca uma superfície própria.
 *
 * São duas marcas e não três de propósito: "pessoa atendendo" já é dito pelo
 * avatar do responsável, no canto de cima, e com nome.
 */
export default function QuemAtendeBadge({
  quem,
  tamanho = "md",
  envolver,
}: {
  quem: QuemAtende;
  /** `md` = lista de conversas (avatar de 36px); `sm` = card do pipeline (28px). */
  tamanho?: "sm" | "md";
  /** Envolve a marca (a lista usa para pendurar um Tooltip nela). */
  envolver?: (conteudo: React.ReactNode) => React.ReactNode;
}) {
  if (quem === "pessoa") return null;

  const sm = tamanho === "sm";
  const caixa = `flex items-center justify-center rounded-full ring-2 ring-conteudo ${
    sm ? "h-3 w-3" : "h-3.5 w-3.5"
  }`;
  const glifo = sm ? 8 : 9;

  const conteudo =
    quem === "ia" ? (
      <span className={`${caixa} bg-conteudo text-ink-3`}>
        <Bot size={glifo} />
      </span>
    ) : (
      <span
        className={`${caixa} border border-danger-line bg-danger-surface text-danger-ink`}
      >
        <TriangleAlert size={glifo} />
      </span>
    );

  // Quem posiciona é ESTE span, e não a marca lá dentro. Dois motivos:
  //
  // 1. `bottom-0 right-0` e não `-bottom-0.5 -right-0.5`: encostada para dentro
  //    do canto, a marca sobe e para de parecer pendurada fora do avatar.
  // 2. O `envolver` da lista de conversas devolve um `TooltipTrigger`, que é um
  //    span INLINE. Se ele ficasse solto dentro do container do avatar, criaria
  //    uma caixa de linha e aumentaria a altura do container em 6px medidos, e a
  //    marca desceria junto. Com o absoluto por fora, nada do que o `envolver`
  //    devolve participa do fluxo. Daí também o `leading-none`.
  return (
    <span className="absolute bottom-0 right-0 leading-none">
      {envolver ? envolver(conteudo) : conteudo}
    </span>
  );
}

/** O texto da marca, para tooltip ou `title`. Um lugar só, para não divergir. */
export function quemAtendeTexto(quem: QuemAtende): string {
  if (quem === "ia") return "A IA está atendendo";
  if (quem === "ninguem")
    return "Sem atendimento: a IA está pausada e ninguém assumiu";
  return "";
}
