import { accessState, planFor, type BillingRow } from "./billing";
import { diasDesde } from "./clientes";
import type { EstadoDaIa } from "./custo-ia";
import { plural } from "./format";
import { montagemTerminada } from "./onboarding";
import { normalizarEstado } from "./whatsapp-estado";

// A SITUACAO E OS ALERTAS DE UM CLIENTE NA CENTRAL DO DONO (docs/plano-central-clientes.md,
// entrega 1). Modulo PURO: a lista, o cabecalho do detalhe, a "Visao geral" e o
// preview `/design/clientes` rodam a MESMA conta.
//
// Nada aqui inventa uma regra de negocio: a situacao sai de `accessState`
// (lib/billing.ts) e o estado da IA chega pronto de `estadoDaIa` (lib/custo-ia.ts,
// que ja usa `estadoDoConsumo`); "montagem terminada" e `montagemTerminada`
// (lib/onboarding.ts); "dias sem atividade" conta dias civis de Sao Paulo por
// `diasDesde` (lib/clientes.ts). O que este modulo acrescenta e so a ORDEM dos alertas e o
// prazo de "sem atividade" (7 dias, decisao do dono no plano).
//
// ATENCAO: a situacao NAO passa `betaAberto` ao `accessState`: com a chave geral do beta
// ligada todo cliente leria "Beta aberto" e a central nao distinguiria ninguem. A
// central mostra o que a assinatura de cada um diz hoje (entrega 2 trata do aviso
// de quantos cairiam se a chave fosse desligada).

/** Dias sem atividade para o alerta (plano da central, 14/10/2026). */
export const DIAS_SEM_ATIVIDADE = 7;

// ---------------------------------------------------------------------------
// Situacao
// ---------------------------------------------------------------------------

export type SituacaoChave =
  | "em_teste"
  | "teste_encerrado"
  | "ativo"
  | "atrasado"
  | "cancelado"
  | "desconhecido";

/** `bom` e `perigo`/`aviso` sao cores de ESTADO; `neutro` nao carrega cor. */
export type TomDaSituacao = "bom" | "aviso" | "perigo" | "neutro";

export interface Situacao {
  chave: SituacaoChave;
  rotulo: string;
  /** Segunda linha ("5 dias restantes", "em carencia"); nulo quando nao ha. */
  detalhe: string | null;
  tom: TomDaSituacao;
}

/** A situacao da assinatura, pelo `accessState` (sem a chave geral do beta). */
export function situacaoDaConta(row: BillingRow, agora: number): Situacao {
  const acesso = accessState(row, new Date(agora));
  const status = typeof row.subscription_status === "string" ? row.subscription_status : "";

  if (status === "active") {
    return { chave: "ativo", rotulo: "Ativo", detalhe: null, tom: "bom" };
  }
  if (status === "trialing") {
    if (acesso.blocked) {
      return { chave: "teste_encerrado", rotulo: "Teste encerrado", detalhe: "acesso bloqueado", tom: "perigo" };
    }
    const dias = acesso.trialDaysLeft;
    return {
      chave: "em_teste",
      rotulo: "Em teste",
      detalhe: dias == null ? "sem prazo" : `${dias} ${plural(dias, "dia restante", "dias restantes")}`,
      tom: acesso.warn ? "aviso" : "neutro",
    };
  }
  if (status === "past_due") {
    return {
      chave: "atrasado",
      rotulo: "Atrasado",
      detalhe: acesso.blocked ? "acesso bloqueado" : "em carência",
      tom: acesso.blocked ? "perigo" : "aviso",
    };
  }
  if (status === "canceled") {
    return { chave: "cancelado", rotulo: "Cancelado", detalhe: "acesso bloqueado", tom: "perigo" };
  }
  return { chave: "desconhecido", rotulo: "Estado desconhecido", detalhe: null, tom: "neutro" };
}

/**
 * Os filtros da lista. A chave e o `subscription_status` GRAVADO (o banco filtra
 * por ele, em `admin_empresas_pagina`): "Em teste" inclui os testes que ja
 * terminaram, que o selo da linha distingue como "Teste encerrado".
 */
export const FILTROS_DE_SITUACAO = [
  { chave: "trialing", rotulo: "Em teste" },
  { chave: "active", rotulo: "Ativos" },
  { chave: "past_due", rotulo: "Atrasados" },
  { chave: "canceled", rotulo: "Cancelados" },
] as const;

export type FiltroDeSituacao = (typeof FILTROS_DE_SITUACAO)[number]["chave"];

export function ehFiltroDeSituacao(v: unknown): v is FiltroDeSituacao {
  return FILTROS_DE_SITUACAO.some((f) => f.chave === v);
}

