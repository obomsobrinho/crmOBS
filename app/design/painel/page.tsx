import { LayoutDashboard } from "lucide-react";
import NavRail from "@/components/NavRail";
import PainelOperacaoBloco, {
  type JanelaCalculada,
} from "@/components/painel/PainelOperacaoBloco";
import PainelMovimento, {
  type MovimentoJanela,
  type MovimentoKey,
} from "@/components/painel/PainelMovimento";
import {
  PainelFilaCartao,
  PainelUltimaResposta,
} from "@/components/PainelBlocos";
import PainelAssuntos, {
  type AssuntoEmAlta,
} from "@/components/painel/PainelAssuntos";
import ValorResumo from "@/components/ValorResumo";
import { barras, type DashboardMetrics, type JanelaMsg } from "@/lib/metrics";
import {
  limites,
  ORDEM_PERIODOS,
  PERIODOS,
  type PeriodoKey,
} from "@/lib/periodo";
import {
  frasesDeValor,
  rotuloDoMes,
  type ValorResumo as Resumo,
} from "@/lib/valor";
import type { BarraHora } from "@/lib/painel";

// Preview de design do Painel (dev-only, liberado pelo proxy).
//
// ⚠️ Ele renderiza a tela INTEIRA, na MESMA ordem da tela real, e é onde os e2e
// sem login batem. Preview que mostra meia tela não serve: em 26/08 este arquivo
// mostrava só os quatro cartões, sem a manchete, então revisar o painel por aqui
// era revisar metade dele.
//
// A seção "estados finos", no fim, NÃO faz parte da tela: ela existe para o
// preview provar, sem dado real, que conta nova não vê parede de zeros nem
// número inventado.
export const dynamic = "force-dynamic";

const AGORA = Date.now();

// Mensagens sintéticas, geradas relativas a "agora" porque as janelas saem de
// agora: com datas fixas o preview ficaria vazio no dia seguinte.
function sintetico(dias: number): JanelaMsg[] {
  const out: JanelaMsg[] = [];
  const passos = dias <= 1 ? 24 : dias;
  const passoMs = dias <= 1 ? 3600_000 : 86_400_000;
  for (let i = 0; i < passos; i++) {
    const quando = AGORA - (passos - 1 - i) * passoMs + 60_000;
    // Um balde SEM movimento, para provar que o gráfico mostra o buraco em vez
    // de encurtar o eixo.
    const vazio = i === Math.floor(passos / 3);
    const ia = vazio ? 0 : 2 + ((i * 5) % 9);
    const time = vazio ? 0 : i % 4 === 0 ? 2 : 0;
    for (let n = 0; n < ia; n++) {
      out.push({
        phone: `55119${(i * 7 + n) % 90}@s.whatsapp.net`,
        user_message: "oi",
        bot_message: "resposta",
        message_type: "text",
        created_at: new Date(quando).toISOString(),
      });
    }
    for (let n = 0; n < time; n++) {
      out.push({
        phone: `55119${(i * 3 + n) % 90}@s.whatsapp.net`,
        user_message: null,
        bot_message: "resposta do time",
        message_type: "manual",
        created_at: new Date(quando).toISOString(),
      });
    }
  }
  return out;
}

const METRICS: Record<PeriodoKey, DashboardMetrics> = {
  dia: {
    conversas: 7,
    semIntervencao: 6,
    leadsQualificados: 2,
    primeiraRespostaMs: 11000,
    amostraMediana: 6,
    preferiuConfirmar: 1,
    respostasIa: 19,
    pessoasNovas: 3,
  },
  semana: {
    conversas: 42,
    semIntervencao: 31,
    leadsQualificados: 9,
    primeiraRespostaMs: 8000,
    amostraMediana: 38,
    preferiuConfirmar: 9,
    respostasIa: 128,
    pessoasNovas: 17,
  },
  quinzena: {
    conversas: 79,
    semIntervencao: 58,
    leadsQualificados: 15,
    primeiraRespostaMs: 9000,
    amostraMediana: 71,
    preferiuConfirmar: 17,
    respostasIa: 241,
    pessoasNovas: 29,
  },
  mes: {
    conversas: 151,
    semIntervencao: 112,
    leadsQualificados: 31,
    primeiraRespostaMs: 9000,
    amostraMediana: 138,
    preferiuConfirmar: 34,
    respostasIa: 486,
    pessoasNovas: 61,
  },
};

