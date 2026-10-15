import { PLANS, type BillingRow, type PlanKey } from "./billing";

// AS ACOES DA CENTRAL SOBRE A CONTA DE UM CLIENTE (docs/plano-central-clientes.md,
// entrega 2): aba "Financeiro" (vitalicio, estender teste, plano, bloqueio) e aba
// "Acoes" (desativar, reativar, apagar de vez). Modulo PURO: valida o pedido que
// chega na rota, traduz a resposta do SQL e prepara o que a tela mostra. A REGRA
// de cada acao mora numa funcao SQL so (`admin_mudar_conta`, `admin_apagar_cliente`),
// numa transacao com a linha em `admin_acoes`; nada aqui escreve.

export const ACOES_DA_CONTA = [
  "vitalicio",
  "remover_vitalicio",
  "estender_teste",
  "mudar_plano",
  "bloquear",
  "liberar",
  "desativar",
  "reativar",
] as const;

export type AcaoDaConta = (typeof ACOES_DA_CONTA)[number];

export function ehAcaoDaConta(v: unknown): v is AcaoDaConta {
  return (ACOES_DA_CONTA as readonly unknown[]).includes(v);
}

/** O pedido ja validado que vai ao SQL. */
export type PedidoDeAcao =
  | { acao: "estender_teste"; dias: number }
  | { acao: "mudar_plano"; plano: PlanKey }
  | { acao: Exclude<AcaoDaConta, "estender_teste" | "mudar_plano"> };

/**
 * O maior inteiro que o parametro do SQL aceita (`integer` do Postgres). NAO e
 * uma regra de negocio: nao existe limite de dias definido para estender o teste
 * (decisao em aberto do dono); um prazo que nao cabe numa data volta 400 do banco.
 */
const MAIOR_INTEIRO_DO_SQL = 2_147_483_647;

/** Dias para estender o teste: inteiro de 1 em diante (sem teto de negocio). */
export function diasValidos(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAIOR_INTEIRO_DO_SQL;
}

/** Plano so pode ser uma chave de `PLANS` (nunca um plano inventado). */
export function ehChaveDePlano(v: unknown): v is PlanKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PLANS, v);
}

/** O corpo da rota vira um pedido valido, ou o texto do 400. */
export function pedidoDeAcao(corpo: unknown): PedidoDeAcao | { erro: string } {
  if (!corpo || typeof corpo !== "object") return { erro: "corpo inválido" };
  const c = corpo as { acao?: unknown; dias?: unknown; plano?: unknown };
  if (!ehAcaoDaConta(c.acao)) return { erro: "ação inválida" };
  if (c.acao === "estender_teste") {
    return diasValidos(c.dias) ? { acao: c.acao, dias: c.dias } : { erro: "dias inválidos: um número inteiro de 1 em diante" };
  }
  if (c.acao === "mudar_plano") {
    return ehChaveDePlano(c.plano) ? { acao: c.acao, plano: c.plano } : { erro: "plano inválido" };
  }
  return { acao: c.acao };
}

/** O texto digitado ("7", "30") vira dias, ou `undefined` (mesma regra da rota). */
export function diasDigitados(texto: string): number | undefined {
  const t = texto.trim();
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return diasValidos(n) ? n : undefined;
}

/** O que cada resposta do SQL vira na rota (status HTTP e texto da tela). */
export const RESPOSTA_DO_SQL: Record<string, { status: number; texto: string }> = {
  ok: { status: 200, texto: "Feito." },
  sem_mudanca: { status: 200, texto: "Já estava assim." },
  nao_encontrado: { status: 404, texto: "Cliente não encontrado." },
  acao_invalida: { status: 400, texto: "Ação inválida." },
  dias_invalidos: { status: 400, texto: "Dias inválidos." },
  plano_invalido: { status: 400, texto: "Plano inválido." },
  vitalicio: { status: 409, texto: "Cliente vitalício não tem teste a estender." },
  nao_em_teste: { status: 409, texto: "Só dá para estender o teste de quem está em teste." },
  sem_prazo: { status: 409, texto: "Este teste não tem prazo: não há o que estender." },
  tem_assinatura: {
    status: 409,
    texto: "Este cliente tem assinatura no Asaas. Cancele ou troque pela assinatura antes (muda o que é cobrado).",
  },
  nao_desativado: { status: 409, texto: "Desative o cliente antes de apagar de vez." },
  nome_diferente: { status: 400, texto: "O nome digitado não confere com o nome do cliente." },
};

