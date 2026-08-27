import { LayoutDashboard } from "lucide-react";
import NavRail from "@/components/NavRail";
import PainelOperacao, {
  type JanelaCalculada,
} from "@/components/PainelOperacao";
import {
  PainelEspera,
  PainelEscaladas,
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

const ESCALADAS = [
  {
    id: 1,
    quando: "há 2 horas",
    texto:
      "Pessoa perguntou se o pagamento pode ser parcelado e em quantas vezes.",
    guardrail: false,
    href: "/inbox",
  },
  {
    id: 2,
    quando: "há 5 horas",
    texto:
      "Resposta retida pelo guardrail: mencionou um valor (R$ 180) que não está na base.",
    guardrail: true,
    href: "/inbox",
  },
  {
    id: 3,
    quando: "há 1 dia",
    texto: "Pessoa quer remarcar o horário de sexta e perguntou por outro dia.",
    guardrail: false,
    href: "/inbox",
  },
];

export default function DesignPainelPage() {
  return (
    <div className="flex h-screen gap-3 bg-canvas p-3">
      <NavRail clientName="Ótica Vision" activeHref="/painel" role="dono" />
      {/* Sem cartão de página, igual à tela real: os cartões flutuam sobre o
          canvas (`Stat variant="elevado"`). */}
      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <LayoutDashboard size={20} className="text-brand-ink" />
            <h1 className="text-titulo">Painel</h1>
          </div>
          <p className="text-apoio text-ink-2">
            O que a IA fez pela conta Ótica Vision.
          </p>
        </div>

        <ValorResumo
          resumo={MES}
          frases={frasesDeValor(MES, PERIODO)}
          periodo={PERIODO}
          acumulado={ACUMULADO}
          frasesAcumuladas={frasesDeValor(ACUMULADO, "desde o início")}
          parte="manchete"
        />

        <section className="space-y-3">
          <h2 className="text-rotulo uppercase text-ink-3">
            O que preciso fazer agora
          </h2>
          <PainelEspera quantas={3} espera="há 6 horas" />
        </section>

        <PainelOperacao janelas={JANELAS} />

        <PainelEscaladas itens={ESCALADAS} />

        <section className="space-y-3">
          <h2 className="text-rotulo uppercase text-ink-3">O que isso me deu</h2>
          <ValorResumo
            resumo={MES}
            frases={frasesDeValor(MES, PERIODO)}
            periodo={PERIODO}
            acumulado={ACUMULADO}
            frasesAcumuladas={frasesDeValor(ACUMULADO, "desde o início")}
            parte="resto"
          />
          <PainelUltimaResposta
            texto="Oi, Marcelo! Trabalhamos de segunda a sexta, das 8h às 18h. Pode me dizer o que você precisa que eu já adianto pra você?"
            nome="Marcelo A."
            quando="há 14 minutos"
            href="/inbox"
          />
        </section>

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
              <StatTopo>
                <StatRotulo>Tempo de 1a resposta</StatRotulo>
                <span className="text-legenda text-ink-3">
                  primeira semana medida
                </span>
              </StatTopo>
              <StatValor>14s</StatValor>
              <StatFrase>Mediana, contando só as respostas da IA</StatFrase>
              <StatLegenda>3 atendimentos medidos, últimos 7 dias</StatLegenda>
            </Stat>

            <PainelEspera quantas={0} espera="" />
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
