import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { TRIAL_DAYS, trialEndsAtFrom } from "@/lib/billing";

// Cadastro self-service: cria o login, o tenant e o vínculo de dono.
//
// POR QUE O FLUXO É POR E-MAIL (e o formulário não pede senha): a senha NUNCA
// passa pelo nosso servidor. Usamos o mesmo caminho já provado do convite de
// equipe (auth.admin.inviteUserByEmail): a pessoa recebe o link, cai em
// /auth/confirm e escolhe a própria senha em /definir-senha. De brinde, a
// confirmação de e-mail fica obrigatória por construção (sem abrir o e-mail não
// existe acesso) e o servidor continua sendo o único ponto de entrada, o que é o
// que torna o freio de abuso possível.
//
// ATOMICIDADE: o tenant é criado pela função public.provision_tenant (clients +
// user_clients + funil numa transação só). Se ela falhar depois do usuário ter
// sido criado, o usuário é apagado: nunca sobra conta sem tenant nem tenant sem
// dono.
//
// ⚠️ Depende de SMTP + template de e-mail configurados no projeto Supabase (a
// mesma dependência do convite de equipe).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Freio de abuso por IP. É a única rota pública que cria dados.
const MAX_POR_HORA = 5;
const MAX_POR_DIA = 20;
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
// Tentativa velha não serve para nada: some junto (a tabela não é histórico).
const RETENCAO_MS = 7 * DIA_MS;

const NOME_MIN = 2;
const NOME_MAX = 80;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

export async function POST(req: NextRequest) {
  let body: { companyName?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyName = (body.companyName ?? "").trim().replace(/\s+/g, " ");
  const email = (body.email ?? "").trim().toLowerCase();

  if (companyName.length < NOME_MIN || companyName.length > NOME_MAX) {
    return NextResponse.json(
      { error: "informe o nome da sua empresa" },
      { status: 400 }
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  }

  const svc = createServiceClient();
  const ip = clientIp(req);
  const agora = Date.now();

  // Limpeza por oportunidade (best-effort, não pode derrubar o cadastro).
  await svc
    .from("signup_attempts")
    .delete()
    .lt("created_at", new Date(agora - RETENCAO_MS).toISOString());

  const { data: recentes } = await svc
    .from("signup_attempts")
    .select("created_at")
    .eq("ip", ip)
    .gte("created_at", new Date(agora - DIA_MS).toISOString());

  const marcas = ((recentes ?? []) as { created_at: string }[]).map((r) =>
    Date.parse(r.created_at)
  );
  const naUltimaHora = marcas.filter((t) => t >= agora - HORA_MS).length;
  if (naUltimaHora >= MAX_POR_HORA || marcas.length >= MAX_POR_DIA) {
    return NextResponse.json(
      { error: "muitas tentativas de cadastro. Tente novamente mais tarde." },
      { status: 429 }
    );
  }

  // A tentativa é registrada ANTES do resultado: tentativa que falha também
  // conta, senão dá para varrer e-mails de graça.
  const { data: tentativa } = await svc
    .from("signup_attempts")
    .insert({ ip, email, ok: false })
    .select("id")
    .maybeSingle();

  const origin = new URL(req.url).origin;
  const { data: criado, error: authErr } = await svc.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${origin}/auth/confirm?next=/definir-senha`,
      data: { company_name: companyName },
    }
  );

  if (authErr || !criado?.user) {
    if (authErr?.status === 422) {
      return NextResponse.json(
        { error: "esse e-mail já tem uma conta. Faça login ou recupere a senha." },
        { status: 409 }
      );
    }
    console.error("falha ao criar o usuário no cadastro:", authErr?.message);
    return NextResponse.json(
      { error: "não foi possível enviar o e-mail de confirmação. Tente de novo." },
      { status: 500 }
    );
  }

  const { data: clientId, error: provErr } = await svc.rpc("provision_tenant", {
    p_user_id: criado.user.id,
    p_company_name: companyName,
    p_trial_ends_at: trialEndsAtFrom(new Date(agora), TRIAL_DAYS),
  });

  if (provErr || !clientId) {
    // Desfaz o usuário: sem tenant ele entraria num app sem conta nenhuma.
    const { error: delErr } = await svc.auth.admin.deleteUser(criado.user.id);
    if (delErr)
      console.error(
        "cadastro falhou e o usuário órfão não pôde ser apagado:",
        criado.user.id,
        delErr.message
      );
    console.error("falha ao provisionar o tenant:", provErr?.message);
    return NextResponse.json(
      { error: "não foi possível criar sua conta. Tente de novo." },
      { status: 500 }
    );
  }

  if (tentativa?.id) {
    await svc.from("signup_attempts").update({ ok: true }).eq("id", tentativa.id);
  }

  return NextResponse.json({ ok: true, email, trialDays: TRIAL_DAYS });
}
