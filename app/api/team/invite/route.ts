import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  billableSeats,
  extraSeatsPriceBRL,
  planFor,
  seatState,
} from "@/lib/billing";

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

  // Limite de atendente do plano (o dono não conta). Contado por service_role
  // porque a policy de user_clients só mostra a PRÓPRIA linha ao browser: contar
  // pela sessão daria sempre 1. É aqui que o plano vira regra de verdade, e não
  // numa mensagem na tela que dá para ignorar.
  //
  // Atendente extra É VENDIDO como adicional, então isto não é uma parede
  // definitiva: é uma parede ENQUANTO não existe checkout. Cobrar o adicional
  // hoje é operação manual, e liberar antes de cobrar seria dar assento de graça.
  const { count: membros } = await svc
    .from("user_clients")
    .select("user_id", { count: "exact", head: true })
    .eq("client_id", mine.id);
  const plano = planFor(mine.billingPlan);
  const seats = seatState(plano, billableSeats(membros ?? 0));
  if (plano && !seats.withinPlan) {
    return NextResponse.json(
      {
        error: `${seats.message} Para incluir mais gente agora, fale com a gente.`,
        seats: {
          used: seats.used,
          included: seats.included,
          extraCostBRL: extraSeatsPriceBRL(seats.extra + 1),
        },
      },
      { status: 409 }
    );
  }
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
