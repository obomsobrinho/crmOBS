// Estado de assinatura do tenant: uma regra só, em módulo PURO.
//
// Sem imports, sem process.env, sem "server-only" (mesmo padrão de
// lib/agent-prompt.ts). É isso que permite o servidor usar no gate e o browser
// usar no aviso sem duas implementações que divergem com o tempo.
//
// Quem ESCREVE estas colunas é sempre service_role (webhook do gateway e rotas
// de cobrança): `clients` não tem grant de UPDATE para `authenticated`, então o
// browser não consegue se auto-liberar mesmo se alguém tentar pelo devtools.

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

/**
 * Dias de teste gratuito de uma conta nova.
 * PROVISÓRIO: o valor final é decisão de negócio (bloco de cobrança). Fica num
 * lugar só de propósito, para trocar sem caçar número mágico pelo código.
 */
export const TRIAL_DAYS = 7;

/** Avisa que o teste está acabando quando faltam estes dias ou menos. */
export const TRIAL_WARN_DAYS = 3;

/** Dias de carência quando o pagamento atrasa (Pix e boleto atrasam na PME). */
export const PAST_DUE_GRACE_DAYS = 5;

/** As colunas de assinatura de `clients` que a regra precisa. */
export interface BillingRow {
  subscription_status: string;
  trial_ends_at: string | null;
  grace_until: string | null;
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------
// Tabela de preços definida pelo dono do produto. Fica aqui, e não no banco,
// porque é regra de produto: muda junto com a tabela e precisa ser lida igual
// pelo servidor (limite de assento na hora de convidar) e pelo browser (tela de
// assinatura). O banco guarda só QUAL plano (`clients.billing_plan`).
//
// ⚠️ O QUE É APLICADO e o que é só definição comercial:
// - `seats` (atendentes): APLICADO. **O dono não conta** como atendente, então o
//   número contado é `billableSeats(total de membros)`.
// - `funnels`: NÃO aplicado. Hoje existe um funil por tenant (`pipeline_stages`
//   por `client_id`, sem tabela de funis).
// - `conversations`: NÃO aplicado. Exige medição de consumo (Fase 5).
// - `features.atribuicao`: NÃO aplicado ainda. A atribuição existe no produto
//   (Fase 1) mas não está travada por plano.
// - `features.relatorioAtendente`: NÃO existe no produto. O `/painel` mostra o
//   total da conta, não por atendente.
// - `features.suportePrioritario`: não é software, é compromisso de atendimento.
// - `numbers` é 1 em TODOS os planos de propósito: múltiplos números por conta
//   está na lista de não construir e é impossível na arquitetura atual
//   (`clients.evolution_instance` é coluna única e o n8n resolve o tenant por ela).

export type PlanKey = "essencial" | "profissional" | "avancado";

export interface PlanFeatures {
  /** Assumir e transferir conversa entre atendentes. */
  atribuicao: boolean;
  /** Métricas separadas por atendente no painel. */
  relatorioAtendente: boolean;
  /** Compromisso de suporte, não é software. */
  suportePrioritario: boolean;
}

export interface Plan {
  key: PlanKey;
  name: string;
  /** Preço mensal em reais. */
  priceBRL: number;
  /** Atendentes inclusos, SEM contar o dono. APLICADO. */
  seats: number;
  /** Números de WhatsApp. 1 em todos os planos. */
  numbers: number;
  /** Funis no Kanban. null = ilimitado. NÃO aplicado. */
  funnels: number | null;
  /** Conversas por mês inclusas. NÃO aplicado. */
  conversations: number;
  features: PlanFeatures;
}

export const PLANS: Record<PlanKey, Plan> = {
  essencial: {
    key: "essencial",
    name: "Essencial",
    priceBRL: 197,
    seats: 1,
    numbers: 1,
    funnels: 1,
    conversations: 400,
    features: {
      atribuicao: false,
      relatorioAtendente: false,
      suportePrioritario: false,
    },
  },
  profissional: {
    key: "profissional",
    name: "Profissional",
    priceBRL: 347,
    seats: 3,
    numbers: 1,
    funnels: 3,
    conversations: 1000,
    features: {
      atribuicao: true,
      relatorioAtendente: true,
      suportePrioritario: false,
    },
  },
  avancado: {
    key: "avancado",
    name: "Avançado",
    priceBRL: 597,
    seats: 6,
    numbers: 1,
    funnels: null,
    conversations: 3000,
    features: {
      atribuicao: true,
      relatorioAtendente: true,
      suportePrioritario: true,
    },
  },
};

// Adicionais, fora dos planos.
/** Atendente extra, do 1º ao 3º além do incluso. */
export const EXTRA_SEAT_BRL_UP_TO_3 = 67;
/** Atendente extra, do 4º além do incluso em diante (desconto por volume). */
export const EXTRA_SEAT_BRL_FROM_4 = 47;
/** Conversa que passa do incluído no mês. */
export const EXTRA_CONVERSATION_BRL = 0.25;
/** Plano anual: 2 meses grátis, sem fidelidade. */
export const ANNUAL_FREE_MONTHS = 2;

/** Quanto custam `n` atendentes extras por mês (a faixa muda no 4º). */
export function extraSeatsPriceBRL(n: number): number {
  if (n <= 0) return 0;
  const primeiros = Math.min(n, 3);
  const restantes = n - primeiros;
  return primeiros * EXTRA_SEAT_BRL_UP_TO_3 + restantes * EXTRA_SEAT_BRL_FROM_4;
}

/** Preço anual de um plano (12 meses menos os grátis). */
export function annualPriceBRL(plan: Plan): number {
  return plan.priceBRL * (12 - ANNUAL_FREE_MONTHS);
}

export const PLAN_ORDER: PlanKey[] = ["essencial", "profissional", "avancado"];

function isPlanKey(v: unknown): v is PlanKey {
  return v === "essencial" || v === "profissional" || v === "avancado";
}

/**
 * Plano assinado, ou null quando não existe plano escolhido.
 * null acontece em dois casos legítimos: teste gratuito e conta interna (os
 * tenants que existiam antes desta fase). Nesses casos NÃO inventamos um plano:
 * um valor plausível chutado aqui viraria um limite que ninguém contratou, e o
 * primeiro sintoma seria um convite legítimo levando erro.
 */
export function planFor(billingPlan: string | null | undefined): Plan | null {
  return isPlanKey(billingPlan) ? PLANS[billingPlan] : null;
}

/**
 * Atendentes contados para o plano a partir do total de membros do tenant.
 *
 * **O dono não conta.** É descontado 1, e não "todos com papel dono", de
 * propósito: se descontássemos por papel, convidar um segundo dono seria um
 * atendente de graça.
 */
export function billableSeats(totalMembers: number): number {
  return Math.max(0, totalMembers - 1);
}

export interface SeatState {
  /** Atendentes contados (o dono já está fora). */
  used: number;
  /** Inclusos no plano, ou null quando não existe plano (sem limite). */
  included: number | null;
  /** Quantos passam do incluído, ou seja, viram adicional pago. */
  extra: number;
  /** Quanto custam esses extras por mês. */
  extraCostBRL: number;
  /** Ainda cabe atendente dentro do que o plano inclui. */
  withinPlan: boolean;
  /** Frase pronta para explicar a situação. */
  message: string;
}

/**
 * Controle de atendente, o único limite de plano que o sistema aplica hoje.
 *
 * Passar do incluído NÃO é proibido: atendente extra é um adicional pago (ver
 * extraSeatsPriceBRL). Quem decide o que fazer com isso é o chamador: enquanto
 * não existe checkout, a rota de convite barra e diz o preço, porque cobrar o
 * adicional ainda é operação manual.
 *
 * Sem plano escolhido não existe limite: no teste a pessoa precisa poder chamar
 * o time para sentir o produto, e conta interna nunca contratou nada.
 *
 * Ao descer de plano NÃO removemos ninguém (tirar o acesso de alguém sem pedido
 * é pior): os que passam do incluído viram adicional e a tela avisa.
 */
export function seatState(plan: Plan | null, used: number): SeatState {
  if (!plan) {
    return {
      used,
      included: null,
      extra: 0,
      extraCostBRL: 0,
      withinPlan: true,
      message: `${used} ${plural(used, "atendente", "atendentes")} além do dono. O limite passa a valer quando você escolher um plano.`,
    };
  }

  const extra = Math.max(0, used - plan.seats);
  const extraCostBRL = extraSeatsPriceBRL(extra);
  const inclusos = `${plan.seats} ${plural(plan.seats, "atendente", "atendentes")}`;

  if (extra > 0) {
    return {
      used,
      included: plan.seats,
      extra,
      extraCostBRL,
      withinPlan: false,
      message: `Seu plano ${plan.name} inclui ${inclusos} além do dono, e a conta está com ${used}. ${extra} ${plural(
        extra,
        "atendente extra",
        "atendentes extras"
      )}, R$ ${extraCostBRL} por mês.`,
    };
  }

  return {
    used,
    included: plan.seats,
    extra: 0,
    extraCostBRL: 0,
    withinPlan: used < plan.seats,
    message:
      used < plan.seats
        ? `${used} de ${inclusos} do plano ${plan.name}, sem contar o dono.`
        : `Seu plano ${plan.name} já está com ${inclusos}, o total incluído. O próximo atendente é adicional, R$ ${EXTRA_SEAT_BRL_UP_TO_3} por mês.`,
  };
}

export type BlockReason = "trial_expired" | "past_due" | "canceled";

export interface AccessState {
  /** true = o app é bloqueado no servidor e a pessoa vai para /assinatura. */
  blocked: boolean;
  reason: BlockReason | null;
  /** Dias inteiros restantes do teste (só em trialing com data marcada). */
  trialDaysLeft: number | null;
  /** Aviso que NÃO bloqueia (teste acabando, atraso dentro da carência). */
  warn: string | null;
  /** Frase curta para mostrar à pessoa. */
  message: string;
}

const DAY_MS = 86_400_000;

const STATUS_LABELS: Record<string, string> = {
  trialing: "Teste gratuito",
  active: "Assinatura ativa",
  past_due: "Pagamento em atraso",
  canceled: "Assinatura cancelada",
};

/** Rótulo em pt-BR de um estado de assinatura. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "Estado desconhecido";
}

/** Data de fim do teste a partir de agora, em ISO (para gravar no banco). */
export function trialEndsAtFrom(now: Date, days: number = TRIAL_DAYS): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/** Fim da carência a partir de agora, em ISO. */
export function graceUntilFrom(
  now: Date,
  days: number = PAST_DUE_GRACE_DAYS
): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function plural(n: number, um: string, muitos: string): string {
  return n === 1 ? um : muitos;
}

/**
 * Decide se o tenant tem acesso ao app. Chamada no gate do servidor (layout
 * autenticado, /api/agent, /api/send) e também na UI para o aviso.
 */
export function accessState(row: BillingRow, now: Date = new Date()): AccessState {
  const t = now.getTime();
  const status = typeof row?.subscription_status === "string" ? row.subscription_status : "";
  const trialEnd = parse(row?.trial_ends_at);
  const grace = parse(row?.grace_until);

  if (status === "active") {
    return {
      blocked: false,
      reason: null,
      trialDaysLeft: null,
      warn: null,
      message: "Assinatura ativa.",
    };
  }

  if (status === "trialing") {
    // Sem data de fim = teste sem prazo (contas internas). Não bloqueia: dado
    // faltando nunca pode derrubar quem está atendendo.
    if (trialEnd === null) {
      return {
        blocked: false,
        reason: null,
        trialDaysLeft: null,
        warn: null,
        message: "Teste gratuito em andamento.",
      };
    }
    if (trialEnd <= t) {
      return {
        blocked: true,
        reason: "trial_expired",
        trialDaysLeft: 0,
        warn: null,
        message: "Seu teste gratuito terminou. Escolha um plano para voltar a atender.",
      };
    }
    const left = Math.ceil((trialEnd - t) / DAY_MS);
    return {
      blocked: false,
      reason: null,
      trialDaysLeft: left,
      warn:
        left <= TRIAL_WARN_DAYS
          ? `Seu teste gratuito termina em ${left} ${plural(left, "dia", "dias")}.`
          : null,
      message: `Teste gratuito: ${left} ${plural(left, "dia", "dias")} restantes.`,
    };
  }

  if (status === "past_due") {
    if (grace !== null && t < grace) {
      const left = Math.ceil((grace - t) / DAY_MS);
      return {
        blocked: false,
        reason: null,
        trialDaysLeft: null,
        warn: `Há um pagamento em atraso. Regularize em ${left} ${plural(
          left,
          "dia",
          "dias"
        )} para não perder o acesso.`,
        message: "Pagamento em atraso, acesso liberado durante a carência.",
      };
    }
    return {
      blocked: true,
      reason: "past_due",
      trialDaysLeft: null,
      warn: null,
      message:
        "Encontramos um pagamento em atraso. Regularize para voltar a usar o atendimento.",
    };
  }

  if (status === "canceled") {
    return {
      blocked: true,
      reason: "canceled",
      trialDaysLeft: null,
      warn: null,
      message: "Sua assinatura foi cancelada. Assine de novo para voltar a atender.",
    };
  }

  // Estado que este código não conhece. NÃO bloqueia, de propósito: o CHECK do
  // banco já garante o conjunto de valores, então cair aqui significa código
  // defasado, e derrubar o atendimento de quem paga é pior que liberar um dia
  // a mais. Fica o aviso para aparecer na tela de assinatura.
  return {
    blocked: false,
    reason: null,
    trialDaysLeft: null,
    warn: "Não conseguimos confirmar o estado da sua assinatura.",
    message: "Estado da assinatura desconhecido.",
  };
}
