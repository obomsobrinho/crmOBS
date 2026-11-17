import type { Supa } from "@/lib/supabase/tipos";
import { normalizarConfigDaAgenda, type AgendaConfig, type ServicoDaAgenda } from "@/lib/agenda";

export interface AgendaDoTenant {
  config: AgendaConfig;
  servicos: ServicoDaAgenda[];
}

/**
 * Config e serviços ativos da agenda de UMA empresa, ou null quando não há agenda (ou a
 * tabela não existe, ou a leitura foi recusada). UMA consulta para o servidor
 * (`agendaDoTenant`, com service_role) e o navegador (a tela da Agenda, pelo RLS:
 * `clients` e `agenda_servicos` têm leitura do tenant), para as duas nunca divergirem.
 */
export async function lerAgendaDoTenant(supabase: Supa, clientId: string): Promise<AgendaDoTenant | null> {
  try {
    const [{ data: c, error: cErr }, { data: s, error: sErr }] = await Promise.all([
      supabase.from("clients").select("agenda_config").eq("id", clientId).maybeSingle(),
      supabase
        .from("agenda_servicos")
        .select("id, nome, duracao_min")
        .eq("client_id", clientId)
        .eq("ativo", true)
        .order("ordem")
        .order("id")
        .limit(50),
    ]);
    if (cErr || sErr) return null;
    return {
      config: normalizarConfigDaAgenda(c?.agenda_config ?? null),
      servicos: (s ?? []).map((x) => ({ id: x.id, nome: x.nome, duracaoMin: x.duracao_min })),
    };
  } catch {
    return null;
  }
}
