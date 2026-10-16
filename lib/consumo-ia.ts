import "server-only";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Supa } from "@/lib/supabase/tipos";
import { sendText } from "@/lib/evolution";
import { mesmoDestino, textoDoAvisoDeConsumo } from "@/lib/avisos";
import { destinosDoDono } from "@/lib/admin";
import {
  estadoDoConsumo,
  limiaresDaEmpresa,
  limiteDaEmpresa,
  mesSP,
  podeAvisarConsumo,
  tokensCurto,
  tokensUsados,
  type EstadoDoConsumo,
  type MarcasDoMes,
  type TokensDoMes,
} from "@/lib/custo-ia";

// O LADO SERVIDOR DO USO DE IA (P1 item 6, docs/plano-custo-ia.md). A regra
// (teto, 80%, mês de São Paulo, custo, aviso pendente) é de `lib/custo-ia.ts`;
// aqui só o que fala com o banco e com a Evolution.
//
// - Ler o mês: UMA leitura pela chave primária de `consumo_ia_mensal` (tokens e
//   as marcas dos avisos). Nunca somar `agent_turns` no caminho do turno.
// - Somar o turno: UMA chamada atômica (`somar_consumo_ia`), dentro do `logTurn`.
// - Avisar: UM remetente (`agendarAvisoDeConsumo`), chamado só pelo
//   `processTurn` e só quando a leitura diz que há aviso pendente.

export type ConsumoDoMes = TokensDoMes & MarcasDoMes;

const ZERO: ConsumoDoMes = { entrada: 0, cache: 0, saida: 0, aviso80: null, aviso100: null };

/**
 * Os tokens do mês da empresa e as marcas dos avisos (zero quando ainda não há
 * linha). Em erro devolve `null`: quem chama decide (o turno ATENDE na dúvida;
 * emudecer uma empresa por uma falha de leitura seria pior que passar do teto
 * por um turno).
 */
export async function lerConsumoDoMes(
  svc: Supa,
  clientId: string,
  mes: string
): Promise<ConsumoDoMes | null> {
  const { data, error } = await svc
    .from("consumo_ia_mensal")
    .select("tokens_entrada, tokens_cache, tokens_saida, aviso_80_em, aviso_100_em")
    .eq("client_id", clientId)
    .eq("mes", mes)
    .maybeSingle();
  if (error) {
    console.error("falha ao ler o consumo de IA do mês:", error.message);
    return null;
  }
  if (!data) return ZERO;
  return {
    entrada: data.tokens_entrada,
    cache: data.tokens_cache,
    saida: data.tokens_saida,
    aviso80: data.aviso_80_em,
    aviso100: data.aviso_100_em,
  };
}

/**
 * Soma um turno ao mês, atômico no banco, e devolve o total já somado com as
 * marcas. NUNCA lança (é parte do `logTurn`, que é best-effort): em erro, `null`.
 */
export async function somarConsumoDoTurno(
  svc: Supa,
  clientId: string,
  mes: string,
  t: TokensDoMes
): Promise<ConsumoDoMes | null> {
  try {
    const { data, error } = await svc.rpc("somar_consumo_ia", {
      p_client: clientId,
      p_mes: mes,
      p_entrada: Math.max(0, Math.round(t.entrada)),
      p_cache: Math.max(0, Math.round(t.cache)),
      p_saida: Math.max(0, Math.round(t.saida)),
    });
    if (error) {
      console.error("falha ao somar o consumo de IA:", error.message);
      return null;
    }
    const l = (data ?? [])[0];
    if (!l) return null;
    // O gerador tipa as colunas de retorno como não nulas; as marcas são nulas
    // até o aviso sair.
    const marca = (v: string | null | undefined) => v ?? null;
    return {
      entrada: l.tokens_entrada,
      cache: l.tokens_cache,
      saida: l.tokens_saida,
      aviso80: marca(l.aviso_80_em),
      aviso100: marca(l.aviso_100_em),
    };
  } catch (e) {
    console.error("falha ao somar o consumo de IA:", e);
    return null;
  }
}

/**
 * Limpa as marcas dos avisos do mês que o teto QUE VALE AGORA para a empresa deixou para trás. O teto segue o
 * PLANO (`limiteDaEmpresa`), então uma troca de plano muda o teto sem passar por `admin_mudar_limite_ia`
 * (que limpa as marcas na edição do limite): quem troca o plano chama isto DEPOIS de gravar (`admin_mudar_conta`
 * com `mudar_plano`, `/api/billing/subscribe`). Lê o limite personalizado e o plano da empresa, calcula os
 * limiares pela MESMA regra da edição (`limiaresDaEmpresa`, `lib/custo-ia.ts`) e chama
 * `limpar_marcas_consumo_ia`: a marca de um nível cujo limiar ficou acima do uso do mês é limpa, e o aviso volta a
 * sair se o uso cruzar de novo. Teto que DESCEU não limpa nada (o próximo turno real manda o aviso pendente).
 * Chamada depois da escrita que já valeu: NUNCA lança (uma falha fica no log, e o aviso pendente só atrasa).
 */
export async function alinharMarcasDoMes(svc: Supa, clientId: string, agora: number): Promise<void> {
  try {
    const { data: c, error } = await svc
      .from("clients")
      .select("ia_limite_tokens, billing_plan")
      .eq("id", clientId)
      .maybeSingle();
    if (error || !c) {
      console.error("falha ao ler o teto para alinhar as marcas dos avisos:", error?.message ?? "empresa não encontrada");
      return;
    }
    const limiares = limiaresDaEmpresa(c.ia_limite_tokens, c.billing_plan);
    const { error: erroDaLimpeza } = await svc.rpc("limpar_marcas_consumo_ia", {
      p_client: clientId,
      p_mes: mesSP(agora),
      p_limiar_aviso: limiares.aviso,
      p_limiar_parado: limiares.parado,
    });
    if (erroDaLimpeza) console.error("falha ao limpar as marcas dos avisos de IA:", erroDaLimpeza.message);
  } catch (e) {
    console.error("falha ao alinhar as marcas dos avisos de IA:", e);
  }
}