/** Nome do plano para a tela; sem plano gravado, nulo (nunca um plano chutado). */
export function nomeDoPlano(billingPlan: string | null | undefined): string | null {
  return planFor(billingPlan)?.name ?? null;
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export type AlertaChave =
  | "limite_parado"
  | "pagamento"
  | "whatsapp"
  | "limite_aviso"
  | "sem_atividade"
  | "montagem";

export type TomDoAlerta = "perigo" | "aviso" | "neutro";

export interface Alerta {
  chave: AlertaChave;
  rotulo: string;
  tom: TomDoAlerta;
}

/**
 * Estado do WhatsApp lido AO VIVO (so o detalhe consulta a Evolution, pelo
 * navegador; a lista nunca chama a Evolution por linha, e o banco nao guarda o
 * estado da conexao).
 */
export type EstadoDoWhatsApp = "conectado" | "reconectando" | "desconectado" | "desconhecido";

/**
 * O estado cru da Evolution (`open`, `close`, `connecting`) vira o da central,
 * com a mesma leitura da faixa do app (`components/WhatsAppBanner.tsx`) e do campo
 * do agente (`ConexaoCampo`): `close` é desconectado (o único que alerta),
 * `connecting` é "reconectando" (o app o trata à parte, em âmbar, sem dizer que
 * caiu), e o que não se reconhece (ou falhou) é desconhecido, nunca um alerta
 * inventado.
 */
export function estadoDoWhatsApp(cru: string | null | undefined): EstadoDoWhatsApp {
  switch (normalizarEstado(cru)) {
    case "open":
      return "conectado";
    case "close":
      return "desconectado";
    case "connecting":
      return "reconectando";
    default:
      return "desconhecido";
  }
}

export interface EntradaDeAlertas {
  conta: BillingRow;
  /** O estado da IA que a lista e o detalhe JA calcularam (`estadoDaIa`); aqui nao se deriva de novo. */
  estado: EstadoDaIa;
  /** `clients.agent_published_at` preenchido. */
  publicada: boolean;
  temInstancia: boolean;
  /** Ultimo turno do agente (ISO) ou nulo. */
  ultimaAtividade: string | null;
  criadaEm: string;
  agora: number;
  /** So o detalhe sabe (consulta ao vivo). Ausente = nao entra no alerta. */
  whatsapp?: EstadoDoWhatsApp;
}

/**
 * Dias civis (Sao Paulo) sem atividade, contados do ultimo turno do agente ou, se
 * nunca houve um, da criacao da conta (uma conta de ontem sem turno nao esta
 * "abandonada").
 */
export function diasSemAtividade(ultimaAtividade: string | null, criadaEm: string, agora: number): number {
  return diasDesde(ultimaAtividade ?? criadaEm, agora);
}

/**
 * Os alertas, do mais urgente ao menos. A ORDEM e esta: IA parada no limite,
 * pagamento atrasado, WhatsApp desconectado, perto do limite, sem atividade,
 * montagem nao terminada. O principal e o primeiro.
 */
export function alertasDaConta(e: EntradaDeAlertas): Alerta[] {
  const alertas: Alerta[] = [];
  const ia = e.estado;
  const acesso = accessState(e.conta, new Date(e.agora));

  if (ia === "parada") {
    alertas.push({ chave: "limite_parado", rotulo: "IA parada no limite", tom: "perigo" });
  }
  if (e.conta.subscription_status === "past_due") {
    alertas.push({
      chave: "pagamento",
      rotulo: "Pagamento atrasado",
      tom: acesso.blocked ? "perigo" : "aviso",
    });
  }
  if (e.temInstancia && e.whatsapp === "desconectado") {
    alertas.push({ chave: "whatsapp", rotulo: "WhatsApp desconectado", tom: "perigo" });
  }
  if (ia === "aviso") {
    alertas.push({ chave: "limite_aviso", rotulo: "Perto do limite de IA", tom: "aviso" });
  }
  // Agente desligado ou nunca publicado (`desligada`): nao ha atividade a cobrar.
  if (ia !== "desligada") {
    const dias = diasSemAtividade(e.ultimaAtividade, e.criadaEm, e.agora);
    if (dias >= DIAS_SEM_ATIVIDADE) {
      alertas.push({ chave: "sem_atividade", rotulo: `Sem atividade há ${dias} dias`, tom: "aviso" });
    }
  }
  if (!montagemTerminada(e.publicada)) {
    alertas.push({ chave: "montagem", rotulo: "Montagem não terminada", tom: "neutro" });
  }
  return alertas;
}
