// A LISTA DE TABELAS DE UM CLIENTE (docs/plano-central-clientes.md, entrega 2,
// "Apagar de vez"; docs/adr/2026-10-15-two-step-company-deletion.md). Modulo PURO.
//
// TODA tabela de `public` com a coluna `client_id` esta em UMA de duas listas:
// `TABELAS_DO_CLIENTE` (apagadas, na ORDEM de apagar: filhas antes das maes; as
// chaves sem cascata, como `conversations.stage` para `pipeline_stages` e
// `knowledge_chunks` para `knowledge_documents`, mandam na ordem) ou
// `TABELAS_MANTIDAS` (ficam de proposito). As duas juntas servem a exportacao
// LGPD (um CSV por tabela, `TABELAS_DA_EXPORTACAO`).
//
// Tres travas para uma tabela nova nunca ser esquecida em silencio:
// 1. `admin_apagar_cliente` (SQL) confere no catalogo, na hora, se toda tabela com
//    `client_id` esta numa das duas listas recebidas; se nao, ABORTA sem apagar nada.
// 2. `e2e/central-clientes-conta.design.spec.ts` compara as duas listas com as
//    tabelas que tem `client_id` em `lib/database.types.ts` (gerado do banco a cada
//    migration).
// 3. O spec serial do cliente descartavel apaga de verdade e confere cada tabela.
//
// `admin_acoes` nao tem `client_id` (o alvo e texto): o registro do apagamento
// sobrevive de proposito.

export const TABELAS_DO_CLIENTE = [
  "conversation_tags",
  "conversation_notes",
  "conversation_qualifications",
  "knowledge_chunks",
  "knowledge_documents",
  "handoffs",
  "chat_messages",
  "conversations",
  "tags",
  "pipeline_stages",
  "dados_cliente",
  "agent_turns",
  "agent_publications",
  "consumo_ia_mensal",
  "quick_replies",
  "feedback",
  "user_clients",
] as const;

/**
 * As tabelas com `client_id` que o "Apagar de vez" MANTEM (decisao do dono,
 * 15/10/2026): `billing_events` e registro fiscal da cobranca. Cada uma precisa de
 * uma chave para `clients` com `on delete set null` (ou nenhuma) e das colunas
 * `deleted_client_id` e `deleted_client_name`, que `admin_apagar_cliente` preenche
 * antes de apagar o cliente (migration 20261015191433). Entra na exportacao.
 */
export const TABELAS_MANTIDAS = ["billing_events"] as const;

/** Um CSV por tabela na exportacao LGPD: as apagadas e as mantidas. */
export const TABELAS_DA_EXPORTACAO = [...TABELAS_DO_CLIENTE, ...TABELAS_MANTIDAS] as const;

export type TabelaDaExportacao = (typeof TABELAS_DA_EXPORTACAO)[number];

/**
 * Como cada tabela e lida na exportacao (`admin_exportar_lote`): `ordem` = colunas
 * do keyset, a primeira coberta por um indice (client_id, <coluna>) que JA existe e
 * a ultima o id de desempate (nenhum indice novo em producao: criar indice em
 * `chat_messages` trava a escrita). Sem `ordem`, a chave primaria (tabelas
 * pequenas, ou com indice (client_id, id)). `lote`: 200 em `knowledge_chunks`
 * (cada linha leva o vetor de 1536 numeros), 2000 nas outras.
 */
export const LEITURA_DA_EXPORTACAO: Partial<
  Record<TabelaDaExportacao, { ordem?: readonly string[]; lote?: number }>
> = {
  chat_messages: { ordem: ["created_at", "id"] },
  agent_turns: { ordem: ["created_at", "id"] },
  conversation_qualifications: { ordem: ["created_at", "id"] },
  handoffs: { ordem: ["opened_at", "id"] },
  feedback: { ordem: ["created_at", "id"] },
  billing_events: { ordem: ["created_at", "id"] },
  knowledge_documents: { ordem: ["created_at", "id"] },
  knowledge_chunks: { lote: 200 },
};

/** Linhas por lote quando a tabela nao diz outra coisa. */
export const LOTE_DA_EXPORTACAO = 2000;

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Uma celula: nulo vira vazio, objeto vira JSON, e aspas, virgula ou quebra de linha vao entre aspas. */
export function celulaCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const t = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(t) || t !== t.trim() ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Uma linha do CSV (separador virgula, fim de linha CRLF, como o Excel espera). */
export function linhaCsv(valores: unknown[]): string {
  return `${valores.map(celulaCsv).join(",")}\r\n`;
}

/** O BOM do UTF-8 no inicio de cada CSV: sem ele o Excel embaralha os acentos. */
export const BOM_UTF8 = String.fromCharCode(0xfeff);

/** Um objeto JSON (linha de `to_jsonb`)? */
export function ehObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** O nome do cliente vira nome de arquivo seguro ("Clínica Sorriso" vira "clinica-sorriso"). */
export function nomeDoArquivo(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "cliente";
}

/**
 * Os campos de `clients` que vão para o `cliente.csv` da exportação: a linha
 * INTEIRA (o spec compara com `Tables<"clients">` de lib/database.types.ts, então
 * uma coluna nova não some da exportação LGPD em silêncio).
 */
export const COLUNAS_DO_CLIENTE =
  "id, name, created_at, prompt_mode, persona, agent_config, agent_config_updated_at, agent_enabled, agent_published_at, onboarding_tested_at, regras_salvas, evolution_instance, notify_group_jid, imported_at, ia_limite_tokens, subscription_status, trial_ends_at, grace_until, billing_plan, billing_provider, billing_customer_id, billing_subscription_id, billing_seats, billing_updated_at, vitalicio_desde, bloqueado_em, desativada_em";