/**
 * Estado da IA da empresa no mês, com UMA leitura (o mês com o teto da empresa
 * embutido pela chave estrangeira). Sem linha do mês, nenhum token foi gasto:
 * `normal`, sem ler mais nada. Erro = `normal` (quem chama decide se isso
 * basta). Usado pela faixa do app e pelo `orientar`.
 */
export async function estadoDaEmpresaNoMes(
  svc: Supa,
  clientId: string,
  agora: number
): Promise<EstadoDoConsumo> {
  try {
    const { data, error } = await svc
      .from("consumo_ia_mensal")
      .select("tokens_entrada, tokens_saida, clients(ia_limite_tokens, billing_plan)")
      .eq("client_id", clientId)
      .eq("mes", mesSP(agora))
      .maybeSingle();
    if (error) {
      console.error("falha ao ler o estado da IA do mês:", error.message);
      return "normal";
    }
    if (!data) return "normal";
    return estadoDoConsumo(
      tokensUsados({ entrada: data.tokens_entrada, saida: data.tokens_saida }),
      limiteDaEmpresa(data.clients?.ia_limite_tokens, data.clients?.billing_plan)
    );
  } catch (e) {
    console.error("falha ao ler o estado da IA do mês:", e);
    return "normal";
  }
}

/** A faixa do app: o estado do mês do tenant (uma leitura, service_role). */
export function estadoDoConsumoDoTenant(clientId: string, agora: number): Promise<EstadoDoConsumo> {
  return estadoDaEmpresaNoMes(createServiceClient(), clientId, agora);
}

/**
 * Agenda o aviso de uso de IA PENDENTE para DEPOIS da resposta (`after`), como
 * o aviso de pedido de ajuda. Quem chama só chama com aviso pendente
 * (`avisoPendente`, lib/custo-ia.ts), então depois do aviso nenhuma mensagem
 * escreve no banco por causa dele.
 *
 * Reivindica, manda, e se TODO envio tentado falhar LIBERA a marca, para o
 * próximo turno real tentar de novo (`reivindicar_aviso_consumo` /
 * `liberar_aviso_consumo`). Envio parcial (a empresa recebeu, o dono não) fica
 * marcado: repetir mandaria de novo a quem já recebeu. Sem destino nenhum, a
 * marca fica (não há o que tentar de novo) e o log diz.
 *
 * Vai para a empresa (o destino dela) e para o dono do produto (o destino do
 * tenant do admin), sem repetir quando os dois são o mesmo (`mesmoDestino`).
 * Só turno REAL do WhatsApp avisa (`podeAvisarConsumo`): a bancada (`dryRun`) e
 * o telefone de teste (DDD 00) NUNCA disparam nem marcam.
 * NUNCA lança: aviso que falha não pode derrubar o atendimento.
 */
export function agendarAvisoDeConsumo(a: {
  clientId: string;
  empresa: string;
  phone: string;
  dryRun: boolean;
  mes: string;
  nivel: "aviso" | "parado";
  usados: number;
  limite: number;
  instancia: string | null;
  destino: string | null;
}): boolean {
  if (!podeAvisarConsumo({ dryRun: a.dryRun, phone: a.phone })) return false;
  const nivel = a.nivel;
  try {
    after(async () => {
      try {
        const svc = createServiceClient();
        const { data: minha, error } = await svc.rpc("reivindicar_aviso_consumo", {
          p_client: a.clientId,
          p_mes: a.mes,
          p_nivel: nivel,
        });
        if (error) {
          console.error("falha ao reivindicar o aviso de uso de IA:", error.message);
          return;
        }
        if (!minha) return;
        const usados = tokensCurto(a.usados);
        const limite = tokensCurto(a.limite);
        const envios: Promise<boolean>[] = [];
        if (a.instancia && a.destino) {
          envios.push(sendText(a.instancia, a.destino, textoDoAvisoDeConsumo({ nivel, usados, limite })));
        } else {
          console.error("aviso de uso de IA à empresa pulado: sem destino de avisos ou instância");
        }
        for (const d of await destinosDoDono(svc)) {
          if (mesmoDestino(d.destino, a.destino)) continue;
          envios.push(
            sendText(d.instancia, d.destino, textoDoAvisoDeConsumo({ nivel, empresa: a.empresa, usados, limite }))
          );
        }
        if (envios.length === 0) return;
        const res = await Promise.allSettled(envios);
        const ok = res.filter((r) => r.status === "fulfilled" && r.value === true).length;
        if (ok === 0) {
          console.error("aviso de uso de IA recusado em todos os destinos; liberado para o próximo turno");
          const { error: lErr } = await svc.rpc("liberar_aviso_consumo", {
            p_client: a.clientId,
            p_mes: a.mes,
            p_nivel: nivel,
          });
          if (lErr) console.error("falha ao liberar o aviso de uso de IA:", lErr.message);
        } else if (ok < res.length) {
          console.error("aviso de uso de IA recusado em algum destino");
        }
      } catch (e) {
        console.error("falha ao mandar o aviso de uso de IA:", e);
      }
    });
    return true;
  } catch (e) {
    console.error("falha ao agendar o aviso de uso de IA:", e);
    return false;
  }
}
