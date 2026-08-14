import { LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import DashboardCards from "@/components/DashboardCards";
import { computeMetrics, weekCutoffISO, type WeekMsg } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// Painel (dashboard mínimo). Leitura por RLS (tenant). Janela de 7 dias.
// Calcula tudo a partir das mensagens da semana (chat_messages) + as
// qualificações da semana (conversation_qualifications).
export default async function PainelPage() {
  const client = await requireActiveTenant();
  const supabase = await createClient();
  const cutoff = weekCutoffISO();

  const [{ data: msgs }, { data: quals }] = await Promise.all([
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

  return (
    <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <LayoutDashboard size={20} className="text-accent" />
        <h1 className="font-display text-xl font-bold">Painel</h1>
      </div>
      <p className="mb-5 text-sm text-ink-muted">
        Um resumo da conta {client?.name ?? ""} nos últimos 7 dias.
      </p>
      <DashboardCards metrics={metrics} />
    </div>
  );
}