// Período anterior. `quinzena` fica NULA de propósito: é o caso que prova que,
// sem base para comparar, os selos somem e viram uma frase.
const ANTERIOR: Record<PeriodoKey, DashboardMetrics | null> = {
  dia: {
    ...METRICS.dia,
    semIntervencao: 4,
    primeiraRespostaMs: 26000,
    preferiuConfirmar: 0,
    pessoasNovas: 2,
  },
  semana: {
    ...METRICS.semana,
    semIntervencao: 26,
    primeiraRespostaMs: 21000,
    preferiuConfirmar: 12,
    pessoasNovas: 12,
  },
  quinzena: null,
  mes: {
    ...METRICS.mes,
    semIntervencao: 94,
    primeiraRespostaMs: 12000,
    preferiuConfirmar: 41,
    pessoasNovas: 55,
  },
};

const JANELAS = Object.fromEntries(
  ORDEM_PERIODOS.map((k) => {
    const p = PERIODOS[k];
    const lim = limites(p, AGORA);
    const j: JanelaCalculada = {
      key: k,
      metrics: METRICS[k],
      anterior: ANTERIOR[k],
      barras: barras(sintetico(p.dias), p.dias, lim.ate),
    };
    return [k, j];
  })
) as Record<PeriodoKey, JanelaCalculada>;

const MOVIMENTO = {
  "14": {
    dias: 14,
    barras: barras(sintetico(14), 14, AGORA),
    conversas: 42,
    conversasAnterior: 36,
    pessoasNovas: 17,
  },
  "30": {
    dias: 30,
    barras: barras(sintetico(30), 30, AGORA),
    conversas: 151,
    conversasAnterior: 128,
    pessoasNovas: 61,
  },
} satisfies Record<MovimentoKey, MovimentoJanela>;

const PERIODO = rotuloDoMes(2026, 7);

const MES: Resumo = {
  recebidas: 486,
  atendidasForaDoHorario: 213,
  atendidasEmFimDeSemanaOuFeriado: 47,
  conversasSemHumano: 38,
  leadsQualificados: 19,
  pedidosDeAgendamento: 6,
  respostasEmMenosDeUmMinuto: 122,
  primeiraRespostaMs: 42000,
  pico: { diaSemana: 0, hora: 17, mensagens: 31 },
  temHorario: true,
};

const ACUMULADO: Resumo = {
  recebidas: 4312,
  atendidasForaDoHorario: 1876,
  atendidasEmFimDeSemanaOuFeriado: 402,
  conversasSemHumano: 311,
  leadsQualificados: 164,
  pedidosDeAgendamento: 52,
  respostasEmMenosDeUmMinuto: 1094,
  primeiraRespostaMs: 39000,
  pico: { diaSemana: 0, hora: 17, mensagens: 268 },
  temHorario: true,
};

/** Horário comercial do preview, para a metade cinza da coluna. */
const ABERTO = (hora: number) => hora >= 8 && hora <= 18;

/**
 * As 24 colunas do preview.
 *
 * ⚠️ A SOMA DE `fora` TEM QUE SER EXATAMENTE `MES.atendidasForaDoHorario`, que é
 * o número da manchete. Na tela real quem garante isso é `barrasDeHora`, que
 * conta as mesmas linhas que a manchete conta; aqui, sem banco, a distribuição é
 * feita à mão e o RESTO do arredondamento cai na última hora, para o total
 * fechar sempre. O e2e confere essa igualdade lendo os `data-fora`.
 *
 * ⚠️ TODA hora recebe uma parte `fora`, inclusive as do meio do dia, e isso não
 * é enfeite: fora do expediente inclui FIM DE SEMANA. Um sábado às 14h é fora,
 * para quem abre de segunda a sexta. Se o preview deixasse as horas comerciais
 * só com cinza, ele não mostraria a pilha, que é a peça central do gráfico, e a
 * legenda ("incluindo fim de semana e feriado") pareceria não ter sentido.
 */
