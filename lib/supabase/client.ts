import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local"
  );
}

// Singleton no browser: evita múltiplas instâncias do GoTrue e mantém a sessão
// (persistida em cookies pelo @supabase/ssr) disponível para o Realtime.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!client) client = createBrowserClient(url!, anonKey!);
  return client;
}
