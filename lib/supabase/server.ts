import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client autenticado por sessão (cookies) para Server Components e Route
// Handlers. A RLS por tenant é aplicada com o JWT do usuário logado.
//
// MEMOIZADO POR REQUEST com `React.cache` (C5 do plano da demo, achado A1): o
// layout do app, a página e `getMyClient()` chamavam isto separadamente na
// mesma navegação e cada chamada criava um client novo. Dentro de um request
// todos agora recebem a MESMA instância (mesmos cookies, mesma sessão). O
// escopo é o request: nada vaza entre usuários, porque o React descarta o cache
// quando o request termina.
export const createClient = cache(async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado de um Server Component (sem acesso a set). Ignorável:
            // o proxy.ts cuida de renovar a sessão.
          }
        },
      },
    }
  );
});