function horasSintetico(): BarraHora[] {
  // Forma plausível de um dia: pouco de madrugada, pico no fim da tarde.
  const peso = [
    3, 2, 1, 1, 1, 1, 2, 4, 7, 9, 10, 10, 8, 9, 10, 11, 12, 12, 9, 7, 6, 5, 4, 3,
  ];
  const total = MES.atendidasForaDoHorario ?? 0;
  const somaPeso = peso.reduce((a, b) => a + b, 0);
  const somaAberto = peso.reduce((s, p, hora) => (ABERTO(hora) ? s + p : s), 0);

  const colunas: BarraHora[] = peso.map((p, hora) => ({
    hora,
    // O cinza só existe em hora comercial, e não precisa fechar com nada.
    dentro: ABERTO(hora) ? Math.round((p / somaAberto) * 273) : 0,
    fora: Math.floor((p / somaPeso) * total),
  }));

  const falta = total - colunas.reduce((s, c) => s + c.fora, 0);
  colunas[23].fora += falta;
  return colunas;
}

const HORAS = horasSintetico();

/**
 * Assuntos mockados, com a mesma FORMA da prancha: cinco linhas, contagem
 * decrescente, variação sempre neutra e um deles aberto.
 *
 * ⚠️ O CONTEÚDO é neutro de segmento de propósito. A prancha foi desenhada para
 * uma ótica e fala em consulta e lente; aqui os testadores do beta são advogado,
 * pediatra, barbeiro, engenheiro, clínica e comércio, e existe e2e que reprova
 * a tela se um texto assumir um único ramo. O que o preview precisa provar é o
 * ARRANJO, não o vocabulário de uma empresa fictícia.
 */
const ASSUNTOS: AssuntoEmAlta[] = [
  {
    titulo: "Garantia do que foi entregue",
    contagem: 14,
    variacao: "↗ +6",
    resumo:
      "A procura por garantia cresceu bastante nesta semana, quase sempre depois de seis meses de uso.",
    pedidos: [
      { texto: "Deu problema depois de 8 meses, tem garantia?", quando: "há 2 h" },
      { texto: "Descolou sozinho, vocês trocam?", quando: "ontem" },
      { texto: "Quanto tempo dura a garantia?", quando: "há 2 d" },
    ],
  },
  {
    titulo: "Convênio e reembolso",
    contagem: 9,
    variacao: "↗ +4",
    resumo:
      "Nove pessoas perguntaram se é coberto por convênio, e sete citaram o convênio da empresa onde trabalham.",
    pedidos: [
      { texto: "Vocês atendem o convênio da empresa?", quando: "ontem" },
      { texto: "Dá nota fiscal para pedir reembolso?", quando: "há 3 d" },
    ],
  },
  {
    titulo: "Preço do plano mais completo",
    contagem: 7,
    variacao: "igual",
    resumo:
      "O interesse no plano mais completo se manteve estável, e a maioria pede o valor antes de marcar.",
    pedidos: [
      { texto: "Quanto custa o mais simples?", quando: "há 6 h" },
      { texto: "O mais completo serve para qualquer caso?", quando: "há 4 d" },
    ],
  },
  {
    titulo: "Horário de sábado",
    contagem: 5,
    variacao: "↘ −2",
    resumo:
      "Menos gente perguntou o horário de sábado depois que a resposta automática passou a citar o horário.",
    pedidos: [
      { texto: "Abre sábado que horas?", quando: "há 2 d" },
      { texto: "Sábado vocês fecham ao meio-dia?", quando: "há 5 d" },
    ],
  },
  {
    titulo: "Troca e devolução",
    contagem: 4,
    variacao: "novo",
    resumo:
      "Assunto novo nesta semana: quatro pedidos de troca, três deles dentro dos 30 dias da compra.",
    pedidos: [
      { texto: "Comprei semana passada e queria outra cor", quando: "ontem" },
    ],
  },
];

