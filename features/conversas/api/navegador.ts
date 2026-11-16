import { createClient } from "@/lib/supabase/client";

/**
 * O cliente do Supabase no navegador (sessão do usuário, RLS), para a área de Conversas.
 * Componente e hook da área não importam `lib/supabase/client` (docs/plano-dados-e-estado.md,
 * 2.11): pedem aqui. As leituras que ainda moram nos componentes vêm para `api/` conforme o
 * passo 4 migra cada uma.
 */
export function clienteDoNavegador() {
  return createClient();
}
