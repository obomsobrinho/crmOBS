import { PainelFilaCartao } from "@/components/PainelBlocos";
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";

// Estados de borda do painel (dev-only, liberado pelo proxy).
//
// ⚠️ ESTA ROTA EXISTE PARA NÃO SUJAR A RÉPLICA. Estes blocos moravam no fim do
// `/design/painel`, sob o título "estados finos (não faz parte da tela)", e o
// dono apontou o óbvio: se o preview serve para comparar com a prancha, tudo que
// não está na prancha atrapalha a comparação, por mais que esteja rotulado.
//
// Apagar seria pior do que mover: é aqui que se prova, sem dado real, que conta
// nova não vê parede de zeros nem número inventado, e é aqui que ficam os dois
// estados da fila que a tela real quase nunca mostra ao mesmo tempo.
export const dynamic = "force-dynamic";

export default function DesignPainelEstadosPage() {
  return (
    <div className="min-h-screen bg-canvas p-6">
      <h1 className="mb-1 text-titulo">Painel: estados de borda</h1>
      <p className="mb-6 text-apoio text-ink-2">
        Nada aqui faz parte da tela. A tela é o /design/painel.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Stat variant="vazio" tamanho="manchete">
          <StatTopo>
            <StatRotulo>Conta nova, dia 1</StatRotulo>
          </StatTopo>
          <StatFrase tamanho="manchete">
            O agente entrou no ar hoje. Assim que a primeira pessoa escrever, o
            resumo aparece aqui.
          </StatFrase>
          <StatLegenda>
            Nenhum número é mostrado enquanto não existe atendimento medido.
          </StatLegenda>
        </Stat>

        <Stat variant="elevado">
          <StatTopo tamanho="operacao">
            <StatRotulo>Tempo de 1a resposta</StatRotulo>
            <span className="text-legenda text-ink-3">
              primeira semana medida
            </span>
          </StatTopo>
          <StatValor>14s</StatValor>
          <StatFrase>Mediana, contando só as respostas da IA</StatFrase>
          <StatLegenda>3 atendimentos medidos, últimos 7 dias</StatLegenda>
        </Stat>

        {/* Fila zerada: zero é presente, não tela vazia. */}
        <PainelFilaCartao quantas={0} esperaMs={null} espera="" />

        {/* Fila em aviso, acima de ESPERA_AVISO_MS. Mesma caixa e mesma altura
            da neutra: o que muda é fundo, borda e tinta. */}
        <PainelFilaCartao
          quantas={3}
          esperaMs={6 * 60 * 60 * 1000}
          espera="há 6 horas"
        />
      </div>

      {/* Antes e depois: só apareceria se o histórico importado sustentasse.
          Medido em 27/08/2026, ele NÃO sustenta (50 dos 52 contatos vieram com
          uma única mensagem, e a Evolution devolve `total: 1` por conversa),
          então na tela real este bloco não existe. Fica aqui como registro do
          desenho, para não ser redescoberto do zero. */}
      <Stat variant="vazio" tamanho="manchete" className="mt-4">
        <StatTopo>
          <StatRotulo>
            Antes e depois (não existe na tela: sem dado que sustente)
          </StatRotulo>
        </StatTopo>
        <StatFrase tamanho="manchete">
          Antes, quem te escrevia esperava 3h20 por uma resposta. Hoje espera 18
          segundos.
        </StatFrase>
        <StatLegenda>
          Depende de um histórico importado que o WhatsApp não entrega hoje.
        </StatLegenda>
      </Stat>
    </div>
  );
}