export default function DesignPainelPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      {/* Sem cartão de página, igual à tela real: os cartões flutuam sobre o
          canvas (`Stat variant="elevado"`). */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <LayoutDashboard size={20} className="text-brand-ink" />
              <h1 className="text-titulo">Painel</h1>
            </div>
            <p className="text-apoio text-ink-2">
              O que a IA fez pela conta Ótica Vision.
            </p>
          </div>
        </div>

        {/* ⚠️ GRADE DE LINHAS COMPARTILHADAS, e não duas colunas independentes.
            Com duas colunas em `flex`, cada lado empilha por conta própria e o
            "A última resposta" caía onde sobrava, desalinhado do "Movimento". Na
            prancha os dois começam na MESMA linha.

            A grade resolve por construção: a coluna principal ocupa as linhas 1,
            2 e 3 (manchete, operação, movimento) e a trilha ocupa as linhas 1 e 2
            num bloco só (fila mais assuntos) e a linha 3 sozinha (o verbatim). O
            topo da linha 3 é o maior dos dois lados, então os dois cartões
            começam juntos, seja qual for a altura do conteúdo. */}
        {/* ⚠️ `xl:flex-1` mais `xl:min-h-0` NÃO é enfeite: é o que dá à grade
            uma altura DEFINIDA. Sem isso as linhas resolvem pela altura do
            conteúdo, a lista de assuntos volta a crescer sem limite e a rolagem
            interna dela não tem contra o que resolver. */}
        <div className="grid min-w-0 gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_auto_1fr]">
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">
            <ValorResumo
              resumo={MES}
              frases={frasesDeValor(MES, PERIODO)}
              periodo={PERIODO}
              acumulado={ACUMULADO}
              frasesAcumuladas={frasesDeValor(ACUMULADO, "desde o início")}
              parte="manchete"
              horas={HORAS}
              rotuloHorario="Segunda a sexta: 08:00 às 18:00"
            />
          </div>

          <div className="min-w-0 xl:col-start-1 xl:row-start-2">
            <PainelOperacaoBloco janelas={JANELAS} />
          </div>

          {/* ⚠️ NÃO EXISTE "o que mais ela fez" AQUI. A prancha da rodada 3
              termina a coluna no movimento, e as frases secundárias de valor não
              aparecem em lugar nenhum dela. */}
          <div className="min-w-0 [&>section]:h-full xl:col-start-1 xl:row-start-3">
            <PainelMovimento janelas={MOVIMENTO} />
          </div>

          {/* A trilha ocupa as duas primeiras linhas; os assuntos esticam para
              preencher, que é o que a prancha mostra. */}
          {/* ⚠️ `xl:h-0 xl:min-h-full` NÃO é gambiarra, é o conserto de um efeito
              real da grade: este bloco ATRAVESSA as linhas 1 e 2, e como as duas
              são `auto`, a grade somava a altura de CONTEÚDO dele (fila mais a
              lista inteira de assuntos) e distribuía a sobra nas duas linhas.
              O sintoma era um vão de 43px embaixo da manchete e outro embaixo da
              operação. Com `h-0` a contribuição intrínseca dele vira zero, quem
              dimensiona as linhas passa a ser só a coluna principal, e
              `min-h-full` devolve a altura das duas linhas para ele preencher. */}
          <div className="flex min-h-0 min-w-0 flex-col gap-5 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:h-0 xl:min-h-full">
            {/* Abaixo do limiar de aviso: o cartão neutro, como na prancha. */}
            <PainelFilaCartao
              quantas={3}
              esperaMs={12 * 60 * 1000}
              espera="há 12 minutos"
            />
            <PainelAssuntos
              itens={ASSUNTOS}
              periodo="7 dias"
              totalPerguntas={39}
            />
          </div>

          <div className="min-w-0 [&>section]:h-full xl:col-start-2 xl:row-start-3">
            <PainelUltimaResposta
              pergunta="Boa noite! Vocês cobram pela avaliação? E quanto tempo demora?"
              perguntaHora="21h34"
              latencia="9 segundos"
              foraDoHorario
              mensagens={[
                "Oi, Marcela! A avaliação com o time é sem custo e leva uns 20 minutos. Tenho horário amanhã às 10h ou às 15h30, qual fica melhor pra você?",
              ]}
              nome="Marcela A."
              quando="há 14 minutos"
              href="/inbox"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
