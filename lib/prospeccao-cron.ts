import "server-only";
import { grafiasDeDigitos } from "./avisos";
import { whatsappDoCliente } from "./admin";
import { fecharBusca } from "./campanhas-servidor";
import { enviarMensagemAtiva } from "./envio-ativo";
import { fonteApify } from "./fonte-apify";
import { diaIsoSP, inicioDoDiaSP } from "./fuso";
import {
  MESES_DE_RETENCAO,
  PARADAS_PARA_PAUSAR,
  proximoEnvioEm,
  respostasDosEnvios,
  textoParaLead,
  varianteDaOrdem,
  type EnvioObservado,
} from "./prospeccao";
import type { Supa } from "./supabase/tipos";

// O CRON DA PROSPECÇÃO (docs/plano-campanhas.md, seção 5.2): `GET
// /api/prospeccao/cron` a cada 5 minutos, chamado pelo pg_cron do Supabase (D3:
// a Vercel Hobby só roda cron uma vez por dia). Cada execução:
// 1. ativa as agendadas cujo início chegou e apaga da base, pela guarda LGPD (D8),
//    quem entrou há 12 meses e nunca respondeu;
// 2. fecha as buscas que o webhook da fonte não fechou;
// 3. manda UMA mensagem por campanha que está na vez (`proximo_envio_em`), pelo
//    `enviarMensagemAtiva`, com a linha de saída posta pelo código
//    (`textoParaLead`), e marca o próximo envio (`proximoEnvioEm`);
// 4. lê `chat_messages` (SÓ leitura) atrás das respostas e dos pedidos para parar,
//    e pausa a campanha com pedidos demais no dia (D6).
// Nada aqui escreve em tabela de conversa; nada aqui toca o n8n.

/** Quanto tempo a vez de uma campanha fica reservada para esta execução (uma que morrer devolve sozinha). */
const RESERVA_MS = 4 * 60_000;
/** Por quantos dias depois do envio o cron ainda procura a resposta. */
const OBSERVACAO_DIAS = 14;
/** Uma busca sem webhook depois disto é conferida na fonte pelo cron. */
const BUSCA_PRESA_MS = 8 * 60_000;
/** Campanhas atendidas por execução (cada uma manda no máximo uma mensagem). */
const CAMPANHAS_POR_EXECUCAO = 20;
/** Celulares por leitura de `chat_messages` (as grafias com e sem o nono dígito vão juntas). */
const FONES_POR_LEITURA = 25;
const LEAD_NENHUM = "00000000-0000-0000-0000-000000000000";

export interface ResumoDoTick {
  campanhas: number;
  enviados: number;
  pausadas: number;
  respostas: number;
}

export async function tickProspeccao(svc: Supa, agora: number): Promise<ResumoDoTick> {
  const agoraIso = new Date(agora).toISOString();
  const inicioDoDia = new Date(inicioDoDiaSP(diaIsoSP(agora))).toISOString();

  await chamar(svc.rpc("prospeccao_ativar_agendadas", { p_agora: agoraIso }));
  const corte = new Date(agora);
  corte.setUTCMonth(corte.getUTCMonth() - MESES_DE_RETENCAO);
  await chamar(svc.rpc("prospeccao_apagar_antigos", { p_antes: corte.toISOString() }));

  await fecharBuscasPresas(svc, agora);

  const { data: devidas, error } = await svc
    .from("prospeccao_campanhas")
    .select("id")
    .eq("status", "rodando")
    .lte("proximo_envio_em", agoraIso)
    .order("proximo_envio_em")
    .limit(CAMPANHAS_POR_EXECUCAO);
  if (error) throw error;
  let enviados = 0;
  let pausadas = 0;
  for (const c of devidas ?? []) {
    try {
      const r = await vezDaCampanha(svc, c.id, agora, inicioDoDia);
      if (r === "enviado") enviados++;
      if (r === "pausada") pausadas++;
    } catch (e) {
      // Uma campanha que falhou não segura as outras; a reserva vence e ela volta na próxima.
      console.error("prospecção, vez da campanha:", c.id, e);
    }
  }

  const respostas = await registrarRespostas(svc, agora, inicioDoDia);
  return { campanhas: devidas?.length ?? 0, enviados, pausadas, respostas };
}

async function chamar(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p;
  if (error) throw error;
}

async function fecharBuscasPresas(svc: Supa, agora: number) {
  if (!process.env.APIFY_TOKEN) return;
  const { data, error } = await svc
    .from("prospeccao_buscas")
    .select("id")
    .eq("status", "buscando")
    .lt("criada_em", new Date(agora - BUSCA_PRESA_MS).toISOString())
    .order("criada_em")
    .limit(5);
  if (error) throw error;
  for (const b of data ?? []) {
    try {
      await fecharBusca(svc, fonteApify, b.id);
    } catch (e) {
      console.error("prospecção, busca presa:", b.id, e);
    }
  }
}

/**
 * A VEZ de uma campanha: reserva e reivindica UM lead no SQL (duas execuções nunca
 * mandam para o mesmo lead), confere o número, manda e grava o resultado com o
 * próximo envio. Sem número conectado (ou sem instância), a campanha pausa sozinha
 * (D6) e o lead volta para a fila.
 */
