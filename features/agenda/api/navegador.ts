import { createClient } from "@/lib/supabase/client";
import { foraDaLista } from "@/lib/inbox-lista";
import { horarioCadastrado } from "@/lib/horarios";
import { inicioDoDiaSP } from "@/lib/fuso";
import { lerAgendaDoTenant, type AgendaDoTenant } from "@/lib/agenda-leitura";
import type { BusinessHours } from "@/lib/agent-prompt";
import { fonteDoBancoAgenda, type FonteAgenda } from "./fonte";

/** A fonte da Agenda no navegador (RLS), deixando de fora o número de avisos na busca de contatos. */
export function fonteDaAgendaDoNavegador(clientId: string, numeroAvisos: string | null): FonteAgenda {
  return fonteDoBancoAgenda(createClient(), clientId, foraDaLista(numeroAvisos));
}

export interface AberturaDaAgenda {
  /** null = sem agenda legível (tabela ausente, migration não aplicada, leitura recusada). */
  agenda: AgendaDoTenant | null;
  horarioAtendimento: BusinessHours | null;
  disponivel: boolean;
  itens: Awaited<ReturnType<FonteAgenda["semana"]>>;
  bloqueios: Awaited<ReturnType<FonteAgenda["bloqueios"]>>;
}

const SEMANA_MS = 7 * 86_400_000;

/**
 * O que a página da Agenda lia no servidor até o passo 3b (docs/plano-dados-e-estado.md),
 * agora do navegador: configuração e serviços (`lerAgendaDoTenant`, a mesma consulta do
 * servidor), o horário
 * de atendimento (só `hours` do `agent_config`) e a semana, tudo em paralelo. Uma falha
 * na semana deixa a agenda "indisponível", como antes.
 */
export async function aberturaDaAgenda(clientId: string, numeroAvisos: string | null, semana: string): Promise<AberturaDaAgenda> {
  const supabase = createClient();
  const fonte = fonteDaAgendaDoNavegador(clientId, numeroAvisos);
  const de = inicioDoDiaSP(semana);
  const [agenda, cR, semanaLida] = await Promise.all([
    lerAgendaDoTenant(supabase, clientId),
    supabase.from("clients").select("hours:agent_config->hours, hoursConfirmed:agent_config->hoursConfirmed").eq("id", clientId).maybeSingle(),
    Promise.all([fonte.semana(de, de + SEMANA_MS), fonte.bloqueios(de, de + SEMANA_MS)]).catch((e: unknown) => ({ erro: e })),
  ]);
  const horarioAtendimento = horarioCadastrado(cR.data ? { hours: cR.data.hours, hoursConfirmed: cR.data.hoursConfirmed } : null);
  if (!agenda || "erro" in semanaLida) {
    if (agenda && "erro" in semanaLida) console.error("agenda indisponível:", semanaLida.erro);
    return { agenda, horarioAtendimento, disponivel: false, itens: [], bloqueios: [] };
  }
  const [itens, bloqueios] = semanaLida;
  return { agenda, horarioAtendimento, disponivel: true, itens, bloqueios };
}
