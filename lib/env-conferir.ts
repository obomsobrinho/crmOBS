import { z } from "zod";
import { envDoServidor, envPublico, type VariavelDoServidor } from "@/lib/env";

// The environment lists, the two Zod schemas (docs/plano-dados-e-estado.md, 2.9) and
// the check at server start. Server only (`lib/supabase/service.ts` and the tests); kept
// out of lib/env.ts so neither Zod nor the lists enter the browser bundle.
//
// Checked against the Vercel Production variables on 16/11/2026 (the owner's
// screenshot, names only). Required = present there AND the product does not work
// without it. Optional = the code already degrades without it (`data.md`,
// `billing.md` say how) or Vercel fills it itself.

export const OBRIGATORIAS_DO_SERVIDOR = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "N8N_BOT_WEBHOOK_URL",
  "N8N_SEND_WEBHOOK_URL",
  "N8N_IA_SEND_WEBHOOK_URL",
  "N8N_LOOKUP_SECRET",
  "N8N_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "ADMIN_USER_IDS",
  "CRON_SECRET",
  "APIFY_TOKEN",
  "APIFY_WEBHOOK_SECRET",
] as const satisfies readonly VariavelDoServidor[];

export const OPCIONAIS_DO_SERVIDOR = [
  // Default `gpt-5.4-mini` (lib/agent.ts).
  "OPENAI_AGENT_MODEL",
  // Not in the Project tab of Production on 16/11/2026 (maybe in Shared): optional
  // until the owner confirms. Without the key the payment answers its own 500;
  // without ASAAS_ENV = "producao" the gateway is the sandbox (billing.md).
  "ASAAS_API_KEY",
  "ASAAS_ENV",
  "ASAAS_WEBHOOK_TOKEN",
  // Filled by Vercel itself (system variables); absent outside Vercel.
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_ENV",
] as const satisfies readonly VariavelDoServidor[];

export const OBRIGATORIAS_PUBLICAS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

// Compile-time: every name of the `VariavelDoServidor` type is in one of the two lists.
type ForaDasListas = Exclude<
  VariavelDoServidor,
  (typeof OBRIGATORIAS_DO_SERVIDOR)[number] | (typeof OPCIONAIS_DO_SERVIDOR)[number]
>;
const listasCobremOTipo: [ForaDasListas] extends [never] ? true : ForaDasListas = true;
void listasCobremOTipo;

const preenchida = z.string().min(1);
const opcional = z.string().optional();

export const esquemaDoServidor = z.object({
  ...Object.fromEntries(OBRIGATORIAS_DO_SERVIDOR.map((n) => [n, preenchida])),
  ...Object.fromEntries(OPCIONAIS_DO_SERVIDOR.map((n) => [n, opcional])),
});

export const esquemaPublico = z.object(Object.fromEntries(OBRIGATORIAS_PUBLICAS.map((n) => [n, preenchida])));

/** The names of required variables that are missing or empty, sorted. Pure (tests). */
export function faltasNoAmbiente(ambiente: Record<string, string | undefined>): string[] {
  const nomes = new Set<string>();
  for (const esquema of [esquemaDoServidor, esquemaPublico]) {
    const r = esquema.safeParse(ambiente);
    if (!r.success) for (const i of r.error.issues) nomes.add(String(i.path[0]));
  }
  return [...nomes].sort();
}

/** The current environment, only the listed names. */
function ambienteAtual(): Record<string, string | undefined> {
  const nomes: VariavelDoServidor[] = [...OBRIGATORIAS_DO_SERVIDOR, ...OPCIONAIS_DO_SERVIDOR];
  return {
    ...Object.fromEntries(nomes.map((n) => [n, envDoServidor(n)])),
    NEXT_PUBLIC_SUPABASE_URL: envPublico.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: envPublico.supabaseAnonKey,
  };
}

/** Once per server instance (lib/supabase/service.ts), Vercel Production only: logs the missing NAMES (never a value), never throws. */
export function conferirAmbiente(): void {
  if (envDoServidor("VERCEL_ENV") !== "production") return;
  const faltas = faltasNoAmbiente(ambienteAtual());
  if (faltas.length > 0) console.error(`ambiente: faltam variáveis obrigatórias: ${faltas.join(", ")}`);
}
