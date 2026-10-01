import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatabaseApp } from "@/lib/supabase/schema";

// O client do Supabase já tipado com o schema. Para funções de lib que recebem o
// client de fora (browser, servidor ou service), sem importar o pacote.
export type Supa = SupabaseClient<DatabaseApp>;
