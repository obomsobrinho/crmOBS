import { LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import PainelOperacao, {
  type JanelaCalculada,
} from "@/components/PainelOperacao";
import {
  PainelEspera,
  PainelEscaladas,
  PainelUltimaResposta,
  type Escalada,
} from "@/components/PainelBlocos";
import ValorResumo from "@/components/ValorResumo";
import {
  barras,
  computeMetrics,
  esperaLegivel,
  primeirasMensagens,
  type JanelaMsg,
} from "@/lib/metrics";
import {
  agoraMs,
  instanteMaisAntigoNecessario,
  limites,
  naJanela,
  ORDEM_PERIODOS,
  PERIODOS,
  type PeriodoKey,
} from "@/lib/periodo";
import { cleanName } from "@/lib/inbox";
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

/** Teto de linhas do acumulado. Ver a guarda de truncamento mais abaixo. */
const TETO = 20000;
/** Quantos pedidos escalados a lista mostra. */
const ESCALADAS = 5;

// Painel. Quatro perguntas, nesta ordem de leitura:
//
// 1. O que a IA fez por você (manchete de dependência, mês fechado + acumulado)
// 2. O que preciso fazer agora (a fila, o único número acionável)
// 3. A IA está dando conta? (três cartões, seguem o seletor de período)
// 4. O que a IA passou para você (escaladas, viram convite a ensinar o agente)
// 5. O que isso me deu (o resto das frases de valor + a última resposta real)
// 6. Está crescendo? (pessoas novas + gráfico, seguem o seletor)
//
// Tudo por RLS (tenant). O cálculo mora em módulos puros (lib/valor, lib/metrics,
// lib/periodo, lib/delta, lib/mensagem), então servidor e browser leem a MESMA
// regra e a página não tem opinião própria sobre número nenhum.
export default async function PainelPage() {
  const client = await requireActiveTenant();
  const supabase = await createClient();
  const mes = mesFechado();

  const [
    { data: todasMsgs },
    { data: todasQuals },
    { data: cfg },
    espera,
    { data: ultima },
  ] = await Promise.all([
    // Acumulado, SEM janela de data: é o "tudo que a IA já fez nesta conta", e é
    // ele que trava a mão de quem ia cancelar. As quatro janelas de período e o
    // mês fechado são recortados DELE em memória, em vez de virarem consultas
    // próprias: o acumulado já contém todas, e pedir as mesmas linhas cinco
    // vezes só multiplicaria o custo da página.
    //
    // ⚠️ NUNCA `.limit()` sem `order`. Uma versão anterior fazia exatamente isso
    // numa consulta de 7 dias, e um tenant com mais de 5.000 mensagens na semana
    // recebia um subconjunto arbitrário, com os quatro números subestimando em
    // silêncio. Quando o teto doer de verdade, o caminho é uma tabela de
    // agregado mensal.
    supabase
      .from("chat_messages")
      .select("phone, user_message, bot_message, message_type, created_at")
      .order("created_at", { ascending: false })
      .limit(TETO),
    supabase
      .from("conversation_qualifications")
      .select("id, phone, action, summary, created_at")
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
    // Conversas com handoff em aberto AGORA, e a mais antiga delas. É o único
    // número acionável do painel, e por isso o único que vale consulta própria.
    // A ordenação usa o índice parcial que já existe em (client_id, handoff_at).
    supabase
      .from("conversations")
      .select("phone, handoff_at", { count: "exact" })
      .not("handoff_at", "is", null)
      .order("handoff_at", { ascending: true })
      .limit(1),
    // A última resposta que a IA de fato mandou. Consulta própria e minúscula
    // porque precisa do nome do contato, que o acumulado não traz.
    supabase
      .from("chat_messages")
      .select("phone, nomewpp, bot_message, created_at")
      .not("bot_message", "is", null)
      .not("message_type", "in", '("manual","imported")')
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const hours =
    (cfg?.agent_config as { hours?: BusinessHours } | null)?.hours ?? null;

  const acumuladoMsgs = (todasMsgs ?? []) as ValorMsg[];
  const acumuladoQuals = (todasQuals ?? []) as (ValorQual & {
    id: number;
    summary: string | null;
  })[];

  // O relógio vem de `lib/periodo`, e não de `Date.now()` escrito aqui:
  // chamada impura no corpo de um Server Component é erro de lint
  // (`react-hooks/purity`).
  const agora = agoraMs();

  // ── As quatro janelas ───────────────────────────────────────────────────────
  //
  // ⚠️ GUARDA DE TRUNCAMENTO. O acumulado tem teto de linhas, ordenado do mais
  // novo para o mais velho. Se ele bateu no teto E a linha mais antiga que veio
  // já é mais nova do que o começo da janela ANTERIOR mais longa (60 dias, do
  // período "mês"), essa janela está INCOMPLETA, e um selo calculado sobre
  // janela incompleta mostraria variação inventada. Nesse caso o período
  // anterior vira `null` e nenhum cartão mostra selo, que é a única saída
  // honesta. A regra é a mesma de antes, só que agora parametrizada pelo maior
  // período em vez de fixa em 14 dias.
  const maisAntiga = acumuladoMsgs[acumuladoMsgs.length - 1]?.created_at;
  const truncado =
    acumuladoMsgs.length >= TETO &&
    (!maisAntiga ||
      Date.parse(maisAntiga) > instanteMaisAntigoNecessario(agora));

  const primeiras = primeirasMensagens(acumuladoMsgs as JanelaMsg[]);

  const recorte = (de: number, ate: number) => ({
    msgs: (acumuladoMsgs as JanelaMsg[]).filter((m) =>
      naJanela(Date.parse(m.created_at), de, ate)
    ),
    quals: acumuladoQuals.filter((q) =>
      naJanela(Date.parse(q.created_at), de, ate)
    ),
  });

  const janelas = Object.fromEntries(
    ORDEM_PERIODOS.map((k) => {
      const p = PERIODOS[k];
      const lim = limites(p, agora);
      const atual = recorte(lim.de, lim.ate);
      const ant = recorte(lim.anteriorDe, lim.anteriorAte);
      const janela: JanelaCalculada = {
        key: k,
        metrics: computeMetrics({
          ...atual,
          primeiras,
          de: lim.de,
          ate: lim.ate,
        }),
        anterior: truncado
          ? null
          : computeMetrics({
              ...ant,
              primeiras,
              de: lim.anteriorDe,
              ate: lim.anteriorAte,
            }),
        barras: barras(atual.msgs, p.dias, agora),
      };
      return [k, janela];
    })
  ) as Record<PeriodoKey, JanelaCalculada>;

  // ── A fila ─────────────────────────────────────────────────────────────────
  const esperando = espera.error ? null : (espera.count ?? 0);
  const maisVelha = espera.data?.[0]?.handoff_at as string | null | undefined;
  const esperaTexto = maisVelha ? esperaLegivel(maisVelha, agora) : "";

  // ── O que a IA passou para você ────────────────────────────────────────────
  //
  // Não segue o seletor de período de propósito: é uma lista de pendências, e
  // uma lista que esvazia quando a pessoa clica em "Dia" pareceria defeito.
  const escaladas: Escalada[] = acumuladoQuals
    .filter((q) => q.action === "pausar" && !!q.summary)
    .slice(0, ESCALADAS)
    .map((q) => ({
      id: q.id,
      quando: esperaLegivel(q.created_at, agora),
      texto: q.summary as string,
      guardrail: (q.summary as string).startsWith(
        "Resposta retida pelo guardrail"
      ),
      href: `/inbox/${encodeURIComponent(q.phone)}`,
    }));

  // ── A última resposta da IA ────────────────────────────────────────────────
  const ultimaLinha = ultima?.[0] as
    | {
        phone: string;
        nomewpp: string | null;
        bot_message: string;
        created_at: string;
      }
    | undefined;

  // ── Manchete: mês fechado, recortado do acumulado ──────────────────────────
  //
  // Comparação por instante (Date.parse) e não por string: o banco devolve
  // "…+00:00" e mesFechado gera "…Z", e comparar esses dois como texto erra
  // exatamente na linha da fronteira.
  const inicioMs = Date.parse(mes.inicioISO);
  const fimMs = Date.parse(mes.fimISO);
  const noMes = (iso: string) => naJanela(Date.parse(iso), inicioMs, fimMs);

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

  // O resto das frases (tudo menos a manchete) desce para "o que isso me deu".
  // `frasesDeValor` já devolve em ordem de força.
  const restoDasFrases = (frases.length > 0 ? frases : frasesAcumuladas).slice(1);

  // ⚠️ O painel NÃO é um cartão branco: é página sobre o canvas, com os cartões
  // flutuando (`Stat variant="elevado"`). É obrigatório no claro por um motivo
  // de token: `--s-bloco` claro é `#f3f3f6`, exatamente igual ao `--canvas`,
  // então cartão `bloco` dentro de cartão branco ficaria um degrau ABAIXO da
  // casca, ou seja, o inverso da referência aprovada.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <LayoutDashboard size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Painel</h1>
        </div>
        <p className="text-apoio text-ink-2">
          O que a IA fez pela conta {client?.name ?? ""}.
        </p>
      </div>

      <ValorResumo
        resumo={resumo}
        frases={frases}
        periodo={periodo}
        acumulado={acumulado}
        frasesAcumuladas={frasesAcumuladas}
        parte="manchete"
      />

      <section className="space-y-3">
        <h2 className="text-rotulo uppercase text-ink-3">
          O que preciso fazer agora
        </h2>
        <PainelEspera quantas={esperando} espera={esperaTexto} />
      </section>

      <PainelOperacao janelas={janelas} />

      <PainelEscaladas itens={escaladas} />

      {(restoDasFrases.length > 0 || ultimaLinha) && (
        <section className="space-y-3">
          <h2 className="text-rotulo uppercase text-ink-3">O que isso me deu</h2>
          <ValorResumo
            resumo={resumo}
            frases={frases}
            periodo={periodo}
            acumulado={acumulado}
            frasesAcumuladas={frasesAcumuladas}
            parte="resto"
          />
          {ultimaLinha && (
            <PainelUltimaResposta
              texto={ultimaLinha.bot_message}
              nome={cleanName(ultimaLinha.nomewpp) ?? "um contato"}
              quando={esperaLegivel(ultimaLinha.created_at, agora)}
              href={`/inbox/${encodeURIComponent(ultimaLinha.phone)}`}
            />
          )}
        </section>
      )}
    </div>
  );
}