async function vezDaCampanha(
  svc: Supa,
  campanhaId: string,
  agora: number,
  inicioDoDia: string,
): Promise<"enviado" | "pausada" | "nada"> {
  const { data, error } = await svc.rpc("prospeccao_reivindicar_envio", {
    p_campanha: campanhaId,
    p_agora: new Date(agora).toISOString(),
    p_inicio_do_dia: inicioDoDia,
    p_reserva_ate: new Date(agora + RESERVA_MS).toISOString(),
  });
  if (error) throw error;
  const vez = data?.[0];
  if (!vez || vez.situacao === "concluida") return "nada";
  const registrar = (lead: string, resultado: "enviado" | "falhou" | "devolver" | "adiar", variante: number, erro: string | null, proximo: number) =>
    chamar(
      svc.rpc("prospeccao_registrar_envio", {
        p_campanha: campanhaId,
        p_lead: lead,
        p_resultado: resultado,
        p_variante: variante,
        p_erro: erro,
        p_proximo: new Date(proximo).toISOString(),
      }),
    );
  if (vez.situacao === "cota_cheia") {
    await registrar(LEAD_NENHUM, "adiar", 0, null, proximoEnvioEm(agora, vez.enviados_hoje ?? 0));
    return "nada";
  }
  if (vez.situacao !== "enviar" || !vez.lead_id || !vez.telefone || !vez.client_id) return "nada";

  const pausar = async (motivo: string) => {
    await chamar(svc.rpc("prospeccao_pausar_campanha", { p_quem: null, p_id: campanhaId, p_motivo: motivo }));
    await registrar(vez.lead_id, "devolver", 0, null, agora + RESERVA_MS);
    return "pausada" as const;
  };
  if (!vez.instancia) return pausar("A empresa do número não tem WhatsApp");
  if ((await whatsappDoCliente(svc, vez.client_id)) !== "conectado") return pausar("WhatsApp desconectado");

  const variantes = vez.variantes ?? [];
  const variante = varianteDaOrdem(vez.ordem ?? 0, variantes.length);
  const resultado = await enviarMensagemAtiva({
    instancia: vez.instancia,
    telefone: vez.telefone,
    texto: textoParaLead(variantes[variante] ?? "", vez.nome ?? ""),
    numeroDeAvisos: vez.avisos,
  });
  const hoje = vez.enviados_hoje ?? 0;
  if (resultado === "enviado") {
    await registrar(vez.lead_id, "enviado", variante, null, proximoEnvioEm(agora, hoje + 1));
    return "enviado";
  }
  // Recusado pela Evolution, ou pulado (número de teste ou o número de avisos da
  // empresa): o lead sai da fila com o motivo e nunca é tentado de novo.
  const erro = resultado === "recusado" ? "O WhatsApp recusou o envio" : "Número de teste ou de avisos";
  await registrar(vez.lead_id, "falhou", 0, erro, proximoEnvioEm(agora, hoje));
  return "nada";
}

/**
 * As respostas: lê, por empresa e em lotes de celulares, as mensagens RECEBIDAS
 * depois dos envios observados (os dos últimos 14 dias) e grava a primeira
 * resposta e os pedidos para parar (`respostasDosEnvios`, puro). A pausa por
 * pedidos demais no dia (D6) acontece no SQL, na mesma transação.
 */
async function registrarRespostas(svc: Supa, agora: number, inicioDoDia: string): Promise<number> {
  const { data, error } = await svc.rpc("prospeccao_em_observacao", {
    p_desde: new Date(agora - OBSERVACAO_DIAS * 86_400_000).toISOString(),
  });
  if (error) throw error;
  const porEmpresa = new Map<string, EnvioObservado[]>();
  for (const o of data ?? []) {
    if (!o.client_id || !o.telefone || !o.enviado_em || (o.status !== "enviado" && o.status !== "respondeu")) continue;
    const lista = porEmpresa.get(o.client_id) ?? [];
    lista.push({ campanhaId: o.campanha_id, leadId: o.lead_id, telefone: o.telefone, situacao: o.status, enviadoEm: Date.parse(o.enviado_em) });
    porEmpresa.set(o.client_id, lista);
  }

  const itens: { campanha_id: string; lead_id: string; respondeu_em?: string; parou_em?: string }[] = [];
  for (const [clientId, envios] of porEmpresa) {
    const fones = [...new Set(envios.map((e) => e.telefone))];
    for (let i = 0; i < fones.length; i += FONES_POR_LEITURA) {
      const lote = fones.slice(i, i + FONES_POR_LEITURA);
      const doLote = envios.filter((e) => lote.includes(e.telefone));
      const desde = Math.min(...doLote.map((e) => e.enviadoEm));
      const { data: msgs, error: erroMsgs } = await svc
        .from("chat_messages")
        .select("phone, user_message, created_at")
        .eq("client_id", clientId)
        .in("phone", lote.flatMap(grafiasDeDigitos))
        .gt("created_at", new Date(desde).toISOString())
        .not("user_message", "is", null)
        .order("created_at")
        // eslint-disable-next-line no-restricted-syntax -- the cron's read of replies for 25 phones over 14 days (PostgREST cap), matched in memory by respostasDosEnvios; no screen
        .limit(1000);
      if (erroMsgs) throw erroMsgs;
      const recebidas = (msgs ?? []).flatMap((m) =>
        m.user_message && m.created_at ? [{ telefone: m.phone, texto: m.user_message, em: Date.parse(m.created_at) }] : [],
      );
      for (const r of respostasDosEnvios(doLote, recebidas)) {
        itens.push({
          campanha_id: r.campanhaId,
          lead_id: r.leadId,
          ...(r.respondeuEm !== undefined ? { respondeu_em: new Date(r.respondeuEm).toISOString() } : {}),
          ...(r.parouEm !== undefined ? { parou_em: new Date(r.parouEm).toISOString() } : {}),
        });
      }
    }
  }
  if (itens.length === 0) return 0;
  await chamar(
    svc.rpc("prospeccao_registrar_respostas", {
      p_itens: itens,
      p_inicio_do_dia: inicioDoDia,
      p_paradas: PARADAS_PARA_PAUSAR,
      p_motivo: "Mais de 2 pedidos para parar hoje",
    }),
  );
  return itens.length;
}
