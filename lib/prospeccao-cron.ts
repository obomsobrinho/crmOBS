import "server-only";
import { grafiasDeDigitos } from "./avisos";
import { desistirDaBusca, estadoDoNumero, fecharBusca } from "./campanhas-servidor";
import { NOME_AUSENTE } from "./apify-campos";
import { enviarMensagemAtiva } from "./envio-ativo";
import { fonteApify } from "./fonte-apify";
import { diaIsoSP, inicioDoDiaSP } from "./fuso";
import {
  MESES_DE_RETENCAO,
  PARADAS_PARA_PAUSAR,
  dentroDaJanela,
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
/** Mensagens por página dessa leitura (o teto do PostgREST); a leitura segue de página em página até o fim. */
const MENSAGENS_POR_PAGINA = 1000;
const LEAD_NENHUM = "00000000-0000-0000-0000-000000000000";
/** Depois disto o tick não começa outra campanha (a rota tem `maxDuration` de 120 s). */
const ORCAMENTO_DE_ENVIO_MS = 60_000;
/** Uma busca ainda "buscando" depois disto é dada como perdida (execução sumida na fonte). */
const BUSCA_PERDIDA_MS = 2 * 60 * 60_000;

export interface ResumoDoTick {
  campanhas: number;
  enviados: number;
  pausadas: number;
  respostas: number;
}

export async function tickProspeccao(svc: Supa, agora: number): Promise<ResumoDoTick> {
  const comeco = Date.now();
  const agoraIso = new Date(agora).toISOString();
  const inicioDoDia = new Date(inicioDoDiaSP(diaIsoSP(agora))).toISOString();

  const corte = new Date(agora);
  corte.setUTCMonth(corte.getUTCMonth() - MESES_DE_RETENCAO);
  await Promise.all([
    chamar(svc.rpc("prospeccao_ativar_agendadas", { p_agora: agoraIso })),
    chamar(svc.rpc("prospeccao_apagar_antigos", { p_antes: corte.toISOString() })),
  ]);

  // As respostas e os pedidos para parar ANTES dos envios: um "SAIR" lido agora já
  // tira o lead de toda fila neste tick. Se a leitura falhar, este tick não envia.
  const respostas = await registrarRespostas(svc, agora, inicioDoDia);

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
    // Folga para a rota terminar dentro do `maxDuration`: o resto fica para o próximo tick.
    if (Date.now() - comeco > ORCAMENTO_DE_ENVIO_MS) break;
    try {
      // Fora da janela (uma agendada que ativou de noite ou no domingo): só empurra a vez
      // para a próxima abertura. A janela é conferida aqui, num lugar só, para todo envio.
      if (!dentroDaJanela(agora)) {
        await adiar(svc, c.id, proximoEnvioEm(agora, 0));
        continue;
      }
      const r = await vezDaCampanha(svc, c.id, agora, inicioDoDia);
      if (r === "enviado") enviados++;
      if (r === "pausada") pausadas++;
    } catch (e) {
      // Uma campanha que falhou não segura as outras; a reserva vence e ela volta na próxima.
      console.error("prospecção, vez da campanha:", c.id, e);
    }
  }
  return { campanhas: devidas?.length ?? 0, enviados, pausadas, respostas };
}

/** Só muda a vez da campanha (`adiar` não toca em lead nenhum). */
function adiar(svc: Supa, campanhaId: string, proximo: number) {
  return chamar(
    svc.rpc("prospeccao_registrar_envio", {
      p_campanha: campanhaId,
      p_lead: LEAD_NENHUM,
      p_resultado: "adiar",
      p_variante: 0,
      p_erro: null,
      p_proximo: new Date(proximo).toISOString(),
    }),
  );
}

async function chamar(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p;
  if (error) throw error;
}

