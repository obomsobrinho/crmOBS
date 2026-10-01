import { NextResponse, type NextRequest } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchGroups, ownerNumber } from "@/lib/evolution";
import {
  ehGrupo,
  jidDoNumero,
  mesmoTelefone,
  normalizarNumero,
} from "@/lib/avisos";

// DESTINO DOS AVISOS NO WHATSAPP (`clients.notify_group_jid`).
//
// Até 29/09/2026 era um JID de grupo digitado à mão, só para a reunião marcada.
// Virou o destino ÚNICO de avisos (pedido de ajuda, reunião marcada, "a IA não
// respondeu"), e aceita um NÚMERO (DDI 55 automático) ou um GRUPO escolhido na
// lista que o GET abaixo devolve. O nome da coluna ficou: o n8n lê ela, e zero
// mudança no n8n era condição do plano (docs/plano-avisos.md).
//
// Só o dono configura. Write via service_role: a RLS de `clients` não dá UPDATE
// a `authenticated` (um update do browser afetaria 0 linhas em silêncio).

/**
 * Grava o destino. Corpo: `{ numero }` ou `{ grupo }`; sem nenhum dos dois,
 * limpa (volta a null).
 */
export async function PUT(
  req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/notify-target">
) {
  const { id } = await ctx.params;
  const r = await sessaoDaRota({ id, dono: "só o dono pode configurar os avisos" });
  if ("erro" in r) return r.erro;
  const { mine } = r;

  let body: { numero?: unknown; grupo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const numero = typeof body.numero === "string" ? body.numero.trim() : "";
  const grupo = typeof body.grupo === "string" ? body.grupo.trim() : "";
  if (numero && grupo) {
    return NextResponse.json(
      { error: "escolha um número ou um grupo, não os dois" },
      { status: 400 }
    );
  }

  let value: string | null = null;
  if (grupo) {
    if (!ehGrupo(grupo) || grupo.length > 100) {
      return NextResponse.json(
        { error: "grupo inválido. Escolha um grupo da lista." },
        { status: 400 }
      );
    }
    value = grupo;
  } else if (numero) {
    const digitos = normalizarNumero(numero);
    if (!digitos) {
      return NextResponse.json(
        { error: "número inválido. Digite o DDD e o número, por exemplo 11 91234-5678." },
        { status: 400 }
      );
    }
    // NUNCA o número do próprio agente: o aviso sairia dele para ele mesmo, e o
    // celular não toca. Só bloqueia com a Evolution dizendo qual é o número;
    // sem essa resposta, segue (dado faltando não derruba quem configura).
    if (mine.evolution_instance) {
      const dono = await ownerNumber(mine.evolution_instance);
      if (dono && mesmoTelefone(dono, digitos)) {
        return NextResponse.json(
          {
            error:
              "esse é o número do próprio agente. Os avisos precisam ir para outro número, o de quem vai responder.",
            campo: "numero",
          },
          { status: 400 }
        );
      }
    }
    value = jidDoNumero(digitos);
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("clients")
    .update({ notify_group_jid: value })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    return NextResponse.json(
      { error: "falha ao salvar o destino dos avisos", detail: error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, jid: value });
}

/**
 * Lista os grupos do número conectado, para a pessoa ESCOLHER (nunca digitar
 * JID). 409 quando não há WhatsApp conectado: a lista vem do próprio WhatsApp.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/clients/[id]/notify-target">
) {
  const { id } = await ctx.params;
  const r = await sessaoDaRota({ id, dono: "só o dono pode configurar os avisos" });
  if ("erro" in r) return r.erro;
  const { mine } = r;

  if (!mine.evolution_instance) {
    return NextResponse.json(
      { error: "conecte o WhatsApp para ver os grupos." },
      { status: 409 }
    );
  }
  let grupos;
  try {
    grupos = await fetchGroups(mine.evolution_instance);
  } catch {
    grupos = null;
  }
  if (!grupos) {
    return NextResponse.json(
      {
        error:
          "não foi possível buscar os grupos. Confira se o WhatsApp está conectado e tente de novo.",
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ grupos });
}
