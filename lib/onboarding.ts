// Progresso do onboarding guiado: uma regra só, em módulo PURO (sem imports,
// como lib/billing.ts e lib/agent-prompt.ts). Servidor calcula, browser desenha,
// /design renderiza sem banco.
//
// Os 4 passos reaproveitam telas que já existem. O onboarding não é um wizard
// paralelo: é um trilho por cima do produto.

export type StepKey = "conectar" | "configurar" | "testar" | "publicar";

export interface OnboardingInput {
  /** clients.evolution_instance preenchida. */
  hasInstance: boolean;
  /** clients.agent_config_updated_at preenchida (salvou o agente em algum modo). */
  agentConfigured: boolean;
  /** clients.onboarding_tested_at preenchida (mandou pelo menos 1 msg no playground). */
  tested: boolean;
  /** clients.agent_published_at preenchida. */
  published: boolean;
}

export interface OnboardingStep {
  key: StepKey;
  label: string;
  hint: string;
  href: string;
  cta: string;
  done: boolean;
  /** Só libera quando os passos anteriores estão prontos. */
  enabled: boolean;
}

export interface OnboardingState {
  steps: OnboardingStep[];
  done: number;
  total: number;
  /**
   * Publicar é o passo final e só é possível com os anteriores prontos, então
   * publicado = onboarding concluído. É o que faz a barra desaparecer para os
   * tenants que já estavam no ar antes desta fase existir.
   */
  complete: boolean;
  /** Próximo passo a fazer (null quando concluído). */
  next: OnboardingStep | null;
}

interface StepDef {
  key: StepKey;
  label: string;
  hint: string;
  href: string;
  cta: string;
}

const DEFS: StepDef[] = [
  {
    key: "conectar",
    label: "Conectar o WhatsApp",
    hint: "Escaneie o QR code com o número que vai atender.",
    href: "/connect",
    cta: "Conectar",
  },
  {
    key: "configurar",
    label: "Configurar o agente",
    hint: "Escolha o preset do seu segmento e ajuste os dados da empresa.",
    href: "/agente",
    cta: "Configurar",
  },
  {
    key: "testar",
    label: "Testar a conversa",
    hint: "Fale com o agente na bancada de teste antes de soltar para clientes.",
    href: "/playground",
    cta: "Testar",
  },
  {
    key: "publicar",
    label: "Publicar o agente",
    hint: "Enquanto não publicar, o agente não responde ninguém no WhatsApp.",
    href: "/agente",
    cta: "Publicar",
  },
];

export function onboardingState(input: OnboardingInput): OnboardingState {
  const feito: Record<StepKey, boolean> = {
    conectar: !!input.hasInstance,
    configurar: !!input.agentConfigured,
    testar: !!input.tested,
    publicar: !!input.published,
  };

  let anterioresOk = true;
  const steps: OnboardingStep[] = DEFS.map((d) => {
    const step: OnboardingStep = {
      ...d,
      done: feito[d.key],
      enabled: anterioresOk,
    };
    anterioresOk = anterioresOk && feito[d.key];
    return step;
  });

  const done = steps.filter((s) => s.done).length;
  const complete = feito.publicar;

  return {
    steps,
    done,
    total: steps.length,
    complete,
    next: complete ? null : (steps.find((s) => !s.done) ?? null),
  };
}

/**
 * O que falta para poder publicar. Usado pela rota de publicação (o gate de
 * verdade) e pela UI, para não haver duas opiniões sobre a mesma regra.
 * Testar é exigido: é uma mensagem na bancada e evita publicar agente quebrado.
 */
export function publishBlockers(input: OnboardingInput): string[] {
  const faltas: string[] = [];
  if (!input.hasInstance) faltas.push("conectar o WhatsApp");
  if (!input.agentConfigured) faltas.push("configurar o agente");
  if (!input.tested) faltas.push("testar a conversa na bancada");
  return faltas;
}
