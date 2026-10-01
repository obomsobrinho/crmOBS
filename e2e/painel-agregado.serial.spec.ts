import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { servico, tenantDeTeste } from "./semente";
import {
  agregarLinhas,
  massaDeTeste,
  NUMERO_AVISOS,
  type LinhaRef,
  type QualRef,
} from "./painel-agregado-referencia";
import { provarIgualdade } from "./painel-agregado-prova";
import { agregadoDe, montarJanelas } from "../lib/painel-agregado";
import { carregarAgregadoDoPainel } from "../lib/painel-dados";
import { foraDaLista } from "../lib/inbox-lista";
import { mesFechado, UM_MINUTO } from "../lib/valor";
import type { BusinessHours } from "../lib/agent-prompt";
/* eslint-disable @typescript-eslint/no-explicit-any */

// O BANCO AGREGA IGUAL À REGRA EM TS (02/10/2026, R-04, R-06, R-18, R-19).
//
// Duas provas num teste só, contra o banco de verdade (tenant de teste):
//  1. `painel_janelas` e `painel_series` devolvem EXATAMENTE o que
//     `agregarLinhas` (a referência executável, que só usa lib/mensagem.ts e
//     lib/valor.ts) calcula sobre as mesmas linhas. É a paridade da regra
//     "quem respondeu" escrita em SQL: a massa tem todas as combinações de
//     message_type (null, text, manual, imported, audio) e de texto (recebida,
//     resposta, mista, só espaços, vazia), as duas grafias do número de avisos,
//     e limites de janela quebrados (milissegundos) sobre linhas com
//     microssegundos.
//  2. O painel calculado dessas agregações é IDÊNTICO ao calculado das linhas
//     pelas funções antigas (`provarIgualdade`).
//
// A massa passa de 1.000 linhas (o "Max rows" do PostgREST, que cortava o painel
// antigo em silêncio): as linhas são lidas de volta paginadas, e os números do
// banco têm que bater mesmo assim. Telefones impossíveis (DDD 00), apagados no
// fim, junto com as conversas que o gatilho cria.

const PREF = "55000000081";
const AVISOS_SEM_NONO = "550012345678@s.whatsapp.net";

const COMERCIAL: BusinessHours = {
  seg: { open: true, from: "08:00", to: "18:00" },
  ter: { open: true, from: "08:00", to: "18:00" },
  qua: { open: true, from: "08:00", to: "18:00" },
  qui: { open: true, from: "08:00", to: "18:00" },
  sex: { open: true, from: "08:00", to: "18:00" },
  sab: { open: true, from: "08:00", to: "12:30" },
  dom: { open: false, from: "08:00", to: "18:00" },
};

async function limpar(sb: SupabaseClient) {
  for (const t of ["chat_messages", "conversation_qualifications", "conversations"]) {
    await sb.from(t).delete().like("phone", `${PREF}%`);
    await sb.from(t).delete().in("phone", [NUMERO_AVISOS, AVISOS_SEM_NONO]);
  }
}

async function lerTudo<T>(sb: SupabaseClient, tabela: string, colunas: string, clientId: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb
      .from(tabela)
      .select(colunas)
      .eq("client_id", clientId)
      .order("id", { ascending: true })
      .range(de, de + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

test("o banco agrega igual à regra em TS, com mais de 1.000 linhas", async () => {
  test.setTimeout(240_000);
  const sb = servico();
  const { clientId } = await tenantDeTeste(sb);
  await limpar(sb);

  const agora = Date.now();
  const { msgs: massa, quals: massaQuals } = massaDeTeste(agora * 1000 + 456, PREF);
  try {
    for (let i = 0; i < massa.length; i += 500) {
      const { error } = await sb
        .from("chat_messages")
        .insert(massa.slice(i, i + 500).map((m) => ({ ...m, client_id: clientId })));
      if (error) throw error;
    }
    const { error: eq } = await sb
      .from("conversation_qualifications")
      .insert(massaQuals.map((q) => ({ ...q, client_id: clientId })));
    if (eq) throw eq;

    // Tudo que o tenant tem (a massa mais o que já existia), lido paginado.
    const msgs = await lerTudo<LinhaRef>(sb, "chat_messages", "phone, created_at, message_type, user_message, bot_message", clientId);
    const quals = await lerTudo<QualRef>(sb, "conversation_qualifications", "phone, action, created_at", clientId);
    expect(msgs.length).toBeGreaterThan(1000);

    const mes = mesFechado(new Date(agora));
    const mesMs = { inicioMs: Date.parse(mes.inicioISO), fimMs: Date.parse(mes.fimISO) };
    const plano = montarJanelas(agora, { "14": 14, "30": 30 }, mesMs);

    // O caminho que as páginas usam, com a sessão de serviço (o RLS do usuário
    // só filtra por tenant, que `p_client` já faz).
    const doBanco = await carregarAgregadoDoPainel(sb, {
      clientId, avisos: NUMERO_AVISOS, agora, janelas: plano.lista, mes: mesMs,
    });

    // 1. Banco = referência executável.
    const ref = agregarLinhas({
      msgs, quals, fora: foraDaLista(NUMERO_AVISOS), agora,
      de: plano.lista.map((j) => j.de), ate: plano.lista.map((j) => j.ate),
      horasDe: agora - 2 * 864e5, mes: { de: mesMs.inicioMs, ate: mesMs.fimMs },
      rapidaMs: UM_MINUTO,
    });
    ref.janelas.forEach((j) => expect(doBanco.janela(j.janela), `janela ${j.janela}`).toEqual(j));
    for (const k of ["dias", "horas", "cubo", "cubo_mes", "picos", "picos_mes"] as const) {
      expect(doBanco.series[k], `série ${k}`).toEqual(ref.series[k]);
    }

    // 2. Painel das agregações do banco = painel das linhas (antigo), com o
    // horário do próprio tenant (lido só o `hours`, R-51) e com um comercial.
    const { data: cfg, error: ecfg } = await sb.from("clients").select("hours:agent_config->hours").eq("id", clientId).maybeSingle();
    expect(ecfg).toBeNull();
    for (const hours of [((cfg as any)?.hours ?? null) as BusinessHours | null, COMERCIAL, null]) {
      provarIgualdade({ agregado: doBanco, msgs, quals, plano, agora, hours });
    }

    // 3. A assinatura pede só o acumulado (sem janelas, sem mês): é a MESMA
    // janela 0 e as mesmas séries de tudo, que é o que o passo de cancelar lê.
    const soAcumulado = await carregarAgregadoDoPainel(sb, {
      clientId, avisos: NUMERO_AVISOS, agora, janelas: [], mes: null,
    });
    expect(soAcumulado.janela(0)).toEqual(doBanco.janela(0));
    expect(soAcumulado.series.dias).toEqual(doBanco.series.dias);
    expect(soAcumulado.series.cubo).toEqual(doBanco.series.cubo);
    expect(soAcumulado.series.picos).toEqual(doBanco.series.picos);

    // Sanidade do `agregadoDe` com as linhas cruas do RPC (sem o carregador).
    const { data: cruas } = await sb.rpc("painel_janelas", {
      p_client: clientId, p_fora: foraDaLista(NUMERO_AVISOS), p_agora: new Date(agora).toISOString(),
      p_de: [], p_ate: [], p_rapida_ms: UM_MINUTO,
    });
    expect(agregadoDe((cruas ?? []) as any, null).janela(0).conversas).toBe(doBanco.janela(0).conversas);
  } finally {
    await limpar(sb);
  }
});
