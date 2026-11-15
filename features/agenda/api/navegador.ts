import { createClient } from "@/lib/supabase/client";
import { foraDaLista } from "@/lib/inbox-lista";
import { horarioCadastrado } from "@/lib/horarios";
import { inicioDoDiaSP } from "@/lib/fuso";
import { normalizarConfigDaAgenda, type AgendaConfig, type ServicoDaAgenda } from "@/lib/agenda";
import type { BusinessHours } from "@/lib/agent-prompt";
import { fonteDoBancoAgenda, type FonteAgenda } from "./fonte";

/** A fonte da Agenda no navegador (RLS), deixando de fora o número de avisos na busca de contatos. */
export function fonteDaAgendaDoNavegador(clientId: string, numeroAvisos: string | null): FonteAgenda {
  return fonteDoBancoAgenda(createClient(), clientId, foraDaLista(numeroAvisos));
}

export interface AberturaDaAgenda {
  /** null = sem agenda legível (tabela ausente, migration não aplicada, leitura recusada). */
  agenda: { config: AgendaConfig; servicos: ServicoDaAgenda[] } | null;
  horarioAtendimento: BusinessHours | null;
  disponivel: boolean;
  itens: Awaited<ReturnType<FonteAgenda["semana"]>>;
  bloqueios: Awaited<ReturnType<FonteAgenda["bloqueios"]>>;
}

const SEMANA_MS = 7 * 86_400_000;

/**
 * O que a página da Agenda lia no servidor até o passo 3b (docs/plano-dados-e-estado.md),
 * agora do navegador: configuração e serviços (a MESMA consulta de `agendaDoTenant`,
 * `lib/agenda-servidor.ts`, que é só do servidor: mudar uma é mudar a outra), o horário
 * de atendimento (só `hours` do `agent_config`) e a semana, tudo em paralelo. Uma falha
 * na semana deixa a agenda "indisponível", como antes.
 */
export async function aberturaDaAgenda(clientId: string, numeroAvisos: string | null, semana: string): Promise<AberturaDaAgenda> {
  const supabase = createClient();
  const fonte = fonteDaAgendaDoNavegador(clientId, numeroAvisos);
  const de = inicioDoDiaSP(semana);
  const [cR, sR, semanaLida] = await Promise.all([
    supabase
      .from("clients")
      .select("agenda_config, hours:agent_config->hours, hoursConfirmed:agent_config->hoursConfirmed")
      .eq("id", clientId)
      .maybeSingle(),
    supabase
      .from("agenda_servicos")
      .select("id, nome, duracao_min")
      .eq("client_id", clientId)
      .eq("ativo", true)
      .order("ordem")
      .order("id")
      .limit(50),
    Promise.all([fonte.semana(de, de + SEMANA_MS), fonte.bloqueios(de, de + SEMANA_MS)]).catch((e: unknown) => ({ erro: e })),
  ]);
  const agenda =
    cR.error || sR.error
      ? null
      : {
          config: normalizarConfigDaAgenda(cR.data?.agenda_config ?? null),
          servicos: (sR.data ?? []).map((x) => ({ id: x.id, nome: x.nome, duracaoMin: x.duracao_min })),
        };
  const horarioAtendimento = horarioCadastrado(cR.data ? { hours: cR.data.hours, hoursConfirmed: cR.data.hoursConfirmed } : null);
  if (!agenda || "erro" in semanaLida) {
    if (agenda && "erro" in semanaLida) console.error("agenda indisponível:", semanaLida.erro);
    return { agenda, horarioAtendimento, disponivel: false, itens: [], bloqueios: [] };
  }
  const [itens, bloqueios] = semanaLida;
  return { agenda, horarioAtendimento, disponivel: true, itens, bloqueios };
}