async function fecharBuscasPresas(svc: Supa, agora: number) {
  if (!process.env.APIFY_TOKEN) return;
  const { data, error } = await svc
    .from("prospeccao_buscas")
    .select("id, criada_em")
    .eq("status", "buscando")
    .lt("criada_em", new Date(agora - BUSCA_PRESA_MS).toISOString())
    .order("criada_em")
    .limit(5);
  if (error) throw error;
  for (const b of data ?? []) {
    // Passou do prazo e a fonte ainda não fechou (ou nem responde): desiste, e a fila
    // de buscas paradas não fica presa nas mesmas cinco para sempre.
    const perdida = Date.parse(b.criada_em) < agora - BUSCA_PERDIDA_MS;
    try {
      const situacao = await fecharBusca(svc, fonteApify, b.id);
      if (situacao === "buscando" && perdida) await desistirDaBusca(svc, b.id);
    } catch (e) {
      console.error("prospecção, busca presa:", b.id, e);
      if (perdida) await desistirDaBusca(svc, b.id).catch(() => undefined);
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
  if (vez.situacao === "cota_cheia") {
    await adiar(svc, campanhaId, proximoEnvioEm(agora, vez.enviados_hoje ?? 0));
    return "nada";
  }
  if (vez.situacao !== "enviar" || !vez.lead_id || !vez.telefone || !vez.client_id) return "nada";
  const lead = vez.lead_id;
  const registrar = (resultado: "enviado" | "falhou" | "devolver", variante: number, erro: string | null, proximo: number) =>
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

  // O lead já está reivindicado ("enviado" no banco, para nunca sair duas vezes).
  // Até a mensagem ser entregue à Evolution, qualquer falha o devolve à fila.
  let entregueAEvolution = false;
  try {
    const hoje = vez.enviados_hoje ?? 0;
    const pausar = async (motivo: string) => {
      await chamar(svc.rpc("prospeccao_pausar_campanha", { p_quem: null, p_id: campanhaId, p_motivo: motivo }));
      await registrar("devolver", 0, null, agora + RESERVA_MS);
      return "pausada" as const;
    };
    if (!vez.instancia) return await pausar("A empresa do número não tem WhatsApp");
    const estado = await estadoDoNumero(vez.instancia);
    // Só "desconectado" pausa (D6); "reconectando" ou uma falha da Evolution tenta no próximo tick.
    if (estado === "desconectado") return await pausar("WhatsApp desconectado");
    if (estado !== "conectado") {
      await registrar("devolver", 0, null, agora + RESERVA_MS);
      return "nada";
    }
    // Um nome que a fonte não trouxe não vai para dentro da mensagem ("Achei a Sem nome...").
    const empresa = (vez.nome ?? "").trim();
    if (!empresa || empresa === NOME_AUSENTE) {
      await registrar("falhou", 0, "Lead sem o nome da empresa", proximoEnvioEm(agora, hoje));
      return "nada";
    }
    const variantes = vez.variantes ?? [];
    const variante = varianteDaOrdem(vez.ordem ?? 0, variantes.length);
    entregueAEvolution = true;
    const resultado = await enviarMensagemAtiva({
      instancia: vez.instancia,
      telefone: vez.telefone,
      texto: textoParaLead(variantes[variante] ?? "", empresa),
      numeroDeAvisos: vez.avisos,
    });
    if (resultado === "enviado") {
      await registrar("enviado", variante, null, proximoEnvioEm(agora, hoje + 1));
      return "enviado";
    }
    // Sem confirmação da Evolution (recusa, erro ou tempo esgotado: a mensagem pode até
    // ter saído) ou pulado (número de teste ou o de avisos): o lead sai da fila com o
    // motivo e nunca é tentado de novo, para nunca receber duas vezes.
    const erro = resultado === "recusado" ? "O WhatsApp não confirmou o envio" : "Número de teste ou de avisos";
    await registrar("falhou", 0, erro, proximoEnvioEm(agora, hoje));
    return "nada";
  } catch (e) {
    if (!entregueAEvolution) await registrar("devolver", 0, null, agora + RESERVA_MS).catch(() => undefined);
    throw e;
  }
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
    const porFone = new Map<string, EnvioObservado[]>();
    for (const e of envios) {
      const g = porFone.get(e.telefone);
      if (g) g.push(e);
      else porFone.set(e.telefone, [e]);
    }
    const fones = [...porFone.keys()];
    for (let i = 0; i < fones.length; i += FONES_POR_LEITURA) {
      const lote = fones.slice(i, i + FONES_POR_LEITURA);
      const doLote = lote.flatMap((f) => porFone.get(f) ?? []);
      const recebidas = await mensagensRecebidas(svc, clientId, lote, Math.min(...doLote.map((e) => e.enviadoEm)));
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

/**
 * As mensagens RECEBIDAS por uma empresa, de alguns celulares, depois de `desde`: de
 * página em página na ordem (`created_at`, `id`), a mesma do índice da tabela por
 * empresa, telefone e data, até o fim, para um "SAIR" depois de uma conversa longa
 * com a IA nunca ficar de fora.
 */
async function mensagensRecebidas(svc: Supa, clientId: string, fones: string[], desde: number) {
  const recebidas: { telefone: string; texto: string; em: number }[] = [];
  let cursor: { em: string; id: number } | null = null;
  for (;;) {
    let q = svc
      .from("chat_messages")
      .select("id, phone, user_message, created_at")
      .eq("client_id", clientId)
      .in("phone", fones.flatMap(grafiasDeDigitos))
      .gt("created_at", new Date(desde).toISOString())
      .not("user_message", "is", null);
    // O instante vai entre aspas: tem ":" e "+", que o `or` do PostgREST leria como sintaxe.
    if (cursor) q = q.or(`created_at.gt."${cursor.em}",and(created_at.eq."${cursor.em}",id.gt.${cursor.id})`);
    const { data, error } = await q.order("created_at").order("id").limit(MENSAGENS_POR_PAGINA);
    if (error) throw error;
    for (const m of data ?? []) {
      if (m.user_message && m.created_at) recebidas.push({ telefone: m.phone, texto: m.user_message, em: Date.parse(m.created_at) });
    }
    const ultima = data?.[data.length - 1];
    if (!data || data.length < MENSAGENS_POR_PAGINA || !ultima?.created_at) return recebidas;
    cursor = { em: ultima.created_at, id: ultima.id };
  }
}
