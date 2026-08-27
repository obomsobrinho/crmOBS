import { LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import DashboardCards from "@/components/DashboardCards";
import DashboardBarras from "@/components/DashboardBarras";
import ValorResumo from "@/components/ValorResumo";
import {
  barrasPorDia,
  computeMetrics,
  weekCutoffISO,
  type WeekMsg,
} from "@/lib/metrics";
import {
  frasesDeValor,
  mesFechado,
  resumoDeValor,
  rotuloDoMes,
  type ValorMsg,
  type ValorQual,
} from "@/lib/valor";
import type { BusinessHours } from "@/lib/agent-prompt";

export const dynamic = "force-dynamic";

// Painel. Duas seções com perguntas diferentes:
//
// 1. "O que a IA fez por você" (valor percebido), no MÊS FECHADO. É a seção que
//    ataca o churn: o valor deste produto é invisível, porque a IA responde
//    dentro do WhatsApp e o dono vê tudo no celular de qualquer jeito. Mês
//    fechado e não mês corrente porque mês pela metade dá número que parece
//    pequeno e vende contra a gente.
// 2. Os 4 números de operação da SEMANA (DashboardCards), que já existiam.
//
// Tudo por RLS (tenant). O cálculo mora em módulos puros (lib/valor, lib/metrics).
export default async function PainelPage() {
  const client = await requireActiveTenant();
  const supabase = await createClient();
  const cutoff = weekCutoffISO();
  const mes = mesFechado();

  // As DUAS consultas de janela de 7 dias saíram (26/08/2026), e não foi por
  // estética: o acumulado abaixo traz as mesmas colunas e contém as mesmas
  // linhas, e recortar em memória é o padrão que o mês fechado já usava aqui.
  // Isso deu duas coisas de graça: o período ANTERIOR para o selo de variação
  // (sem consulta nova), e o conserto de um bug latente, porque a consulta de 7
  // dias fazia `.limit(5000)` SEM `order` e um tenant com mais de 5.000 mensagens
  // na semana recebia um subconjunto arbitrário, com os quatro números
  // subestimando em silêncio.
  const [{ data: todasMsgs }, { data: todasQuals }, { data: cfg }, espera] =
    await Promise.all([
    // Acumulado, SEM janela de data: é o "tudo que a IA já fez nesta conta", e é
    // ele que trava a mão de quem ia cancelar. O mês fechado é recortado deste
    // conjunto em memória, mais abaixo, em vez de virar duas consultas próprias:
    // o acumulado já contém o mês, e pedir as mesmas linhas duas vezes só
    // dobraria o custo da página. Teto de linhas porque um tenant com um ano de
    // operação tem dezenas de milhares; quando o teto doer, o caminho é uma
    // tabela de agregado mensal (mesmo teto e mesmo motivo de /assinatura).
    supabase
      .from("chat_messages")
      .select("phone, user_message, bot_message, message_type, created_at")
      .order("created_at", { ascending: false })
      .limit(20000),
    supabase
      .from("conversation_qualifications")
      .select("phone, action, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    // O horário de atendimento vive em agent_config (é configuração da empresa,
    // editada na tela do agente). Sem ele, o resumo omite o número de "fora do
    // horário" em vez de estimar.
    supabase
      .from("clients")
      .select("agent_config")
      .eq("id", client.id)
      .maybeSingle(),
    // Conversas com handoff em aberto AGORA. `head: true` = só a contagem, sem
    // trazer linha nenhuma. É o único número acionável do painel, e por isso é o
    // único que vale uma consulta própria.
    supabase
      .from("conversations")
      .select("phone", { count: "exact", head: true })
      .not("handoff_at", "is", null),
  ]);

  const hours =
    (cfg?.agent_config as { hours?: BusinessHours } | null)?.hours ?? null;

  const acumuladoMsgs = (todasMsgs ?? []) as ValorMsg[];
  const acumuladoQuals = (todasQuals ?? []) as ValorQual[];

  // ── Janelas de 7 dias, recortadas do acumulado ──────────────────────────────
  //
  // `cutoffAnterior` = 14 dias atrás. A janela anterior é [-14d, -7d).
  const cutoffMs = Date.parse(cutoff);
  const cutoffAnteriorMs = cutoffMs - 7 * 24 * 60 * 60 * 1000;

  const paraWeekMsg = (m: ValorMsg): WeekMsg => ({
    phone: m.phone,
    hasUser: !!m.user_message,
    hasBot: !!m.bot_message,
    manual: m.message_type === "manual",
    created_at: m.created_at,
  });

  const naJanela = (iso: string, de: number, ate: number) => {
    const t = Date.parse(iso);
    return t >= de && t < ate;
  };
  // "Agora" derivado do cutoff, e não de `Date.now()` aqui: chamada impura no
  // corpo de um Server Component é erro de lint (`react-hooks/purity`), e é a
  // mesma razão pela qual `weekCutoffISO` encapsula o relógio.
  const agoraMs = cutoffMs + 7 * 24 * 60 * 60 * 1000;

  const metrics = computeMetrics(
    acumuladoMsgs
      .filter((m) => naJanela(m.created_at, cutoffMs, Infinity))
      .map(paraWeekMsg),
    new Set(
      acumuladoQuals
        .filter((q) => naJanela(q.created_at, cutoffMs, Infinity))
        .map((q) => q.phone)
    )
  );

  // ⚠️ GUARDA DE TRUNCAMENTO. O acumulado tem teto de 20.000 linhas, ordenado do
  // mais novo para o mais velho. Se ele bateu no teto E a linha mais antiga que
  // veio já é mais nova que 14 dias, a janela anterior está INCOMPLETA, e um selo
  // calculado sobre janela incompleta mostraria variação inventada. Nesse caso o
  // período anterior vira `null` e nenhum cartão mostra selo, que é a única saída
  // honesta.
  const maisAntiga = acumuladoMsgs[acumuladoMsgs.length - 1]?.created_at;
  const truncado =
    acumuladoMsgs.length >= 20000 &&
    (!maisAntiga || Date.parse(maisAntiga) > cutoffAnteriorMs);

  const metricsAnterior = truncado
    ? null
    : computeMetrics(
        acumuladoMsgs
          .filter((m) => naJanela(m.created_at, cutoffAnteriorMs, cutoffMs))
          .map(paraWeekMsg),
        new Set(
          acumuladoQuals
            .filter((q) => naJanela(q.created_at, cutoffAnteriorMs, cutoffMs))
            .map((q) => q.phone)
        )
      );

  const barras = barrasPorDia(acumuladoMsgs, 14, agoraMs);
  const esperando = espera.error ? null : (espera.count ?? 0);

  // Recorte do mês fechado a partir do acumulado. Comparação por instante
  // (Date.parse) e não por string: o banco devolve "…+00:00" e mesFechado gera
  // "…Z", e comparar esses dois como texto erra exatamente na linha da fronteira.
  const inicioMs = Date.parse(mes.inicioISO);
  const fimMs = Date.parse(mes.fimISO);
  const noMes = (iso: string) => {
    const t = Date.parse(iso);
    return t >= inicioMs && t < fimMs;
  };

  const resumo = resumoDeValor({
    msgs: acumuladoMsgs.filter((m) => noMes(m.created_at)),
    quals: acumuladoQuals.filter((q) => noMes(q.created_at)),
    hours,
  });
  const periodo = rotuloDoMes(mes.ano, mes.mes);
  const frases = frasesDeValor(resumo, periodo);

  const acumulado = resumoDeValor({
    msgs: acumuladoMsgs,
    quals: acumuladoQuals,
    hours,
  });
  const frasesAcumuladas = frasesDeValor(acumulado, "desde o início");

  // ⚠️ O painel NÃO é mais um cartão branco: é página sobre o canvas, com os
  // cartões flutuando (`Stat variant="elevado"`). Isso é o que reproduz a
  // referência aprovada pelo dono nos DOIS temas, e é obrigatório no claro por um
  // motivo de token: `--s-bloco` claro é `#f3f3f6`, exatamente igual ao
  // `--canvas`, então cartão `bloco` dentro de cartão branco ficava um degrau
  // ABAIXO da casca, ou seja, o inverso da referência.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <LayoutDashboard size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Painel</h1>
        </div>
        <p className="text-apoio text-ink-2">
          O que a IA fez pela conta {client?.name ?? ""} e como está a semana.
        </p>
      </div>

      <ValorResumo
        resumo={resumo}
        frases={frases}
        periodo={periodo}
        acumulado={acumulado}
        frasesAcumuladas={frasesAcumuladas}
      />

      {/* O `h2` "Operação · últimos 7 dias" saiu: o período agora está DENTRO de
          cada cartão, que é o único lugar onde ele não pode ser lido como sendo
          de outro número. */}
      <DashboardCards
        metrics={metrics}
        anterior={metricsAnterior}
        esperando={esperando}
      />

      <DashboardBarras dias={barras} />
    </div>
  );
}
