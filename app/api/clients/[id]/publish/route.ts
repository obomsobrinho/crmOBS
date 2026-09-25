import { NextResponse, type NextRequest } from "next/server";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { publishBlockers } from "@/lib/onboarding";
import { connectionState } from "@/lib/evolution";

/**
 * Estado da instância na Evolution (`open`, `close`, `connecting`), ou `null`
 * quando não deu para saber. Mesma leitura da rota `whatsapp-status`.
 */
async function estadoDaInstancia(instancia: string): Promise<string | null> {
  try {
    const res = await connectionState(instancia);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      instance?: { state?: string };
      state?: string;
    };
    return data.instance?.state ?? data.state ?? null;
  } catch {
    return null;
  }
}

// Liga e desliga o agente do tenant logado. É o interruptor real: desligado, o
// /api/agent responde em silêncio e nenhum cliente recebe mensagem da IA (as
// mensagens continuam sendo gravadas para a equipe responder na mão).
//
// DUAS COLUNAS, DOIS PAPÉIS:
//   agent_published_at  primeira ativação. Gravada uma vez e NUNCA limpa, porque
//                       é ela que diz ao onboarding que o trilho acabou. Zerar
//                       no desligar fazia a barra de onboarding voltar em toda
//                       página pedindo "Publicar o agente".
//   agent_enabled       o liga-desliga de verdade, o que o switch da tela move.
//
// Os pré-requisitos (conectar, com o número lido de verdade, e configurar) valem
// só na PRIMEIRA ativação. Depois disso ligar e desligar é livre. Testar deixou
// de ser pré-requisito em 28/08/2026.
//
// Write via service_role: a RLS de `clients` não dá UPDATE a `authenticated`
// (update do browser afetaria 0 linhas em silêncio). Por isso a checagem de
// linhas afetadas no fim.
export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/publish">
) {
  const { id } = await ctx.params;

  const mine = await getMyClient();
  if (!mine) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (mine.id !== id)
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  if (mine.role !== "dono")
    return NextResponse.json(
      { error: "só o dono pode publicar o agente" },
      { status: 403 }
    );

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "informe enabled" }, { status: 400 });
  }

  const primeiraVez = !mine.agentPublishedAt;

  // Gate de pré-requisitos: mesma regra que a UI mostra (lib/onboarding), para
  // não existirem duas opiniões sobre quando dá para ativar. Vale só na primeira
  // ativação: religar depois não exige nada.
  if (body.enabled && primeiraVez) {
    const faltas = publishBlockers({
      hasInstance: !!mine.evolution_instance,
      agentConfigured: mine.montagem.feito.configurar,
      tested: mine.montagem.feito.testar,
      published: !!mine.agentPublishedAt,
    });
    if (faltas.length > 0) {
      return NextResponse.json(
        { error: `antes de ativar, falta: ${faltas.join(", ")}.`, faltas },
        { status: 409 }
      );
    }

    // CONECTADO DE VERDADE (24/09/2026). `evolution_instance` nasce ao PEDIR o
    // QR ou o código, não ao conectar. Com a ordem nova da montagem, conectar e
    // ativar moram no mesmo passo, e sem esta checagem dava para ativar um
    // agente sobre uma instância criada e nunca lida.
    // ⚠️ Só bloqueia com um "não" CLARO da Evolution. Se ela não responder, ou
    // responder algo que não dá para ler, segue: dado faltando nunca derruba
    // quem está tentando ativar, e o `WhatsAppBanner` avisa a queda depois.
    const estado = await estadoDaInstancia(mine.evolution_instance!);
    if (estado && estado !== "open") {
      return NextResponse.json(
        {
          error:
            "antes de ativar, falta: conectar o WhatsApp. O número ainda não foi conectado.",
          faltas: ["conectar o WhatsApp"],
        },
        { status: 409 }
      );
    }
  }

  // Desligar NÃO limpa agent_published_at (ver o comentário no topo).
  const update: Record<string, unknown> = { agent_enabled: body.enabled };
  if (body.enabled && primeiraVez) {
    update.agent_published_at = new Date().toISOString();
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clients")
    .update(update)
    .eq("id", id)
    .select("id, agent_published_at, agent_enabled");

  if (error || !data?.length) {
    return NextResponse.json(
      { error: "falha ao salvar", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    enabled: data[0].agent_enabled !== false,
    publishedAt: data[0].agent_published_at,
  });
}
