import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { DatabaseApp } from "@/lib/supabase/schema";
import { envDoServidor, envPublico } from "@/lib/env";
import { conferirAmbiente } from "@/lib/env-conferir";

// Once per server instance (module scope): logs missing variable NAMES in Vercel
// Production, never throws. Here and not in `instrumentation.ts`, which adds about
// 1 kB of browser JS to every route (B8, measured on 16/11/2026); this module is
// server-only and loaded by almost every route and server page.
conferirAmbiente();

// Client com service_role (ignora RLS). USO EXCLUSIVO no servidor — nunca
// expor a chave ao browser. Usado por endpoints de onboarding/lookup.
export function createServiceClient() {
  const url = envPublico.supabaseUrl;
  const serviceKey = envDoServidor("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor"
    );
  }
  return createClient<DatabaseApp>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
