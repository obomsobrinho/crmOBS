import { NextResponse } from "next/server";
import { segredoConfere } from "@/lib/segredo";
import { createServiceClient } from "@/lib/supabase/service";
import { execucaoDoDia, janelaDoLembrete, normalizarConfigDaAgenda, textoDoLembrete } from "@/lib/agenda";
import { REGRAS_DO_LEMBRETE, enviarMensagemAtiva, pausaEntreEnvios } from "@/lib/envio-ativo";
import { horarioCadastrado } from "@/lib/horarios";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";

// LEMBRETE DA AGENDA (decisão do dono, 28/10/2026): UMA execução por dia, às
// 9h de São Paulo, pelo Vercel Cron (`vercel.json`, "0 12 * * *" em UTC; no
// plano Hobby o disparo varia até 59 min). Protegida pelo segredo `CRON_SECRET`
// (o Vercel manda `Authorization: Bearer <CRON_SECRET>` quando a env existe;
// sem a env a rota nunca abre). Nada no n8n.
//
// Para cada empresa com a agenda ligada e o lembrete ligado, só em dia que ela
// abre (horário de atendimento): os horários confirmados de amanhã até o
// próximo dia aberto, inclusive (`janelaDoLembrete`). Marcado depois da
// execução não entra. Idempotente: cada horário é REIVINDICADO antes de enviar
// (`lembrete_enviado_em` de null para agora, condicional); falhou, volta a null.
//
// Precisa da migration aplicada (coluna `lembrete_enviado_em`). PENDENTE antes
// de ligar: teto, intervalo, conversa recente e "responda SAIR" (lib/envio-ativo.ts).

export const maxDuration = 300;

const LOTE_DE_EMPRESAS = 100;
const MAX_POR_EMPRESA = 500;

export async function GET(req: Request) {
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!segredoConfere(recebido, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const svc = createServiceClient();
  const agora = Date.now();
  const hoje = diaIsoSP(agora);
  const resumo = { empresas: 0, enviados: 0, recusados: 0, pulados: 0, erros: 0 };

  // Empresas com a agenda ligada, de 100 em 100 por id (nunca a tabela inteira de uma vez).
  let depois: string | null = null;
  for (;;) {
    let q = svc
      .from("clients")
      .select("id, name, agent_config, agenda_config, evolution_instance, notify_group_jid, bloqueado_em, desativada_em")
      .eq("agenda_config->>ativa", "true")
      .order("id")
      .limit(LOTE_DE_EMPRESAS);
    if (depois) q = q.gt("id", depois);
    const { data: empresas, error } = await q;
    if (error) {
      console.error("lembretes: falha ao ler as empresas:", error.message);
      return NextResponse.json({ error: "falha ao ler as empresas" }, { status: 500 });
    }
    if (!empresas || empresas.length === 0) break;
    depois = empresas[empresas.length - 1].id;

    for (const e of empresas) {
      // Conta desativada ou bloqueada pelo dono do produto não manda nada.
      // PENDENTE (dono): conta com o teste vencido ou pagamento atrasado.
      if (e.desativada_em || e.bloqueado_em) continue;
      const config = normalizarConfigDaAgenda(e.agenda_config);
      if (!config.ativa || !config.lembrete) continue;
      const hours = horarioCadastrado(e.agent_config);
      const janela = hours ? janelaDoLembrete(hoje, hours) : null;
      if (!janela) continue;
      resumo.empresas++;

      const { data: horarios, error: hErr } = await svc
        .from("agendamentos")
        .select("id, phone, servico_nome, inicio")
        .eq("client_id", e.id)
        .eq("status", "confirmado")
        .is("lembrete_enviado_em", null)
        .gte("inicio", new Date(inicioDoDiaSP(janela.de)).toISOString())
        .lt("inicio", new Date(inicioDoDiaSP(somarDias(janela.ate, 1))).toISOString())
        .lt("created_at", new Date(execucaoDoDia(hoje)).toISOString())
        .order("inicio")
        .limit(MAX_POR_EMPRESA);
      if (hErr) {
        resumo.erros++;
        console.error("lembretes: falha ao ler os horários:", hErr.message);
        continue;
      }

      let enviadosNaEmpresa = 0;
      for (const h of horarios ?? []) {
        if (REGRAS_DO_LEMBRETE.tetoDiario !== null && enviadosNaEmpresa >= REGRAS_DO_LEMBRETE.tetoDiario) break;
        // Reivindica antes de enviar: duas execuções nunca mandam o mesmo lembrete.
        const { data: meu } = await svc
          .from("agendamentos")
          .update({ lembrete_enviado_em: new Date().toISOString() })
          .eq("id", h.id)
          .is("lembrete_enviado_em", null)
          .select("id");
        if (!meu || meu.length === 0) continue;
        const r = await enviarMensagemAtiva({
          instancia: e.evolution_instance,
          telefone: h.phone,
          texto: textoDoLembrete({ empresa: e.name, servico: h.servico_nome, inicio: Date.parse(h.inicio), agora }),
          numeroDeAvisos: e.notify_group_jid,
        });
        if (r === "enviado") {
          enviadosNaEmpresa++;
          resumo.enviados++;
          await pausaEntreEnvios(REGRAS_DO_LEMBRETE);
        } else {
          if (r === "recusado") resumo.recusados++;
          else resumo.pulados++;
          // Não saiu: devolve, para a próxima execução que ainda cubra o dia tentar de novo.
          if (r === "recusado") await svc.from("agendamentos").update({ lembrete_enviado_em: null }).eq("id", h.id);
        }
      }
    }
    if (empresas.length < LOTE_DE_EMPRESAS) break;
  }
  return NextResponse.json({ ok: true, dia: hoje, ...resumo });
}
