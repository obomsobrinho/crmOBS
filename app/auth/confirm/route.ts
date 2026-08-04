import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Confirma o link enviado por e-mail (convite, recuperação de senha, etc.) e
// grava a sessão em cookie. Suporta os dois formatos que o Supabase pode mandar:
// - `code` (fluxo PKCE) -> exchangeCodeForSession
// - `token_hash` + `type` -> verifyOtp
// Depois redireciona para `next` (mesma origem). O convidado cai em
// /definir-senha para escolher a própria senha.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") || "/";
  const next = nextParam.startsWith("/") ? nextParam : "/";

  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  return NextResponse.redirect(
    new URL(ok ? next : "/login?erro=convite", url.origin)
  );
}
