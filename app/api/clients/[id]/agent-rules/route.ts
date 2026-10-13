import { NextResponse, type NextRequest } from "next/server";
import { sessaoDaRota } from "@/lib/rota";
import { createServiceClient } from "@/lib/supabase/service";
import { compilarDoTenant, LIMITS, mudarRegras, normalizarRegras } from "@/lib/agent-prompt";
import { registrarPublicacao } from "@/lib/publicacoes";
import { SOLUCAO_DA_PORTA } from "@/lib/solucoes";
import { numeroBR } from "@/lib/format";

// REGRAS SALVAS PELO TIME (P1 item 5, 13/10/2026; ADR
// docs/adr/2026-10-13-orientation-saved-as-agent-rule.md).
//
// POST   { texto, pedidoId? }  salva uma regra (o dono confirmou o texto editado).
// DELETE { texto }             apaga uma regra (revisão no /agente).
//
// As regras moram em `clients.regras_salvas` e SÓ mudam por aqui. Cada mudança
// recompila o prompt pelo MESMO despacho do turno (`compilarDoTenant`), respeita
// o `LIMITS.persona` (acima do teto recusa; acima do aviso salva e avisa) e grava
// uma linha em `agent_publications` (salvar é publicar).
//
// TROCA CONDICIONAL: a gravação passa por `trocar_regras_salvas`, que só grava
// se a lista E o prompt gravado ainda são os que esta chamada leu. Outro save no
// meio (duas abas, clique duplo, um Salvar do formulário) faz a troca falhar; a
// rota relê e tenta UMA vez de novo, e na segunda falha responde 409. Nunca perde
// uma regra nem sobrescreve o prompt de um save mais novo. `agent_config` não é
// tocado.
//
// Só o dono de conta ativa (atendente 403, conta bloqueada 402). Escrita por
// service_role: a RLS de `clients` não tem UPDATE para `authenticated`.

type Op = "adicionar" | "remover";
type Rota = RouteContext<"/api/clients/[id]/agent-rules">;

export async function POST(req: NextRequest, ctx: Rota) {
  return mudar(req, ctx, "adicionar");
}

export async function DELETE(req: NextRequest, ctx: Rota) {
  return mudar(req, ctx, "remover");
}

const MOTIVO_DA_LISTA = {
  vazia: { status: 400, error: "Escreva a regra antes de salvar." },
  longa: { status: 400, error: `A regra passa de ${LIMITS.bullet} caracteres. Encurte o texto.` },
  ausente: { status: 404, error: "Essa regra não está mais salva." },
  cheia: { status: 409, error: "O agente já tem o máximo de regras salvas. Apague uma em Agente antes de salvar outra." },
} as const;

const TENTATIVAS = 2;

async function mudar(req: NextRequest, ctx: Rota, op: Op) {
  const { id } = await ctx.params;
  const r = await sessaoDaRota({
    id,
    dono: "só o dono pode mudar as regras do agente",
    ativa: true,
    revalidar: true,
  });
  if ("erro" in r) return r.erro;
  const { mine } = r;

  let body: { texto?: unknown; pedidoId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const svc = createServiceClient();
  const pedidoId = Number(body.pedidoId);
  // O pedido de onde a regra saiu passa a dizer "Salva como regra". Só um pedido
  // DESTE tenant, resolvido por orientação (o mesmo critério de `podeVirarRegra`).
  const marcarPedido = async () => {
    if (op !== "adicionar" || !Number.isInteger(pedidoId) || pedidoId <= 0) return;
    const { error } = await svc
      .from("handoffs")
      .update({ regra_salva_em: new Date().toISOString() })
      .eq("id", pedidoId)
      .eq("client_id", id)
      .eq("solucao", SOLUCAO_DA_PORTA.orientar)
      .not("instruction", "is", null);
    if (error) console.error("falha ao marcar o pedido da regra:", error.message);
  };

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const { data: atual, error: readErr } = await svc
      .from("clients")
      .select("persona, agent_config, prompt_mode, regras_salvas")
      .eq("id", id)
      .maybeSingle();
    if (readErr || !atual) {
      return NextResponse.json({ error: "falha ao ler a configuração do agente" }, { status: 500 });
    }

    const atuais = normalizarRegras(atual.regras_salvas);
    const mudanca = mudarRegras(atuais, { tipo: op, texto: body.texto });
    if (!mudanca.ok) {
      const m = MOTIVO_DA_LISTA[mudanca.motivo];
      return NextResponse.json({ error: m.error }, { status: m.status });
    }
    // A mesma regra já salva (de outro pedido, ou um clique repetido): sucesso,
    // sem nova versão; só marca este pedido.
    if (!mudanca.mudou) {
      await marcarPedido();
      return NextResponse.json({ ok: true, regras: atuais, aviso: null, mensagem: "Essa regra já estava salva." });
    }

    const compilado = compilarDoTenant(atual, mudanca.regras);
    let persona: string;
    if (compilado.ok) {
      persona = compilado.persona;
    } else if (compilado.motivo === "longo" && op === "remover") {
      // Apagar só encurta: recusar deixaria o dono sem saída se o prompt já passou do teto.
      persona = compilado.persona;
    } else if (compilado.motivo === "longo") {
      return NextResponse.json(
        {
          error: `A regra não cabe: o prompt do agente ficaria com ${numeroBR(compilado.persona.length)} caracteres, e o limite é ${numeroBR(LIMITS.persona)}. Encurte a regra ou apague outra em Agente.`,
        },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Termine de configurar o agente em Agente antes de salvar regras." },
        { status: 409 }
      );
    }

    // `atual.regras_salvas` CRU, e não a lista normalizada: a troca compara com
    // o que está gravado.
    const { data: trocou, error: casErr } = await svc.rpc("trocar_regras_salvas", {
      p_client: id,
      p_antes: atual.regras_salvas,
      p_depois: mudanca.regras,
      p_persona_antes: atual.persona ?? "",
      p_persona: persona,
    });
    if (casErr) {
      return NextResponse.json({ error: "falha ao salvar a regra" }, { status: 500 });
    }
    if (!trocou) continue; // outro save chegou antes: relê e tenta de novo

    // Salvar é publicar (a versão nova vai para o histórico) e o pedido fica
    // marcado: independentes, best-effort, juntos.
    await Promise.all([
      registrarPublicacao(svc, {
        client_id: id,
        config: atual.agent_config,
        persona,
        prompt_mode: atual.prompt_mode === "avancado" ? "avancado" : "guiado",
        published_by: mine.userId,
      }),
      marcarPedido(),
    ]);

    return NextResponse.json({
      ok: true,
      regras: mudanca.regras,
      chars: persona.length,
      aviso:
        persona.length > LIMITS.personaWarn
          ? `O prompt do agente está com ${numeroBR(persona.length)} caracteres, perto do limite de ${numeroBR(LIMITS.persona)}.`
          : null,
      mensagem: null,
    });
  }

  return NextResponse.json(
    { error: "A configuração do agente mudou enquanto a regra era salva. Tente de novo." },
    { status: 409 }
  );
}
