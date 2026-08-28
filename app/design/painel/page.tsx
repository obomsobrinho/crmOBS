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
  PainelFilaLinha,
  PainelAssuntos,
  PainelUltimaResposta,
} from "@/components/PainelBlocos";
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
import {
  Stat,
  StatTopo,
  StatRotulo,
  StatValor,
  StatFrase,
  StatLegenda,
} from "@/components/ui/stat";

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

export default function DesignPainelPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      {/* Sem cartão de página, igual à tela real: os cartões flutuam sobre o
          canvas (`Stat variant="elevado"`). */}
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        {/* A fila fica AO LADO do título, e não empurrada para a borda oposta
            da tela. Ver o comentário na tela real. */}
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
          {/* Acima do limiar de aviso, para o preview mostrar o estado âmbar. */}
          <PainelFilaLinha
            quantas={3}
            esperaMs={6 * 60 * 60 * 1000}
            espera="há 6 horas"
          />
        </div>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
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

            <PainelOperacaoBloco janelas={JANELAS} />

            <PainelMovimento janelas={MOVIMENTO} />

            <section className="space-y-3">
              <h2 className="text-rotulo uppercase text-ink-3">
                O que mais ela fez
              </h2>
              <ValorResumo
                resumo={MES}
                frases={frasesDeValor(MES, PERIODO)}
                periodo={PERIODO}
                acumulado={ACUMULADO}
                frasesAcumuladas={frasesDeValor(ACUMULADO, "desde o início")}
                parte="resto"
              />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <PainelAssuntos />
            <PainelUltimaResposta
              mensagens={[
                "Oi! Trabalhamos de segunda a sexta, das 8h às 18h.",
                "Pode me dizer o que você precisa que eu já adianto pra você?",
              ]}
              nome="Marcelo A."
              quando="há 14 minutos"
              href="/inbox"
              sozinha
            />
          </div>
        </div>

        {/* ── ESTADOS FINOS ────────────────────────────────────────────────
            Não faz parte da tela. Existe para o preview provar, sem dado real,
            que conta nova não vê parede de zeros nem número inventado. */}
        <section className="space-y-3">
          <h2 className="text-rotulo uppercase text-ink-3">
            Estados finos (não faz parte da tela)
          </h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Stat variant="vazio" tamanho="manchete">
              <StatTopo>
                <StatRotulo>Conta nova, dia 1</StatRotulo>
              </StatTopo>
              <StatFrase tamanho="manchete">
                O agente entrou no ar hoje. Assim que a primeira pessoa escrever,
                o resumo aparece aqui.
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

            {/* Fila zerada e fila neutra (abaixo do limiar de aviso). */}
            <div className="flex flex-col justify-center gap-3">
              <PainelFilaLinha quantas={0} esperaMs={null} espera="" />
              <PainelFilaLinha
                quantas={2}
                esperaMs={12 * 60 * 1000}
                espera="há 12 minutos"
              />
            </div>
          </div>

          {/* Antes e depois: só apareceria se o histórico importado sustentasse.
              Medido em 27/08/2026, ele NÃO sustenta (50 dos 52 contatos vieram
              com uma única mensagem, e a Evolution devolve `total: 1` por
              conversa), então na tela real este bloco não existe. Fica aqui como
              registro do desenho, para não ser redescoberto do zero. */}
          <Stat variant="vazio" tamanho="manchete">
            <StatTopo>
              <StatRotulo>
                Antes e depois (não existe na tela: sem dado que sustente)
              </StatRotulo>
            </StatTopo>
            <StatFrase tamanho="manchete">
              Antes, quem te escrevia esperava 3h20 por uma resposta. Hoje espera
              18 segundos.
            </StatFrase>
            <StatLegenda>
              Depende de um histórico importado que o WhatsApp não entrega hoje.
            </StatLegenda>
          </Stat>
        </section>
      </div>
    </div>
  );
}
