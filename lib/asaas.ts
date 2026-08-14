import "server-only";

// Cliente da API do Asaas. SÓ NO SERVIDOR: a chave é um segredo de conta
// inteira (cria cobrança, move dinheiro), então nunca pode chegar no browser.
//
// Ambiente: qualquer valor diferente de "producao" cai no sandbox, de
// propósito. Errar para o lado do sandbox é gratuito; errar para o lado da
// produção cobra dinheiro de alguém.
//
// ⚠️ A chave do Asaas começa com "$". No `.env.local` ela precisa ser escrita
// com contrabarra (`\$aact_...`), senão o Next expande como referência a outra
// variável e ela chega VAZIA aqui, sem erro nenhum. Na Vercel vai crua, sem a
// contrabarra.

const SANDBOX = "https://api-sandbox.asaas.com/v3";
const PRODUCAO = "https://api.asaas.com/v3";

export class AsaasError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "AsaasError";
    this.status = status;
    this.code = code;
  }
}

export function asaasBaseUrl(): string {
  return process.env.ASAAS_ENV === "producao" ? PRODUCAO : SANDBOX;
}

export function asaasIsSandbox(): boolean {
  return process.env.ASAAS_ENV !== "producao";
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) {
    throw new AsaasError(500, "o pagamento precisa de ASAAS_API_KEY no servidor");
  }

  let res: Response;
  try {
    res = await fetch(`${asaasBaseUrl()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        access_token: key,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    // Não repassa a mensagem de rede crua: ela pode conter a URL com dados.
    throw new AsaasError(502, "falha de rede ao contatar o Asaas");
  }

  const texto = await res.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    // Formato de erro do Asaas: { errors: [{ code, description }] }. Lido com
    // cuidado porque um formato diferente não pode virar exceção de leitura.
    const erro = (json as { errors?: { code?: string; description?: string }[] })
      ?.errors?.[0];
    throw new AsaasError(
      res.status,
      erro?.description || `o Asaas respondeu com erro (${res.status})`,
      erro?.code ?? null
    );
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Tipos (só o que a gente usa; a resposta do Asaas tem muito mais campo)
// ---------------------------------------------------------------------------

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: string;
  status: string;
  nextDueDate: string;
  externalReference: string | null;
}

/**
 * Uma cobrança gerada pela assinatura. `invoiceUrl` é a página do Asaas onde a
 * pessoa escolhe Pix, boleto ou cartão e paga: é para lá que o app manda o
 * cliente. Confirmado no sandbox (GET /subscriptions/{id}/payments).
 */
export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl: string;
  bankSlipUrl: string | null;
  subscription: string | null;
  customer: string;
  externalReference: string | null;
}

export interface AsaasAccountStatus {
  id?: string;
  general?: string;
  commercialInfo?: string;
  bankAccountInfo?: string;
  documentation?: string;
}

/** Situação cadastral da conta Asaas. Serve de teste de fumaça da chave. */
export function accountStatus(): Promise<AsaasAccountStatus> {
  return call<AsaasAccountStatus>("/myAccount/status");
}

/**
 * Cria o cliente no Asaas. Aqui "cliente" é a EMPRESA QUE PAGA A GENTE (o
 * tenant), não o lead que manda mensagem no WhatsApp dela (isso é
 * `dados_cliente`). O `externalReference` guarda o `clients.id` para o webhook
 * conseguir voltar ao tenant mesmo se algum id se perder.
 */
export function createCustomer(params: {
  name: string;
  cpfCnpj: string;
  email: string;
  externalReference: string;
  mobilePhone?: string;
}): Promise<AsaasCustomer> {
  return call<AsaasCustomer>("/customers", { method: "POST", body: params });
}

/**
 * Cria a assinatura mensal. `billingType: UNDEFINED` deixa a pessoa escolher
 * entre Pix, boleto e cartão na hora de pagar, que é o motivo de o Asaas ter
 * sido escolhido.
 */
export function createSubscription(params: {
  customer: string;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  description: string;
  externalReference: string;
}): Promise<AsaasSubscription> {
  return call<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: {
      billingType: "UNDEFINED",
      cycle: "MONTHLY",
      ...params,
    },
  });
}

/** Troca de plano: muda o valor da assinatura existente. */
export function updateSubscription(
  id: string,
  params: { value?: number; description?: string }
): Promise<AsaasSubscription> {
  return call<AsaasSubscription>(`/subscriptions/${id}`, {
    method: "PUT",
    body: params,
  });
}

/** Cancelamento pedido pelo cliente. */
export function deleteSubscription(id: string): Promise<{ deleted: boolean }> {
  return call<{ deleted: boolean }>(`/subscriptions/${id}`, { method: "DELETE" });
}

/**
 * Cobranças de uma assinatura, da mais recente para a mais antiga. Usado para
 * pegar a `invoiceUrl` da cobrança em aberto e mandar a pessoa para lá.
 */
export async function subscriptionPayments(
  id: string
): Promise<AsaasPayment[]> {
  const r = await call<{ data?: AsaasPayment[] }>(`/subscriptions/${id}/payments`);
  return Array.isArray(r?.data) ? r.data : [];
}

/** Cobrança em aberto mais recente da assinatura (a que a pessoa tem que pagar). */
export async function openPayment(id: string): Promise<AsaasPayment | null> {
  const pagamentos = await subscriptionPayments(id);
  const emAberto = pagamentos.find(
    (p) => p.status === "PENDING" || p.status === "OVERDUE"
  );
  return emAberto ?? pagamentos[0] ?? null;
}

/** Data de hoje em YYYY-MM-DD (formato que o Asaas espera). */
export function hojeISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
