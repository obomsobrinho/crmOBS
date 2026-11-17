// THE ONLY place that reads `process.env` (docs/plano-dados-e-estado.md, 2.9; lint
// `no-restricted-properties` everywhere else). No "server-only", no Zod and no lists
// here: the two public variables are read by the browser
// (lib/supabase/client.ts is in every page), so this file adds nothing but a few
// bytes to the bundle (B8). A server variable read in the browser is `undefined`
// (Next only inlines `NEXT_PUBLIC_*`), never a leak.
//
// Checked against the Vercel Production variables on 16/11/2026 (the owner's
// screenshot, names only). Which ones are required, the two Zod schemas and the check
// at server start live in `lib/env-conferir.ts` (server only), whose lists must cover
// this type exactly (a compile-time check there). The check LOGS, never blocks the
// boot (docs/adr/2026-11-16-env-check-logs-never-blocks-boot.md).

export type VariavelDoServidor =
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "EVOLUTION_API_URL"
  | "EVOLUTION_API_KEY"
  | "N8N_BOT_WEBHOOK_URL"
  | "N8N_SEND_WEBHOOK_URL"
  | "N8N_IA_SEND_WEBHOOK_URL"
  | "N8N_LOOKUP_SECRET"
  | "N8N_WEBHOOK_SECRET"
  | "OPENAI_API_KEY"
  | "OPENAI_AGENT_MODEL"
  | "ADMIN_USER_IDS"
  | "CRON_SECRET"
  | "APIFY_TOKEN"
  | "APIFY_WEBHOOK_SECRET"
  | "ASAAS_API_KEY"
  | "ASAAS_ENV"
  | "ASAAS_WEBHOOK_TOKEN"
  | "VERCEL_PROJECT_PRODUCTION_URL"
  | "VERCEL_ENV";

/** A server variable, read at call time (same value and semantics as the old `process.env.X`). */
export function envDoServidor(nome: VariavelDoServidor): string | undefined {
  return process.env[nome];
}

/** The two public variables, written literally so Next inlines them in the browser bundle. */
export const envPublico = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

