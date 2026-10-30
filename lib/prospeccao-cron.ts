import "server-only";
import { grafiasDeDigitos } from "./avisos";
import { whatsappDoCliente } from "./admin";
import { enviarMensagemAtiva } from "./envio-ativo";
import { inicioDoDiaSP, diaIsoSP } from "./fuso";
import {
  PARADAS_PARA_PAUSAR,
  MESES_DE_RETENCAO,
  ehPedidoParaParar,
  proximoEnvioEm,
  textoParaLead,
  varianteDaOrdem,
} from "./prospeccao";
import { createServiceClient } from "./supabase/service";

const RESERVA_MS = 4 * 60_000;
const OBSERVACAO_DIAS = 14;

export async function tickProspeccao(agoraMs: number) {
  const svc = createServiceClient();
  const agora = new Date(agoraMs).toISOString();
  const inicioDia = new Date(inicioDoDiaSP(diaIsoSP(agoraMs))).toISOString();
  const reservaAte = new Date(agoraMs + RESERVA_MS).toISOString();

  await svc.rpc("prospeccao_ativar_agendadas", { p_agora: agora });
  const antesRet = new Date(agoraMs);
  antesRet.setMonth(antesRet.getMonth() - MESES_DE_RETENCAO);
  await svc.rpc("prospeccao_apagar_antigos", { p_antes: antesRet.toISOString() });

  await pollBuscasPresas(svc, agoraMs);

  const { data: due } = await svc
    .from("prospeccao_campanhas")
    .select("id")
    .eq("status", "rodando")
    .lte("proximo_envio_em", agora)
    .limit(20);
  let enviados = 0;
  for (const c of due ?? []) {
    const r = await processarCampanha(svc, c.id, agoraMs, inicioDia, reservaAte);
    if (r === "enviado") enviados++;
  }

  await registrarRespostas(svc, agoraMs, inicioDia);

  return { enviados, campanhas: due?.length ?? 0 };
}

async function pollBuscasPresas(svc: ReturnType<typeof createServiceClient>, agoraMs: number) {
  if (!process.env.APIFY_TOKEN) return;
  const limite = new Date(agoraMs - 8 * 60_000).toISOString();
  const { data } = await svc
    .from("prospeccao_buscas")
    .select("id, termo, fonte_execucao_id")
    .eq("status", "buscando")
    .lt("criada_em", limite)
    .limit(5);
  if (!data?.length) return;
  const { fonteApify } = await import("./fonte-apify");
  const { concluirBusca } = await import("./campanhas-servidor");
  for (const b of data) {
    if (!b.fonte_execucao_id) continue;
    try {
      const bruto = await fonteApify.lerDataset(b.fonte_execucao_id);
      const termo = (b.termo ?? "").split(",")[0]?.trim() || "empresa";
      const itens = bruto.map((item) => fonteApify.mapearItem(item, termo));
      if (itens.length === 0) continue;
      await concluirBusca(svc, b.id, itens, null);
    } catch {
      /* next cron */
    }
  }
}