export function respostaDoSql(resultado: string | null | undefined): { status: number; texto: string } {
  return RESPOSTA_DO_SQL[resultado ?? ""] ?? { status: 500, texto: "Resposta inesperada do banco; nada foi confirmado." };
}

/**
 * As paradas do "Apagar de vez" (`apagarCliente`, lib/admin.ts): o banco não foi
 * apagado em nenhuma delas; o que já foi feito fora dele vem nas pendências
 * (`pendenciasDosEfeitos`). O resto das respostas é do SQL.
 */
export const PARADAS_DO_APAGAR: Record<string, { status: number; texto: string }> = {
  tabela_fora_da_lista: {
    status: 500,
    texto: "Existe uma tabela nova com dados de cliente fora da rotina de apagar. Nada foi apagado.",
  },
  falha_gateway: {
    status: 502,
    texto: "Não deu para cancelar a assinatura no Asaas. Nada foi apagado; tente de novo.",
  },
  falha_arquivos: {
    status: 502,
    texto: "Não deu para remover os arquivos do cliente. O banco não foi apagado; tente de novo.",
  },
  falha_banco: {
    status: 500,
    texto: "O banco do cliente não foi apagado (veja o log do servidor). Confira as pendências: parte do que fica fora do banco já foi feita.",
  },
};

/** A resposta de um resultado do "Apagar de vez": parada da rotina ou resposta do SQL. */
export function respostaDoApagar(resultado: string): { status: number; texto: string } {
  return PARADAS_DO_APAGAR[resultado] ?? respostaDoSql(resultado);
}

// ---------------------------------------------------------------------------
// Financeiro (o que a aba mostra)
// ---------------------------------------------------------------------------

export interface FinanceiroDoCliente {
  /** `clients.billing_plan` (so chaves de `PLANS`; nulo = sem plano). */
  planoChave: PlanKey | null;
  /** `clients.billing_provider` (`asaas`, `stripe`) ou nulo. */
  provedor: string | null;
  /** Ids do gateway MASCARADOS no servidor: o navegador nunca recebe o id inteiro. */
  clienteNoGateway: string | null;
  assinaturaNoGateway: string | null;
  /** Tem assinatura no gateway (bloqueia vitalicio e troca de plano pela central). */
  temAssinatura: boolean;
  /** `clients.billing_seats`: assentos da ultima sincronizacao com o gateway. */
  assentosCobrados: number | null;
  /** `clients.billing_updated_at`. */
  atualizadoEm: string | null;
}

/** "sub_12345abcd" vira "•••• abcd": so os 4 ultimos, o bastante para conferir no Asaas. */
export function mascararId(id: string | null | undefined): string | null {
  if (!id) return null;
  const fim = id.slice(-4);
  return `•••• ${fim}`;
}

/** As colunas de cobranca de `clients` viram o bloco da aba (ids ja mascarados). */
export function financeiroDe(c: {
  billing_plan: string | null;
  billing_provider: string | null;
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  billing_seats: number | null;
  billing_updated_at: string | null;
}): FinanceiroDoCliente {
  return {
    planoChave: ehChaveDePlano(c.billing_plan) ? c.billing_plan : null,
    provedor: c.billing_provider,
    clienteNoGateway: mascararId(c.billing_customer_id),
    assinaturaNoGateway: mascararId(c.billing_subscription_id),
    temAssinatura: !!c.billing_subscription_id,
    assentosCobrados: c.billing_seats,
    atualizadoEm: c.billing_updated_at,
  };
}

/** Uma cobranca do Asaas como a tela mostra (nada alem de data, valor e estado; o rotulo e `rotuloDaCobranca`). */
export interface Cobranca {
  vencimento: string;
  valor: number;
  status: string;
}

/**
 * Os estados de cobranca que o codigo ja conhece (lib/asaas.ts usa PENDING e
 * OVERDUE; o webhook trata CONFIRMED, RECEIVED e REFUNDED). Outro estado aparece
 * cru, nunca traduzido por chute.
 */
