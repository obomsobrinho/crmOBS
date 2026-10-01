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

// ⚠️ REALTIME SÓ DEPOIS DA SESSÃO (achado de 01/10/2026). Canal assinado no
// primeiro carregamento da página entrava ANTES de a sessão ser lida do cookie,
// com a chave anônima: a assinatura era aceita, mas a RLS (corretamente)
// escondia todo evento de um anônimo, e o canal ficava mudo para sempre. Foi
// assim que o contador do menu parou de acompanhar o banco sem ninguém ver.
// Toda assinatura passa por `assinarComSessao`: espera a sessão, entrega o token
// ao realtime e só então monta o canal.
let pronto: Promise<void> | null = null;

function realtimePronto(): Promise<void> {
  if (!pronto) {
    const sb = createClient();
    pronto = (async () => {
      try {
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (token) await sb.realtime.setAuth(token);
      } catch {
        // sem sessão (preview): o canal entra como está, e não recebe nada
      }
    })();
  }
  return pronto;
}

type Canal = ReturnType<ReturnType<typeof createBrowserClient>["channel"]>;

/**
 * Monta um canal de realtime DEPOIS de a sessão estar no realtime. Devolve a
 * função de limpeza (para o `return` do `useEffect`).
 */
export function assinarComSessao(
  montar: (sb: ReturnType<typeof createBrowserClient>) => Canal
): () => void {
  const sb = createClient();
  let canal: Canal | null = null;
  let vivo = true;
  void realtimePronto().then(() => {
    if (vivo) canal = montar(sb);
  });
  return () => {
    vivo = false;
    if (canal) void sb.removeChannel(canal);
  };
}