async function processarCampanha(
  svc: ReturnType<typeof createServiceClient>,
  campanhaId: string,
  agoraMs: number,
  inicioDia: string,
  reservaAte: string,
): Promise<"enviado" | "skip"> {
  const { data: rows, error } = await svc.rpc("prospeccao_reivindicar_envio", {
    p_campanha: campanhaId,
    p_agora: new Date(agoraMs).toISOString(),
    p_inicio_do_dia: inicioDia,
    p_reserva_ate: reservaAte,
  });
  if (error || !rows?.length) return "skip";
  const row = rows[0];
  if (row.situacao === "concluida" || row.situacao === "cota_cheia") {
    const proximo = proximoEnvioEm(agoraMs, row.enviados_hoje ?? 0);
    await svc.rpc("prospeccao_registrar_envio", {
      p_campanha: campanhaId,
      p_lead: row.lead_id ?? "00000000-0000-0000-0000-000000000000",
      p_resultado: "adiar",
      p_variante: 0,
      p_erro: null,
      p_proximo: new Date(proximo).toISOString(),
    });
    return "skip";
  }
  if (row.situacao !== "enviar" || !row.lead_id || !row.telefone || !row.client_id) return "skip";

  const wa = await whatsappDoCliente(svc, row.client_id);
  if (wa !== "conectado") {
    await svc.rpc("prospeccao_pausar_campanha", {
      p_quem: null,
      p_id: campanhaId,
      p_motivo: "WhatsApp desconectado",
    });
    await svc.rpc("prospeccao_registrar_envio", {
      p_campanha: campanhaId,
      p_lead: row.lead_id,
      p_resultado: "devolver",
      p_variante: 0,
      p_erro: "desconectado",
      p_proximo: new Date(agoraMs + RESERVA_MS).toISOString(),
    });
    return "skip";
  }

  const variantes = row.variantes ?? [];
  const idx = varianteDaOrdem(row.ordem ?? 0, variantes.length);
  const modelo = variantes[idx] ?? "";
  const texto = textoParaLead(modelo, row.nome ?? "empresa");
  const res = await enviarMensagemAtiva({
    instancia: row.instancia,
    telefone: row.telefone,
    texto,
    numeroDeAvisos: row.avisos,
  });
  const enviadosHoje = (row.enviados_hoje ?? 0) + (res === "enviado" ? 1 : 0);
  const proximo = proximoEnvioEm(agoraMs, enviadosHoje);
  if (res === "enviado") {
    await svc.rpc("prospeccao_registrar_envio", {
      p_campanha: campanhaId,
      p_lead: row.lead_id,
      p_resultado: "enviado",
      p_variante: idx,
      p_erro: null,
      p_proximo: new Date(proximo).toISOString(),
    });
    return "enviado";
  }
  await svc.rpc("prospeccao_registrar_envio", {
    p_campanha: campanhaId,
    p_lead: row.lead_id,
    p_resultado: res === "recusado" ? "falhou" : "devolver",
    p_variante: 0,
    p_erro: res,
    p_proximo: new Date(proximo).toISOString(),
  });
  return "skip";
}

async function registrarRespostas(svc: ReturnType<typeof createServiceClient>, agoraMs: number, inicioDia: string) {
  const desde = new Date(agoraMs - OBSERVACAO_DIAS * 86_400_000).toISOString();
  const { data: obs } = await svc.rpc("prospeccao_em_observacao", { p_desde: desde });
  if (!obs?.length) return;
  const itens: { campanha_id: string; lead_id: string; respondeu_em?: string; parou_em?: string }[] = [];
  for (const o of obs) {
    if (!o.client_id || !o.telefone || !o.enviado_em) continue;
    const grafias = grafiasDeDigitos(o.telefone);
    const { data: msgs } = await svc
      .from("chat_messages")
      .select("user_message, created_at")
      .eq("client_id", o.client_id)
      .in("phone", grafias)
      .gt("created_at", o.enviado_em)
      .not("user_message", "is", null)
      .order("created_at", { ascending: true })
      .limit(20);
    const inbound = (msgs ?? []).filter((m) => m.user_message?.trim());
    if (!inbound.length) continue;
    const first = inbound[0];
    const parou = inbound.some((m) => ehPedidoParaParar(m.user_message ?? ""));
    if (o.status === "enviado" && first.created_at) {
      itens.push({
        campanha_id: o.campanha_id,
        lead_id: o.lead_id,
        respondeu_em: first.created_at,
        ...(parou ? { parou_em: first.created_at } : {}),
      });
    } else if (parou) {
      itens.push({ campanha_id: o.campanha_id, lead_id: o.lead_id, parou_em: first.created_at ?? new Date().toISOString() });
    }
  }
  if (!itens.length) return;
  await svc.rpc("prospeccao_registrar_respostas", {
    p_itens: itens,
    p_inicio_do_dia: inicioDia,
    p_paradas: PARADAS_PARA_PAUSAR,
    p_motivo: "Muitos pedidos para parar hoje",
  });
}