const ROTULO_DA_COBRANCA: Record<string, string> = {
  PENDING: "Pendente",
  OVERDUE: "Vencida",
  CONFIRMED: "Confirmada",
  RECEIVED: "Recebida",
  REFUNDED: "Estornada",
};

export function rotuloDaCobranca(status: string): string {
  return ROTULO_DA_COBRANCA[status] ?? status;
}

// ---------------------------------------------------------------------------
// Apagar de vez
// ---------------------------------------------------------------------------

/** O nome digitado confere com o do cliente (sem espacos nas pontas; o resto igual, como o SQL). */
export function nomeConfere(digitado: string, nome: string): boolean {
  return digitado.trim() !== "" && digitado.trim() === nome.trim();
}

// ---------------------------------------------------------------------------
// O que a aba Financeiro deixa fazer (espelho das recusas de `admin_mudar_conta`)
// ---------------------------------------------------------------------------

/** Uma ação da aba: qual vai ao SQL e, se o SQL vai recusar, a chave da recusa (em `RESPOSTA_DO_SQL`). */
export interface AcaoDoFinanceiro<A extends AcaoDaConta> {
  acao: A;
  recusa: string | null;
}

/**
 * As ações da aba Financeiro com a mesma ordem de recusas de `admin_mudar_conta`
 * (o SQL confere de novo; isto só evita mostrar um botão que vai ser recusado e
 * diz por quê, com o texto de `RESPOSTA_DO_SQL`). A tela nunca relê as colunas.
 */
export function acoesDoFinanceiro(
  conta: Pick<BillingRow, "subscription_status" | "trial_ends_at" | "vitalicio_desde" | "bloqueado_em">,
  financeiro: Pick<FinanceiroDoCliente, "temAssinatura">
): {
  vitalicio: AcaoDoFinanceiro<"vitalicio" | "remover_vitalicio">;
  estenderTeste: AcaoDoFinanceiro<"estender_teste">;
  mudarPlano: AcaoDoFinanceiro<"mudar_plano">;
  bloqueio: AcaoDoFinanceiro<"bloquear" | "liberar">;
} {
  const vitalicio = !!conta.vitalicio_desde;
  return {
    vitalicio: vitalicio
      ? { acao: "remover_vitalicio", recusa: null }
      : { acao: "vitalicio", recusa: financeiro.temAssinatura ? "tem_assinatura" : null },
    estenderTeste: {
      acao: "estender_teste",
      recusa: vitalicio
        ? "vitalicio"
        : conta.subscription_status !== "trialing"
          ? "nao_em_teste"
          : conta.trial_ends_at === null
            ? "sem_prazo"
            : null,
    },
    mudarPlano: { acao: "mudar_plano", recusa: financeiro.temAssinatura ? "tem_assinatura" : null },
    bloqueio: { acao: conta.bloqueado_em ? "liberar" : "bloquear", recusa: null },
  };
}

/** O que o "Apagar de vez" já fez fora do banco antes de uma parada (`apagarCliente`). */
export interface EfeitosDoApagar {
  assinaturaCancelada: boolean;
  arquivosRemovidos: number;
  whatsappDesconectado: boolean;
}

export const SEM_EFEITOS: EfeitosDoApagar = { assinaturaCancelada: false, arquivosRemovidos: 0, whatsappDesconectado: false };

/**
 * Uma parada DEPOIS de efeitos externos (o banco não foi apagado, mas a assinatura,
 * os arquivos ou o WhatsApp já foram): as pendências dizem o que já aconteceu, para
 * o dono não achar que nada mudou. Sem efeitos, nenhuma linha.
 */
export function pendenciasDosEfeitos(e: EfeitosDoApagar): string[] {
  const saida: string[] = [];
  if (e.assinaturaCancelada) saida.push("A assinatura já foi cancelada no Asaas.");
  if (e.arquivosRemovidos > 0) {
    saida.push(
      e.arquivosRemovidos === 1
        ? "1 arquivo já foi removido do Storage."
        : `${e.arquivosRemovidos} arquivos já foram removidos do Storage.`
    );
  }
  if (e.whatsappDesconectado) saida.push("O WhatsApp já foi desconectado na Evolution.");
  return saida;
}
