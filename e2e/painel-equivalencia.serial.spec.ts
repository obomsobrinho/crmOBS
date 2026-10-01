import { test, expect } from "@playwright/test";
import { servico, tenantDeTeste } from "./semente";
import { resumoDeValor } from "../lib/valor";
import { computeMetrics, primeirasMensagens, barras } from "../lib/metrics";
import { barrasDeHora, escolherVerbatim, VERBATIM_MIN_CHARS } from "../lib/painel";
/* eslint-disable @typescript-eslint/no-explicit-any */

// O PAINEL SEM TEXTO CONTA IGUAL AO PAINEL COM TEXTO (01/10/2026, fase 6 do
// docs/plano-carregamento.md). As contas leem só SE existe mensagem recebida e
// SE existe resposta; `painel_linhas` devolve isso sem o texto, e
// `painel_verbatim` traz só as linhas da frase do agente. Este teste roda as
// MESMAS funções (lib/valor, lib/metrics, lib/painel) sobre as duas formas, com
// uma massa variada (recebida, IA, manual, importada, linha mista, resposta só
// com espaços), e exige o mesmo resultado. Número impossível, apagado no fim.
test("as contas do painel sem o texto saem idênticas às com o texto", async () => {
  const sb = servico();
  const { clientId } = await tenantDeTeste(sb);
  const PREF = "55000000080";
  await sb.from("chat_messages").delete().like("phone", `${PREF}%`);
  const tipos = [null, "text", "manual", "imported", "audio"];
  const linhasSeed = Array.from({ length: 400 }, (_, i) => {
    const t = tipos[i % 5];
    const k = i % 7;
    return {
      client_id: clientId,
      phone: `${PREF}${String(i % 23).padStart(2, "0")}@s.whatsapp.net`,
      nomewpp: `Massa ${i % 23}`,
      message_type: t,
      user_message: k === 0 || k === 3 ? `pergunta ${i}` : k === 5 ? "" : null,
      bot_message: k === 1 ? `resposta curta ${i}` : k === 2 ? "x".repeat(130) + i : k === 3 ? "   " : k === 4 ? `misto ${i}` : null,
      created_at: new Date(Date.now() - i * 37 * 60_000).toISOString(),
    };
  });
  const { error } = await sb.from("chat_messages").insert(linhasSeed);
  if (error) throw error;
  try {
    const { data: c } = await sb.from("clients").select("agent_config").eq("id", clientId).single();
    const { data: velhas } = await sb.from("chat_messages").select("phone, nomewpp, user_message, bot_message, message_type, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20000);
    const { data: linhas } = await sb.rpc("painel_linhas", { p_client: clientId, p_limite: 20000 });
    const novas = (linhas ?? []).map((l: any) => ({ phone: l.phone, nomewpp: null, created_at: l.created_at, message_type: l.message_type, user_message: l.tem_user ? "·" : null, bot_message: l.tem_bot ? "·" : null }));
    const { data: quals } = await sb.from("conversation_qualifications").select("id, phone, action, summary, created_at").eq("client_id", clientId);
    const hours = (c?.agent_config as any)?.hours ?? { seg: { inicio: "08:00", fim: "18:00" } };
    const agora = Date.now();
    const calc = (msgs: any[]) => JSON.stringify({
      valor: resumoDeValor({ msgs, quals: quals ?? [], hours }),
      metr: computeMetrics({ msgs, quals: quals ?? [], primeiras: primeirasMensagens(msgs), de: agora - 30 * 864e5, ate: agora } as any),
      barras: barras(msgs, 30, agora),
      horas: barrasDeHora({ msgs, hours } as any),
    });
    const a = calc(velhas ?? []), b = calc(novas);
    const vVelho = escolherVerbatim((velhas ?? []) as any);
    const { data: vl } = await sb.rpc("painel_verbatim", { p_client: clientId, p_min: VERBATIM_MIN_CHARS, p_fora: [] });
    const vNovo = escolherVerbatim((vl ?? []) as any, new Set((vl ?? []).filter((m: any) => m.conversa_com_humano).map((m: any) => m.phone)));
    expect(a).toBe(b);
    expect(JSON.stringify(vNovo)).toBe(JSON.stringify(vVelho));
  } finally {
    await sb.from("chat_messages").delete().like("phone", `${PREF}%`);
  }
});

// As consultas do painel saem do SERVIDOR (não aparecem na rede do navegador):
// aqui a prova é a página abrir inteira com as funções novas do banco.
test("o painel abre com o banco de verdade", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  const resp = await page.goto("/painel");
  expect(resp?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  expect(erros).toEqual([]);
});
