import { LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import DashboardCards from "@/components/DashboardCards";
import ValorResumo from "@/components/ValorResumo";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { computeMetrics, weekCutoffISO, type WeekMsg } from "@/lib/metrics";
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

  const [
    { data: msgs },
    { data: quals },
    { data: mesMsgs },
    { data: mesQuals },
    { data: cfg },
  ] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("phone, user_message, bot_message, message_type, created_at")
      .gte("created_at", cutoff)
      .limit(5000),
    supabase
      .from("conversation_qualifications")
      .select("phone, created_at")
      .gte("created_at", cutoff)
      .limit(2000),
    supabase
      .from("chat_messages")
      .select("phone, user_message, bot_message, message_type, created_at")
      .gte("created_at", mes.inicioISO)
      .lt("created_at", mes.fimISO)
      .limit(20000),
    supabase
      .from("conversation_qualifications")
      .select("phone, action, created_at")
      .gte("created_at", mes.inicioISO)
      .lt("created_at", mes.fimISO)
      .limit(5000),
    // O horário de atendimento vive em agent_config (é configuração da empresa,
    // editada na tela do agente). Sem ele, o resumo omite o número de "fora do
    // horário" em vez de estimar.
    supabase
      .from("clients")
      .select("agent_config")
      .eq("id", client.id)
      .maybeSingle(),
  ]);

  const weekMsgs: WeekMsg[] = ((msgs ?? []) as {
    phone: string;
    user_message: string | null;
    bot_message: string | null;
    message_type: string | null;
    created_at: string;
  }[]).map((m) => ({
    phone: m.phone,
    hasUser: !!m.user_message,
    hasBot: !!m.bot_message,
    manual: m.message_type === "manual",
    created_at: m.created_at,
  }));

  const qualPhones = new Set(
    ((quals ?? []) as { phone: string }[]).map((q) => q.phone)
  );

  const metrics = computeMetrics(weekMsgs, qualPhones);

  const hours =
    (cfg?.agent_config as { hours?: BusinessHours } | null)?.hours ?? null;

  const resumo = resumoDeValor({
    msgs: (mesMsgs ?? []) as ValorMsg[],
    quals: (mesQuals ?? []) as ValorQual[],
    hours,
  });
  const periodo = rotuloDoMes(mes.ano, mes.mes);
  const frases = frasesDeValor(resumo, periodo);

  return (
    <div
      className={cn(
        cardVariants(),
        "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6"
      )}
    >
      <div>
        <div className="mb-1 flex items-center gap-2">
          <LayoutDashboard size={20} className="text-brand-ink" />
          <h1 className="text-titulo">Painel</h1>
        </div>
        <p className="text-apoio text-ink-2">
          O que a IA fez pela conta {client?.name ?? ""} e como está a semana.
        </p>
      </div>

      <ValorResumo resumo={resumo} frases={frases} periodo={periodo} />

      <section className="space-y-3">
        <h2 className="text-corpo font-semibold">
          Operação
          <span className="ml-2 text-legenda font-normal text-ink-3">
            últimos 7 dias
          </span>
        </h2>
        <DashboardCards metrics={metrics} />
      </section>
    </div>
  );
}
