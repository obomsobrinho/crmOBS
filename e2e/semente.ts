import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SEMENTE DA SUÍTE COM LOGIN (26/09/2026, decisão do dono).
//
// Até aqui a suíte com login não escrevia conversa nenhuma: abrir handoff e
// orientar a IA não tinham teste, e os testes que precisam de conversa pulavam
// com a OBS vazia. O dono autorizou gravar dado de TESTE no banco de produção,
// no tenant de teste, e limpar depois. Tudo que nasce aqui tem duas marcas, para
// nunca ser confundido com contato de verdade:
//
// - o telefone é IMPOSSÍVEL (DDD 00), então nenhuma mensagem chegaria a
//   ninguém mesmo que algo tentasse enviar;
// - o nome é "Cliente de teste (e2e)".
//
// ⚠️ A CHAVE DE SERVIÇO SAI DO `.env.local`, só na máquina de quem roda a
// suíte, e só este arquivo a usa. Ela existe aqui porque abrir um handoff é
// escrita que o browser NÃO pode fazer (`handoff_at` não tem grant de UPDATE
// para `authenticated`, de propósito), e é o `/api/agent` que abre.
//
// LIMPAR (quando o dono pedir), no SQL Editor:
//   delete from conversation_qualifications where phone = '5500000000001';
//   delete from agent_turns where phone = '5500000000001';
//   delete from chat_messages where phone = '5500000000001';
//   delete from conversations where phone = '5500000000001';
//   delete from dados_cliente where telefone = '5500000000001';

export const FONE_TESTE = "5500000000001";
export const NOME_TESTE = "Cliente de teste (e2e)";

function lerEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    for (const linha of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // sem .env.local: quem chamar recebe o erro claro abaixo
  }
  return env;
}

const ENV = lerEnvLocal();

export function servico(): SupabaseClient {
  const url = ENV.NEXT_PUBLIC_SUPABASE_URL;
  const chave = ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("semente: faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }
  return createClient(url, chave, { auth: { persistSession: false } });
}

export function segredoDoAgente(): string {
  const s = ENV.N8N_LOOKUP_SECRET;
  if (!s) throw new Error("semente: falta N8N_LOOKUP_SECRET no .env.local");
  return s;
}

/** O tenant e o usuário do DONO de teste (o e-mail de `.env.e2e.local`). */
export async function tenantDeTeste(svc: SupabaseClient) {
  const email = process.env.E2E_EMAIL?.toLowerCase();
  if (!email) throw new Error("semente: falta E2E_EMAIL no .env.e2e.local");
  let userId: string | null = null;
  for (let pagina = 1; pagina <= 20 && !userId; pagina++) {
    const { data, error } = await svc.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) throw new Error("semente: usuário de teste não encontrado");
  const { data: vinculo, error } = await svc
    .from("user_clients")
    .select("client_id")
    .eq("user_id", userId)
    .eq("role", "dono")
    .limit(1)
    .single();
  if (error || !vinculo) throw new Error("semente: o usuário de teste não é dono de tenant nenhum");
  return { clientId: vinculo.client_id as string, userId };
}

/**
 * Garante a conversa de teste, em estado LIMPO: IA ligada, sem handoff, sem
 * orientação, sem responsável. Idempotente.
 */
export async function semearConversa(svc: SupabaseClient, clientId: string) {
  const { error: e1 } = await svc.from("dados_cliente").upsert(
    { client_id: clientId, telefone: FONE_TESTE, nomewpp: NOME_TESTE, atendimento_ia: "ativa" },
    { onConflict: "client_id,telefone" }
  );
  if (e1) throw e1;
  // A mensagem só entra na PRIMEIRA vez: é ela que cria a conversa (gatilho
  // `sync_conversation`), e repetir a cada rodada encheria a conversa de
  // "Oi, quanto custa a revisão?".
  const { count } = await svc
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("phone", FONE_TESTE);
  if (!count) {
    const { error: e2 } = await svc.from("chat_messages").insert({
      client_id: clientId,
      phone: FONE_TESTE,
      nomewpp: NOME_TESTE,
      user_message: "Oi, quanto custa a revisão?",
    });
    if (e2) throw e2;
  }
  const { error: e3 } = await svc
    .from("conversations")
    .update({
      handoff_at: null,
      assigned_user_id: null,
      pending_instruction: null,
      pending_instruction_at: null,
      pending_instruction_by: null,
    })
    .eq("client_id", clientId)
    .eq("phone", FONE_TESTE);
  if (e3) throw e3;
}

/**
 * Abre um handoff como o `/api/agent` abriria: `handoff_at` no passado (é ele
 * que dá o "esperando há 6h") e uma qualificação `pausar` com o resumo do pedido.
 */
export async function abrirHandoff(svc: SupabaseClient, clientId: string, resumo: string) {
  const { error: e1 } = await svc
    .from("conversations")
    .update({ handoff_at: new Date(Date.now() - 6 * 3600_000).toISOString() })
    .eq("client_id", clientId)
    .eq("phone", FONE_TESTE);
  if (e1) throw e1;
  const { error: e2 } = await svc
    .from("conversation_qualifications")
    .insert({ client_id: clientId, phone: FONE_TESTE, action: "pausar", summary: resumo });
  if (e2) throw e2;
}

/** O que o teste confere no banco. */
export async function estadoDaConversa(svc: SupabaseClient, clientId: string) {
  const [{ data: conv }, { data: contato }] = await Promise.all([
    svc
      .from("conversations")
      .select("handoff_at, assigned_user_id, pending_instruction")
      .eq("client_id", clientId)
      .eq("phone", FONE_TESTE)
      .single(),
    svc
      .from("dados_cliente")
      .select("atendimento_ia")
      .eq("client_id", clientId)
      .eq("telefone", FONE_TESTE)
      .single(),
  ]);
  return {
    handoffAt: (conv?.handoff_at as string | null) ?? null,
    responsavel: (conv?.assigned_user_id as string | null) ?? null,
    orientacao: (conv?.pending_instruction as string | null) ?? null,
    ia: (contato?.atendimento_ia as string | null) ?? null,
  };
}
