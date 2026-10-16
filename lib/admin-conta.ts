import { PLANS, type AccessKind, type BillingRow, type PlanKey } from "./billing";

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

/** Uma linha de data do cartão "Assinatura" (só as que servem à situação da conta). */
export interface LinhaDaAssinatura {
  chave: "teste" | "carencia" | "vitalicio" | "bloqueado";
  rotulo: string;
  /** O instante gravado; nulo quando a coluna está vazia. */
  quando: string | null;
  /** O que a tela escreve quando `quando` é nulo. */
  vazio: string;
}

/**
 * As datas que a aba Financeiro mostra, escolhidas pelo TIPO de acesso (`accessState().kind`) e não
 * por quais colunas existem: o fim do teste só enquanto está em teste (ou depois que acabou), a
 * carência só quando o pagamento atrasou, o vitalício e o bloqueio só quando a marca existe. Antes
 * eram seis linhas sempre, e "Fim do teste" e "Carência até" pareciam a mesma coisa. Nada é inventado:
 * cada linha lê a coluna que já está gravada.
 */
export function linhasDaAssinatura(
  conta: Pick<BillingRow, "trial_ends_at" | "grace_until" | "vitalicio_desde" | "bloqueado_em">,
  kind: AccessKind
): LinhaDaAssinatura[] {
  const linhas: LinhaDaAssinatura[] = [];
  if (kind === "em_teste") {
    linhas.push({ chave: "teste", rotulo: "O teste termina em", quando: conta.trial_ends_at, vazio: "Sem prazo" });
  } else if (kind === "teste_encerrado") {
    linhas.push({ chave: "teste", rotulo: "O teste terminou em", quando: conta.trial_ends_at, vazio: "Sem prazo" });
  } else if (kind === "carencia") {
    linhas.push({ chave: "carencia", rotulo: "Carência do pagamento até", quando: conta.grace_until, vazio: "Sem data" });
  } else if (kind === "atrasado_bloqueado") {
    linhas.push({ chave: "carencia", rotulo: "A carência terminou em", quando: conta.grace_until, vazio: "Sem data" });
  }
  if (conta.vitalicio_desde) {
    linhas.push({ chave: "vitalicio", rotulo: "Vitalício desde", quando: conta.vitalicio_desde, vazio: "" });
  }
  if (conta.bloqueado_em) {
    linhas.push({ chave: "bloqueado", rotulo: "Bloqueado desde", quando: conta.bloqueado_em, vazio: "" });
  }
  return linhas;
}

/** A única linha que substitui o bloco do provedor quando NÃO há provedor: sem cobrança ou sem assinatura. */
export function textoSemAssinatura(conta: Pick<BillingRow, "vitalicio_desde">): string {
  return conta.vitalicio_desde ? "Sem cobrança: conta vitalícia." : "Sem assinatura no Asaas.";
}

