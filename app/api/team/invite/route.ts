import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

// Convida um usuário para o tenant do dono logado.
// - Só o dono convida (gate por user_clients.role).
// - Cria o login via Supabase Auth admin (inviteUserByEmail) e vincula em
//   user_clients com o papel escolhido. O CRM NUNCA define a senha: o convidado
//   define a própria pelo link do e-mail (fluxo /auth/confirm -> /definir-senha).
// Write via service_role: user_clients não tem policy de INSERT para
// authenticated (o browser afetaria 0 linhas em silêncio).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono pode convidar membros" },
      { status: 403 }
    );

  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  }
  if (body.role !== "dono" && body.role !== "atendente") {
    return NextResponse.json({ error: "papel inválido" }, { status: 400 });
  }
  const role = body.role;

  const svc = createServiceClient();
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/auth/confirm?next=/definir-senha`;

  const { data, error } = await svc.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (error || !data?.user) {
    // 422 = e-mail já registrado (usuário já tem conta).
    if (error?.status === 422) {
      return NextResponse.json(
        { error: "esse e-mail já tem uma conta; peça para a pessoa fazer login" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "falha ao enviar o convite", detail: error?.message },
      { status: 500 }
    );
  }

  const { error: linkErr } = await svc
    .from("user_clients")
    .upsert(
      { user_id: data.user.id, client_id: mine.id, role },
      { onConflict: "user_id,client_id" }
    );
  if (linkErr) {
    return NextResponse.json(
      { error: "convite enviado, mas falha ao vincular ao time", detail: linkErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, email, role });
}
