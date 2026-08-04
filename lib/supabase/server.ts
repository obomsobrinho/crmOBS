import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client autenticado por sessão (cookies) para Server Components e Route
// Handlers. A RLS por tenant é aplicada com o JWT do usuário logado.
export async function createClient() {
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
}