/** O nome do provedor de cobrança como a tela escreve ("asaas" vira "Asaas"); uma chave nova vira o mesmo com a inicial maiúscula, nunca a chave crua. */
export function nomeDoProvedor(chave: string): string {
  const NOMES: Record<string, string> = { asaas: "Asaas", stripe: "Stripe" };
  return NOMES[chave.toLowerCase()] ?? `${chave.charAt(0).toUpperCase()}${chave.slice(1)}`;
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
 * Os prazos prontos do controle "Estender teste" (decisão do dono, 15/10/2026).
 * "Personalizado" aceita qualquer prazo de `diasValidos`, sem teto de negócio.
 */
export const PRAZOS_DO_TESTE = [7, 15] as const;

/**
 * O controle "Estender teste" (15/10/2026): UM controle com as opções 7 dias,
 * 15 dias, Personalizado (o dono digita os dias) e Vitalício. Os dias vão como
 * `estender_teste`; Vitalício é a MESMA ação `vitalicio` de sempre, oferecida aqui.
 * `recusa` é a do controle inteiro: nula quando ao menos uma opção passa; senão a
 * recusa dos dias.
 */
export interface ControleDoTeste {
  dias: AcaoDoFinanceiro<"estender_teste">;
  /** `null` = já é vitalício (tirar é outra ação, `remover_vitalicio`). */
  vitalicio: AcaoDoFinanceiro<"vitalicio"> | null;
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
  estenderTeste: ControleDoTeste;
  mudarPlano: AcaoDoFinanceiro<"mudar_plano">;
  bloqueio: AcaoDoFinanceiro<"bloquear" | "liberar">;
} {
  const ehVitalicio = !!conta.vitalicio_desde;
  const marcar: AcaoDoFinanceiro<"vitalicio"> | null = ehVitalicio
    ? null
    : { acao: "vitalicio", recusa: financeiro.temAssinatura ? "tem_assinatura" : null };
  const dias: AcaoDoFinanceiro<"estender_teste"> = {
    acao: "estender_teste",
    recusa: ehVitalicio
      ? "vitalicio"
      : conta.subscription_status !== "trialing"
        ? "nao_em_teste"
        : conta.trial_ends_at === null
          ? "sem_prazo"
          : null,
  };
  const algumaPassa = dias.recusa === null || (marcar !== null && marcar.recusa === null);
  return {
    vitalicio: marcar ?? { acao: "remover_vitalicio", recusa: null },
    estenderTeste: { dias, vitalicio: marcar, recusa: algumaPassa ? null : dias.recusa },
    mudarPlano: { acao: "mudar_plano", recusa: financeiro.temAssinatura ? "tem_assinatura" : null },
    bloqueio: { acao: conta.bloqueado_em ? "liberar" : "bloquear", recusa: null },
  };
}

/** O que o "Apagar de vez" já fez fora do banco antes de uma parada (`apagarCliente`). */
export interface EfeitosDoApagar {
  assinaturaCancelada: boolean;
  arquivosRemovidos: number;
  whatsappDesconectado: boolean;
  instanciaApagada: boolean;
}

export const SEM_EFEITOS: EfeitosDoApagar = {
  assinaturaCancelada: false,
  arquivosRemovidos: 0,
  whatsappDesconectado: false,
  instanciaApagada: false,
};

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
  if (e.instanciaApagada) saida.push("A instância do WhatsApp já foi apagada na Evolution.");
  else if (e.whatsappDesconectado) saida.push("O WhatsApp já foi desconectado na Evolution.");
  return saida;
}

/** Uma recusa e as ações que ela trava: o mesmo motivo escrito UMA vez ("Marcar como vitalício e mudar plano: ..."). */
export interface RecusaAgrupada {
  /** A chave da recusa em `RESPOSTA_DO_SQL`. */
  recusa: string;
  /** As ações travadas por ela, na ordem da tela. */
  acoes: string[];
  /** A frase da tela: as ações juntas e o motivo. */
  frase: string;
}

/**
 * O que a aba Financeiro NÃO deixa fazer agora, sem botão morto e sem repetir motivo: cada ação travada
 * vira uma linha curta com a razão, e as que travam pelo MESMO motivo se juntam numa linha só. O controle
 * "Estender teste" só entra aqui quando NENHUMA das suas opções passa (se ao menos uma passa, o botão
 * existe e a razão das outras fica dentro da caixa). O texto é o da rota (`RESPOSTA_DO_SQL`).
 */
export function recusasAgrupadas(a: ReturnType<typeof acoesDoFinanceiro>): RecusaAgrupada[] {
  const travadas: { acao: string; recusa: string }[] = [];
  if (a.estenderTeste.recusa !== null) {
    if (a.estenderTeste.dias.recusa) travadas.push({ acao: "Estender o teste", recusa: a.estenderTeste.dias.recusa });
    if (a.estenderTeste.vitalicio?.recusa) {
      travadas.push({ acao: "Marcar como vitalício", recusa: a.estenderTeste.vitalicio.recusa });
    }
  }
  if (a.mudarPlano.recusa !== null) travadas.push({ acao: "Mudar plano", recusa: a.mudarPlano.recusa });
  const grupos: RecusaAgrupada[] = [];
  for (const t of travadas) {
    let g = grupos.find((x) => x.recusa === t.recusa);
    if (!g) {
      g = { recusa: t.recusa, acoes: [], frase: "" };
      grupos.push(g);
    }
    g.acoes.push(t.acao);
  }
  for (const g of grupos) {
    const nomes = g.acoes.map((n, i) => (i === 0 ? n : `${n.charAt(0).toLowerCase()}${n.slice(1)}`)).join(" e ");
    g.frase = `${nomes}: ${RESPOSTA_DO_SQL[g.recusa]?.texto ?? g.recusa}`;
  }
  return grupos;
}
