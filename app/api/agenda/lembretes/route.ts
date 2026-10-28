import { NextResponse, after } from "next/server";
import { segredoConfere } from "@/lib/segredo";
import { createServiceClient } from "@/lib/supabase/service";
import { execucaoDoDia, janelaDoLembrete, normalizarConfigDaAgenda, textoDoLembrete } from "@/lib/agenda";
import { REGRAS_DO_LEMBRETE, enviarMensagemAtiva, sortearPausa } from "@/lib/envio-ativo";
import { accessState } from "@/lib/billing";
import { horarioCadastrado } from "@/lib/horarios";
import { diaIsoSP, inicioDoDiaSP, somarDias } from "@/lib/fuso";
import { nomeDoContato } from "@/lib/inbox";
import { LEMBRETE } from "@/lib/mensagem";

// LEMBRETE DA AGENDA (decisões do dono, 28/10/2026): UMA execução por dia, às
// 9h de São Paulo, pelo Vercel Cron (`vercel.json`, "0 12 * * *" em UTC; no
// Hobby o disparo varia até 59 min). Protegida por `CRON_SECRET`: a Vercel manda
// `Authorization: Bearer <CRON_SECRET>` sozinha quando a env existe; sem ela a
// rota nunca abre. Nada no n8n.
//
// Por empresa com a agenda e o lembrete ligados, só em dia que ela abre:
// os confirmados de amanhã até o próximo dia aberto (`janelaDoLembrete`), mais
// os que FALHARAM antes e ainda não passaram (nova tentativa). Pula conta
// desativada, bloqueada, com o teste vencido ou o pagamento atrasado. Manda
// mesmo para quem nunca escreveu (decisão do dono).
//
// Intervalo aleatório de 20 a 60 s ENTRE as mensagens da MESMA empresa; as
// empresas andam em paralelo (uma fila por empresa, não uma fila global). Uma
// execução tem tempo limitado (`maxDuration`): quando a fila não cabe, a rota
// para com folga e chama a si mesma (`?continuacao=1`), que começa cada fila com
// uma pausa inteira, então o intervalo entre duas mensagens nunca fica abaixo
// de 20 s. Idempotente: cada horário é REIVINDICADO antes de enviar
// (`lembrete_enviado_em` de null para agora); recusado, volta a null e grava
// `lembrete_falhou_em` (ícone na central "Clientes").

// Com Fluid Compute (padrão dos projetos novos na Vercel) o limite é 300 s;
// conferir no painel do projeto. Sem ele, baixar para 60 e `ORCAMENTO_MS` para 50 s.
export const maxDuration = 300;
const ORCAMENTO_MS = 280_000;
/** Folga para o envio em si caber depois da pausa. */
const FOLGA_DO_ENVIO_MS = 15_000;

const LOTE_DE_EMPRESAS = 100;
const MAX_POR_EMPRESA = 500;

type Svc = ReturnType<typeof createServiceClient>;
interface Item {
  id: number;
  phone: string;
  servico_nome: string;
  inicio: string;
  /** Nome do contato (dados_cliente), para o "Oi, {nome}!" do lembrete. */
  nome?: string | null;
}
interface Fila {
  clientId: string;
  empresa: string;
  instancia: string | null;
  avisos: string | null;
  itens: Item[];
}

