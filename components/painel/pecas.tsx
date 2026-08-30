"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";
import type { Delta } from "@/lib/delta";
import { useContagem } from "@/components/painel/useContagem";

// Peças pequenas que os dois blocos com estado do painel (operação e movimento)
// compartilham. Ficam juntas num arquivo só para não virarem três arquivos de
// vinte linhas.

/**
 * Selo de variação, ou a frase de "sem base". Nunca um número inventado.
 *
 * Veio de `DashboardCards.tsx`, que deixou de existir na rodada 3. O TOM sai de
 * `lib/delta.ts`, que sabe a direção certa de cada número: no tempo de resposta
 * menos é melhor, e sem essa regra o selo ficaria verde num atendimento que
 * piorou.
 */
export function Selo({
  delta,
  sufixo,
}: {
  delta: Delta;
  /**
   * A BASE da comparação, DENTRO da pílula. Ex.: "vs. 36".
   *
   * Dentro e não ao lado porque na prancha o selo do movimento é uma peça só
   * ("↗ +17% vs. 36"). Porcentagem sozinha obriga a pessoa a caçar a base no
   * subtítulo, e a base é metade da informação. Some junto com o selo quando
   * não há período anterior, que é o certo: sem base não há o que citar.
   */
  sufixo?: string;
}) {
  if (delta.tipo === "sem-base") {
    return <span className="text-legenda text-ink-3">{delta.texto}</span>;
  }
  const variant =
    delta.tom === "bom"
      ? "delta-bom"
      : delta.tom === "ruim"
        ? "delta-ruim"
        : "delta-neutro";
  const Seta = delta.subiu ? TrendingUp : TrendingDown;
  return (
    <Badge variant={variant}>
      {delta.texto !== "igual" && <Seta size={12} aria-hidden />}
      {delta.texto}
      {sufixo && <span className="font-medium opacity-80">{sufixo}</span>}
    </Badge>
  );
}

/**
 * Um numeral que corre até o valor: 0 na entrada da tela, valor atual na troca
 * de período. `formatar` existe para o tempo de resposta, que conta em
 * milissegundos e sai como "8s".
 */
export function NumeroAnimado({
  valor,
  formatar,
}: {
  valor: number;
  formatar?: (n: number) => string;
}) {
  const n = useContagem(valor);
  return <>{formatar ? formatar(n) : n.toLocaleString("pt-BR")}</>;
}

/**
 * Cartão de um número que AINDA NÃO EXISTE.
 *
 * ⚠️ O numeral é literalmente `XX`, nunca um valor plausível, nem borrado, nem
 * esmaecido, nem uma amostra. O eixo inteiro do produto é que a IA não inventa;
 * um print de um "17" borrado que alguém amplia destrói exatamente isso. `XX`
 * não pode ser confundido com medição.
 *
 * A FRASE fica por inteiro, porque é ela que explica o que vai ser medido. E não
 * existe selo de variação: não há do que variar.
 *
 * ⚠️ Este cartão some SOZINHO quando o dado chegar: quem decide é o chamador,
 * que só o usa enquanto não tem número. Não existe interruptor para alguém
 * lembrar de desligar.
 */
export function CartaoEmBreve({
  rotulo,
  frase,
  legenda,
}: {
  rotulo: string;
  frase: string;
  legenda: string;
}) {
  return (
    // ⚠️ `data-em-breve` e NÃO `data-slot`: o `Stat` escreve o `data-slot` DEPOIS
    // do spread das props (regra 4 da camada base), então um `data-slot` vindo de
    // fora é silenciosamente sobrescrito por "stat". Medido: o marcador sumia.
    <Stat variant="vazio" data-em-breve="sim">
      <StatTopo tamanho="operacao">
        <StatRotulo>{rotulo}</StatRotulo>
        <Badge variant="tracejado">Em breve</Badge>
      </StatTopo>
      <StatValor className="text-ink-faint">XX</StatValor>
      <StatFrase>{frase}</StatFrase>
      <StatLegenda>{legenda}</StatLegenda>
    </Stat>
  );
}
