import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accessState, type AccessState } from "@/lib/billing";
import { montagemState, type MontagemState } from "@/lib/onboarding";

export interface MyClient {
  id: string;
  name: string;
  evolution_instance: string | null;
  imported_at: string | null;
  /** Papel do usuário logado neste tenant: 'dono' | 'atendente' | null. */
  role: string | null;
  /** uid do usuário logado (útil para atribuição de conversa). */
  userId: string;
  /** Estado bruto da assinatura do tenant (colunas de `clients`). */
  subscriptionStatus: string;
  trialEndsAt: string | null;
  graceUntil: string | null;
  /** Plano assinado (null = ainda no teste). O plano em vigor sai de `planFor`. */
  billingPlan: string | null;
  /**
   * Acesso derivado por lib/billing.accessState. O gate do layout autenticado
   * usa `access.blocked`; a UI usa `access.warn` para avisar sem bloquear.
   */
  access: AccessState;
  /**
   * PRIMEIRA ativação do agente (null = nunca foi ao ar). NUNCA é limpo: é o
   * sinal que separa MONTAGEM de EDIÇÃO, ou seja, o assistente de `/montagem`
   * da tela de abas de `/agente`. Não confundir com `agentEnabled`.
   */
  agentPublishedAt: string | null;
  /**
   * Liga-desliga do agente (switch "Agente ativo"). A IA só responde com
   * `agentPublishedAt` preenchido E isto verdadeiro. Existe separado porque
   * desligar zerando `agentPublishedAt` jogaria a conta inteira de volta no
   * assistente de montagem, só porque alguém desligou a IA por uma hora.
   */
  agentEnabled: boolean;
  /** Progresso da montagem, derivado por lib/onboarding.montagemState. */
  montagem: MontagemState;
}

// Cliente (tenant) do usuário logado. A RLS já restringe `clients` ao(s)
// tenant(s) do usuário, então um simples select retorna o dele. Também resolve
// o papel do usuário nesse tenant (a policy de user_clients libera a própria
// linha), usado para gatear ações de dono (convidar/remover membro).
//
// MEMOIZADO POR REQUEST com `React.cache` (C5 do plano da demo, achado A1).
// Numa navegação do app isto rodava DUAS vezes em série (o layout do route
// group e a página), e cada execução são três viagens ao Supabase: getUser,
// clients, user_clients. Agora a segunda chamada no mesmo request devolve o
// resultado da primeira. Escopo por request, então um usuário nunca recebe o
// tenant do outro; e dentro de um request o tenant não muda, então o valor
// memoizado é sempre o atual.
export const getMyClient = cache(async function getMyClient(): Promise<MyClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // As colunas de assinatura e de montagem vêm no mesmo select (custo zero)
  // porque o gate e a linha de aviso rodam em toda navegação do app. Só
  // escalares: `persona` (9 KB na OBM) e `agent_config` ficam FORA de propósito.
  //
  // `clients` e `user_clients` saem JUNTOS: a segunda só precisa de `user.id`,
  // que já existe, e a policy de `user_clients` devolve só as linhas do próprio
  // usuário, então filtrar pelo tenant depois, em memória, dá o mesmo resultado
  // que filtrar no banco. Eram três viagens em série (getUser, clients,
  // user_clients); ficam duas.
  const [{ data }, { data: memberships }] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, evolution_instance, imported_at, subscription_status, trial_ends_at, grace_until, billing_plan, agent_config_updated_at, agent_published_at, agent_enabled, onboarding_tested_at"
      )
      .limit(1)
      .maybeSingle(),
    supabase.from("user_clients").select("client_id, role").eq("user_id", user.id),
  ]);
  if (!data) return null;

  const client = data as {
    id: string;
    name: string;
    evolution_instance: string | null;
    imported_at: string | null;
    subscription_status: string;
    trial_ends_at: string | null;
    grace_until: string | null;
    billing_plan: string | null;
    agent_config_updated_at: string | null;
    agent_published_at: string | null;
    agent_enabled: boolean | null;
    onboarding_tested_at: string | null;
  };

  const membership =
    (memberships as { client_id: string; role: string }[] | null)?.find(
      (m) => m.client_id === client.id
    ) ?? null;

  return {
    id: client.id,
    name: client.name,
    evolution_instance: client.evolution_instance,
    imported_at: client.imported_at,
    role: (membership as { role: string } | null)?.role ?? null,
    userId: user.id,
    subscriptionStatus: client.subscription_status,
    trialEndsAt: client.trial_ends_at,
    graceUntil: client.grace_until,
    billingPlan: client.billing_plan,
    access: accessState({
      subscription_status: client.subscription_status,
      trial_ends_at: client.trial_ends_at,
      grace_until: client.grace_until,
    }),
    agentPublishedAt: client.agent_published_at,
    // `!== false` e não `?? true`: a coluna é NOT NULL com default true, mas um
    // tenant lido antes da migration chegaria com undefined, e nesse caso ligado
    // é o comportamento que não derruba quem já estava atendendo.
    agentEnabled: client.agent_enabled !== false,
    montagem: montagemState({
      hasInstance: !!client.evolution_instance,
      agentConfigured: !!client.agent_config_updated_at,
      tested: !!client.onboarding_tested_at,
      published: !!client.agent_published_at,
    }),
  };
});

/**
 * Gate das páginas que só existem com a conta em dia (pipeline, painel, agente,
 * conhecimento, playground, equipe). Conta bloqueada continua vendo o `/inbox`
 * (as mensagens seguem chegando, como um WhatsApp Web aberto), mas o resto do
 * produto fecha.
 *
 * Fica em cada página, e não no layout do route group, porque um layout de
 * Server Component não conhece a rota atual: decidir ali exigiria adivinhar o
 * caminho, e um gate que adivinha é um gate que erra.
 */
export async function requireActiveTenant(): Promise<MyClient> {
  const client = await getMyClient();
  if (!client) redirect("/login");
  if (client.access.blocked) redirect("/assinatura");
  return client;
}
