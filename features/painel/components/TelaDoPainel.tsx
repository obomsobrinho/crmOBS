"use client";

import { useQuery } from "@tanstack/react-query";
import PainelOperacaoBloco from "@/components/painel/PainelOperacaoBloco";
import PainelMovimento from "@/components/painel/PainelMovimento";
import { PainelFilaCartao, PainelUltimaResposta } from "@/components/PainelBlocos";
import PainelAssuntos from "@/components/painel/PainelAssuntos";
import TituloDaPagina from "@/components/TituloDaPagina";
import PainelMotivos from "@/components/painel/PainelMotivos";
import ValorResumo from "@/components/ValorResumo";
import MolduraDeCarregamento from "@/components/MolduraDeCarregamento";
import { ErroDoBloco } from "@/components/ui/erro-do-bloco";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { useSessao } from "@/lib/sessao";
import { chavesDoPainel } from "../api/chaves";
import { painelDoNavegador } from "../api/navegador";

// Painel, rodada 3 do desenho. ARRANJO: coluna principal mais trilha de 380px (a
// explicação de cada bloco está nos comentários abaixo, que vieram da página).
//
// ⚠️ CADA BLOCO MANDA NO PRÓPRIO PERÍODO; não existe seletor global.
//
// Passo 3b de docs/plano-dados-e-estado.md: a página não lê o banco (D8). O que ela
// lia e calculava no servidor é UMA leitura do navegador pelo cache
// (`api/painel.ts`, as mesmas funções puras), com a moldura do Painel enquanto chega.
// Sem realtime (como antes): a volta do foco relê o que estiver velho (2.4).
export default function TelaDoPainel() {
  const s = useSessao();
  const q = useQuery({
    queryKey: chavesDoPainel.dados(),
    queryFn: () => painelDoNavegador({ clientId: s.clientId, avisos: s.avisos }),
    refetchOnWindowFocus: true,
  });
  if (q.isError && !q.data) {
    return (
      <ErroDoBloco
        frase="Não deu para carregar o painel agora."
        aoTentar={() => void q.refetch()}
        tentando={q.isFetching}
        className="m-auto"
      />
    );
  }
  if (!q.data) {
    return <MolduraDeCarregamento titulo="Painel" cabecalho="solto" apoio cartao={false} corpo="grade" />;
  }
  const d = q.data;

  // ⚠️ O painel NÃO é um cartão branco: é página sobre o canvas, com os cartões
  // flutuando (`Stat variant="elevado"`). É obrigatório no claro por um motivo
  // de token: `--s-bloco` claro é igual ao `--canvas`, então cartão `bloco`
  // dentro de cartão branco ficaria um degrau ABAIXO da casca.
  return (
    <AreaRolavel
      tamanho={DISSOLVER_LISTA}
      className="flex min-h-0 flex-1 flex-col gap-5 pr-1 max-md:px-4 max-md:pb-6 max-md:pt-4"
    >
      {/* Cabeçalho: título à esquerda, fila à direita, na MESMA linha. A fila
          saiu da trilha porque `/painel` é onde o dono cai ao entrar, e o que
          ele precisa saber primeiro é se tem gente esperando. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <TituloDaPagina
          titulo="Painel"
          apoio={<>O que a IA fez pela conta {s.nome}.</>}
        />
      </div>

      {/* ⚠️ GRADE DE LINHAS COMPARTILHADAS. Ver a explicação em
          app/design/painel/page.tsx: com duas colunas em `flex`, o verbatim caía
          desalinhado do movimento; com linhas compartilhadas os dois começam e
          terminam juntos, seja qual for a altura do conteúdo. */}
      {/* ⚠️ `xl:flex-1` mais `xl:min-h-0` dão à grade uma altura DEFINIDA. Sem
          isso as linhas resolvem pela altura do conteúdo, a lista de assuntos
          cresce sem limite e a rolagem interna dela não tem contra o que
          resolver. A linha elástica é a TERCEIRA (movimento e verbatim), porque
          é ela que a prancha estica até o fim da tela.

          ⚠️ Ela é `minmax(220px, 1fr)` e NÃO `1fr`. `1fr` sozinho é
          `minmax(auto, 1fr)`, ou seja, o mínimo é o min-content do cartão, e era
          ele que impedia a tela de caber em janela mais baixa: quem abre o
          navegador com barra de favoritos perde ~100px e ganhava um resto de
          rolagem. Com o piso explícito a linha cede até 220px e a tela fecha;
          abaixo disso a rolagem volta, que é o certo em monitor pequeno. */}
      {/* CELULAR (plano do mobile, fase 2): uma coluna na ordem do desenho,
          manchete, "precisa de você", operação, movimento, assuntos, última
          resposta. A trilha vira `contents` para a fila e os assuntos entrarem
          na ordem da coluna, e a ordem sai por `order`, sem duplicar bloco. */}
      <div data-slot="painel-grade" className="grid min-w-0 gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_auto_minmax(220px,1fr)]">
        <div className="min-w-0 max-md:order-1 xl:col-start-1 xl:row-start-1">
          <ValorResumo
            resumo={d.resumo}
            frases={d.frases}
            periodo={d.periodo}
            acumulado={d.acumulado}
            frasesAcumuladas={d.frasesAcumuladas}
            parte="manchete"
            horas={d.horas}
            rotuloHorario={d.rotuloHorario}
            avisoHorario={d.avisoHorario}
          />

        </div>

        <div className="min-w-0 max-md:order-3 xl:col-start-1 xl:row-start-2">
          <PainelOperacaoBloco janelas={d.janelas} />
        </div>

          {/* ⚠️ NÃO EXISTE "o que mais ela fez" AQUI. A coluna termina no
              movimento, como na prancha da rodada 3. As frases secundárias de
              valor continuam existindo em `frasesDeValor` e aparecem no
              `/design/valor` e no passo de cancelar; o que saiu foi a seção no
              painel, que o desenho não tem. */}
        <div className="min-w-0 [&>section]:h-full max-md:order-4 xl:col-start-1 xl:row-start-3">
          <PainelMovimento janelas={d.movimento} desdeMs={d.desdeMs} />
        </div>

        {/* ⚠️ `xl:h-0 xl:min-h-full` conserta um efeito real da grade: este bloco
            ATRAVESSA as linhas 1 e 2, e como as duas são `auto`, a grade somava
            a altura de CONTEÚDO dele (fila mais a lista inteira de assuntos) e
            distribuía a sobra nas duas, abrindo um vão embaixo da manchete e
            outro embaixo da operação. Com `h-0` a contribuição intrínseca vira
            zero, quem dimensiona as linhas passa a ser só a coluna principal, e
            `min-h-full` devolve a altura das duas linhas para ele preencher. */}
        <div className="flex min-h-0 min-w-0 flex-col gap-5 max-md:contents max-md:[&>:first-child]:order-2 max-md:[&>:last-child]:order-5 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:h-0 xl:min-h-full">
          <PainelFilaCartao
            quantas={d.esperando}
            esperaMs={d.esperaMs}
            espera={d.esperaTexto}
          />
          {/* No celular a coluna vira `contents` e cada filho entra na grade pela
              ordem: o primeiro (fila) e o último (assuntos) já têm a sua; este,
              do meio, vai logo depois do movimento. */}
          <PainelMotivos porPeriodo={d.motivos} className="max-md:order-4" />
          {/* ⚠️ Sem `itens`, e por isso sai o estado vazio honesto: não existe
              coluna que classifique o ASSUNTO de um turno. Quando existir, a
              página passa a lista e o placeholder some sozinho. */}
          <PainelAssuntos />
        </div>

        <div className="min-w-0 [&>section]:h-full max-md:order-6 xl:col-start-2 xl:row-start-3">

          {d.verbatim && <PainelUltimaResposta {...d.verbatim} />}
        </div>
      </div>
    </AreaRolavel>
  );
}