export async function GET(req: Request) {
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!segredoConfere(recebido, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const t0 = Date.now();
  const continuacao = new URL(req.url).searchParams.get("continuacao") === "1";
  const svc = createServiceClient();
  const hoje = diaIsoSP(t0);
  const resumo = { empresas: 0, enviados: 0, recusados: 0, pulados: 0, erros: 0, faltou: false };

  const filas: Fila[] = [];
  let depois: string | null = null;
  for (;;) {
    let q = svc
      .from("clients")
      .select(
        "id, name, agent_config, agenda_config, evolution_instance, notify_group_jid, subscription_status, trial_ends_at, grace_until, vitalicio_desde, bloqueado_em, desativada_em"
      )
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
      // Desativada, bloqueada, teste vencido ou pagamento atrasado: não manda (dono).
      const acesso = accessState(e, new Date(t0));
      if (acesso.blocked || acesso.kind === "carencia") continue;
      const config = normalizarConfigDaAgenda(e.agenda_config);
      if (!config.ativa || !config.lembrete) continue;
      const hours = horarioCadastrado(e.agent_config);
      const janela = hours ? janelaDoLembrete(hoje, hours) : null;
      if (!janela) continue;
      const itens = await pendentesDaEmpresa(svc, e.id, janela, hoje, t0);
      if (itens === null) {
        resumo.erros++;
        continue;
      }
      if (itens.length === 0) continue;
      resumo.empresas++;
      filas.push({ clientId: e.id, empresa: e.name, instancia: e.evolution_instance, avisos: e.notify_group_jid, itens });
    }
    if (empresas.length < LOTE_DE_EMPRESAS) break;
  }

  // Uma fila por empresa, em paralelo.
  const resultados = await Promise.all(filas.map((f) => andarFila(svc, f, t0, continuacao)));
  for (const r of resultados) {
    resumo.enviados += r.enviados;
    resumo.recusados += r.recusados;
    resumo.pulados += r.pulados;
    if (r.faltou) resumo.faltou = true;
  }

  // Não coube: a próxima execução continua de onde esta parou (reivindicação impede repetir).
  if (resumo.faltou) {
    const proxima = new URL("/api/agenda/lembretes?continuacao=1", req.url).toString();
    after(async () => {
      try {
        await fetch(proxima, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
      } catch (e) {
        console.error("lembretes: falha ao chamar a continuação:", e);
      }
    });
  }
  return NextResponse.json({ ok: true, dia: hoje, continuacao, ...resumo });
}

/** Os horários desta execução (janela) e as novas tentativas (falharam, ainda não passaram). */
async function pendentesDaEmpresa(
  svc: Svc,
  clientId: string,
  janela: { de: string; ate: string },
  hoje: string,
  agora: number
): Promise<Item[] | null> {
  const colunas = "id, phone, servico_nome, inicio";
  const [daJanela, tentativas] = await Promise.all([
    svc
      .from("agendamentos")
      .select(colunas)
      .eq("client_id", clientId)
      .eq("status", "confirmado")
      .is("lembrete_enviado_em", null)
      .gte("inicio", new Date(inicioDoDiaSP(janela.de)).toISOString())
      .lt("inicio", new Date(inicioDoDiaSP(somarDias(janela.ate, 1))).toISOString())
      // Marcado depois da execução das 9h de hoje não entra (a confirmação basta).
      .lt("created_at", new Date(execucaoDoDia(hoje)).toISOString())
      .order("inicio")
      .limit(MAX_POR_EMPRESA),
    svc
      .from("agendamentos")
      .select(colunas)
      .eq("client_id", clientId)
      .eq("status", "confirmado")
      .is("lembrete_enviado_em", null)
      .not("lembrete_falhou_em", "is", null)
      .gt("inicio", new Date(agora).toISOString())
      .order("inicio")
      .limit(MAX_POR_EMPRESA),
  ]);
  if (daJanela.error || tentativas.error) {
    console.error("lembretes: falha ao ler os horários:", (daJanela.error ?? tentativas.error)?.message);
    return null;
  }
  const vistos = new Set<number>();
  const itens: Item[] = [...(tentativas.data ?? []), ...(daJanela.data ?? [])].filter(
    (h) => !vistos.has(h.id) && vistos.add(h.id)
  );
  // Os nomes numa leitura só (dados_cliente não tem FK com agendamentos).
  const fones = [...new Set(itens.map((h) => h.phone))];
  if (fones.length > 0) {
    const { data: contatos } = await svc
      .from("dados_cliente")
      .select("telefone, display_name, nomewpp")
      .eq("client_id", clientId)
      .in("telefone", fones);
    const nomes = new Map((contatos ?? []).map((c) => [c.telefone, nomeDoContato(c)]));
    for (const h of itens) h.nome = nomes.get(h.phone) ?? null;
  }
  return itens;
}

/** Manda a fila de UMA empresa, com a pausa aleatória entre as mensagens, até o tempo acabar. */
async function andarFila(
  svc: Svc,
  f: Fila,
  t0: number,
  continuacao: boolean
): Promise<{ enviados: number; recusados: number; pulados: number; faltou: boolean }> {
  const r = { enviados: 0, recusados: 0, pulados: 0, faltou: false };
  let primeira = !continuacao;
  for (const h of f.itens) {
    if (REGRAS_DO_LEMBRETE.tetoDiario !== null && r.enviados >= REGRAS_DO_LEMBRETE.tetoDiario) break;
    // Pausa ANTES de cada mensagem (menos a primeira da primeira execução).
    if (!primeira) {
      const pausa = sortearPausa(REGRAS_DO_LEMBRETE);
      if (Date.now() - t0 + pausa + FOLGA_DO_ENVIO_MS > ORCAMENTO_MS) {
        r.faltou = true;
        break;
      }
      await new Promise((ok) => setTimeout(ok, pausa));
    }
    primeira = false;
    // Reivindica antes de enviar: duas execuções nunca mandam o mesmo lembrete.
    const { data: meu } = await svc
      .from("agendamentos")
      .update({ lembrete_enviado_em: new Date().toISOString() })
      .eq("id", h.id)
      .is("lembrete_enviado_em", null)
      .select("id");
    if (!meu || meu.length === 0) continue;
    const texto = textoDoLembrete({ nome: h.nome, empresa: f.empresa, servico: h.servico_nome, inicio: Date.parse(h.inicio), agora: Date.now() });
    const res = await enviarMensagemAtiva({ instancia: f.instancia, telefone: h.phone, texto, numeroDeAvisos: f.avisos });
    if (res === "enviado") {
      r.enviados++;
      await svc.from("agendamentos").update({ lembrete_falhou_em: null }).eq("id", h.id);
      // Na conversa do contato: o time vê (rótulo "Lembrete automático") e a IA tem
      // no histórico. `lembrete` não é resposta da IA nem do time (lib/mensagem.ts).
      const { error: gErr } = await svc
        .from("chat_messages")
        .insert({ client_id: f.clientId, phone: h.phone, bot_message: texto, message_type: LEMBRETE });
      if (gErr) console.error("lembretes: enviado, mas não gravado na conversa:", gErr.message);
    } else if (res === "recusado") {
      r.recusados++;
      // Não saiu: devolve e marca a falha (alerta na central; nova tentativa amanhã).
      await svc
        .from("agendamentos")
        .update({ lembrete_enviado_em: null, lembrete_falhou_em: new Date().toISOString() })
        .eq("id", h.id);
    } else {
      // Teste (DDD 00), número de avisos ou empresa sem WhatsApp: fica como tratado.
      r.pulados++;
    }
  }
  return r;
}
