import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { DatabaseApp } from "@/lib/supabase/schema";

// Client com service_role (ignora RLS). USO EXCLUSIVO no servidor — nunca
// expor a chave ao browser. Usado por endpoints de onboarding/lookup.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor"
    );
  }
  return createClient<DatabaseApp>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
