import { accessState, planFor, type AccessKind, type BillingRow } from "./billing";
import { diasDesde } from "./clientes";
import type { EstadoDaIa } from "./custo-ia";
import { plural } from "./format";
import { montagemTerminada } from "./onboarding";
import { normalizarEstado } from "./whatsapp-estado";

// A SITUACAO E OS ALERTAS DE UM CLIENTE NA CENTRAL DO DONO (docs/plano-central-clientes.md,
// entregas 1 e 2). Modulo PURO: a lista, o cabecalho do detalhe, a "Visao geral" e o
// preview `/design/clientes` rodam a MESMA conta.
//
// Nada aqui inventa uma regra de negocio: a situacao MAPEIA o tipo de acesso
// (`kind` de `accessState`, lib/billing.ts), sem reler `subscription_status` nem as marcas
// (a desativada, que barra o login inteiro, e o primeiro tipo). O estado da IA chega pronto de
// `estadoDaIa` (lib/custo-ia.ts); "montagem terminada" e `montagemTerminada`
// (lib/onboarding.ts); "dias sem atividade" conta dias civis de Sao Paulo por
// `diasDesde` (lib/clientes.ts). O que este modulo acrescenta e so a ORDEM dos
// alertas e o prazo de "sem atividade" (7 dias, decisao do dono no plano).

/** Dias sem atividade para o alerta (plano da central, 14/10/2026). */
export const DIAS_SEM_ATIVIDADE = 7;

// ---------------------------------------------------------------------------
// Situacao
// ---------------------------------------------------------------------------

export type SituacaoChave =
  | "desativado"
  | "bloqueado"
  | "vitalicio"
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
  /** O tipo de acesso de onde a situacao saiu. */
  kind: AccessKind;
}

/** O rotulo de cada tipo de acesso na central (o `detalhe` do teste e calculado). */
const SITUACAO_DO_TIPO: Record<AccessKind, Omit<Situacao, "kind">> = {
  desativado: { chave: "desativado", rotulo: "Desativado", detalhe: "sem acesso", tom: "neutro" },
  bloqueado: { chave: "bloqueado", rotulo: "Bloqueado", detalhe: "bloqueio manual", tom: "perigo" },
  vitalicio: { chave: "vitalicio", rotulo: "Vitalício", detalhe: "nunca cobrado", tom: "bom" },
  ativo: { chave: "ativo", rotulo: "Ativo", detalhe: null, tom: "bom" },
  em_teste: { chave: "em_teste", rotulo: "Em teste", detalhe: null, tom: "neutro" },
  teste_encerrado: { chave: "teste_encerrado", rotulo: "Teste encerrado", detalhe: "acesso bloqueado", tom: "perigo" },
  carencia: { chave: "atrasado", rotulo: "Atrasado", detalhe: "em carência", tom: "aviso" },
  atrasado_bloqueado: { chave: "atrasado", rotulo: "Atrasado", detalhe: "acesso bloqueado", tom: "perigo" },
  cancelado: { chave: "cancelado", rotulo: "Cancelado", detalhe: "acesso bloqueado", tom: "perigo" },
  desconhecido: { chave: "desconhecido", rotulo: "Estado desconhecido", detalhe: null, tom: "neutro" },
};

/**
 * A situacao do cliente: o tipo de acesso de `accessState`, que ja poe a
 * desativada primeiro. A precedencia e a mesma do filtro em
 * SQL (`admin_empresas_pagina`, gemeo de `accessState`).
 */
export function situacaoDaConta(row: BillingRow, agora: number): Situacao {
  const acesso = accessState(row, new Date(agora));
  const base = SITUACAO_DO_TIPO[acesso.kind];
  if (acesso.kind === "em_teste") {
    const dias = acesso.trialDaysLeft;
    return {
      ...base,
      detalhe: dias == null ? "sem prazo" : `${dias} ${plural(dias, "dia restante", "dias restantes")}`,
      tom: acesso.warn ? "aviso" : "neutro",
      kind: acesso.kind,
    };
  }
  return { ...base, kind: acesso.kind };
}

/**
 * Os filtros da lista, cada um um conjunto de SITUACOES (que saem do tipo de
 * acesso). A `chave` e o valor que o SQL entende (`p_situacao` de
 * `admin_empresas_pagina`, que repete a mesma precedencia): "Em teste" inclui os
 * testes que ja terminaram, que o selo da linha distingue como "Teste encerrado".
 * "Estado desconhecido" nao aparece na central (o CHECK do banco nao deixa outro
 * status).
 */
export const FILTROS_DE_SITUACAO = [
  { chave: "vitalicio", rotulo: "Vitalícios", situacoes: ["vitalicio"] },
  { chave: "trialing", rotulo: "Em teste", situacoes: ["em_teste", "teste_encerrado"] },
  { chave: "active", rotulo: "Ativos", situacoes: ["ativo"] },
  { chave: "past_due", rotulo: "Atrasados", situacoes: ["atrasado"] },
  { chave: "canceled", rotulo: "Cancelados", situacoes: ["cancelado"] },
  { chave: "bloqueado", rotulo: "Bloqueados", situacoes: ["bloqueado"] },
  { chave: "desativado", rotulo: "Desativados", situacoes: ["desativado"] },
] as const satisfies readonly { chave: string; rotulo: string; situacoes: readonly SituacaoChave[] }[];

export type FiltroDeSituacao = (typeof FILTROS_DE_SITUACAO)[number]["chave"];

export function ehFiltroDeSituacao(v: unknown): v is FiltroDeSituacao {
  return FILTROS_DE_SITUACAO.some((f) => f.chave === v);
}

/** A situacao cabe no filtro? (o preview filtra assim; o SQL repete a regra). */
export function situacaoNoFiltro(chave: SituacaoChave, filtro: FiltroDeSituacao): boolean {
  const f = FILTROS_DE_SITUACAO.find((x) => x.chave === filtro);
  return !!f && (f.situacoes as readonly SituacaoChave[]).includes(chave);
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
  const acesso = accessState(e.conta, new Date(e.agora));
  // Desativada pelo dono do produto: nada a cobrar dela (a situacao ja diz tudo).
  if (acesso.kind === "desativado") return [];
  const alertas: Alerta[] = [];
  const ia = e.estado;

  if (ia === "parada") {
    alertas.push({ chave: "limite_parado", rotulo: "IA parada no limite", tom: "perigo" });
  }
  // Pagamento: os dois tipos de atraso de `accessState` (na carencia ou ja bloqueado).
  if (acesso.kind === "carencia" || acesso.kind === "atrasado_bloqueado") {
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

// ---------------------------------------------------------------------------
// Pedidos de ajuda em aberto (27/10/2026, dono)
// ---------------------------------------------------------------------------

/**
 * Os pedidos de ajuda (`handoffs`) que a empresa ainda não fechou, contados no
 * banco (`admin_pedidos_abertos`). Fica FORA da lista de `alertasDaConta` de
 * propósito: é um ícone próprio ao lado do nome, não disputa o lugar do alerta
 * principal (a ordem daquela lista é decisão registrada em `admin.md`).
 */
export interface PedidosEmAberto {
  abertos: number;
  /** `opened_at` do mais antigo ainda aberto; nulo quando não há nenhum. */
  maisAntigo: string | null;
}

export const SEM_PEDIDOS: PedidosEmAberto = { abertos: 0, maisAntigo: null };

const HORA_MS = 3_600_000;

/** "há 5 dias", "há 3 horas", "há menos de 1 hora". */
export function haQuanto(iso: string, agora: number): string {
  const horas = Math.floor((agora - Date.parse(iso)) / HORA_MS);
  if (!Number.isFinite(horas) || horas < 1) return "há menos de 1 hora";
  if (horas < 24) return `há ${horas} ${plural(horas, "hora", "horas")}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${plural(dias, "dia", "dias")}`;
}

/**
 * O texto do ícone, ou `null` quando ele não aparece. Regra do dono: UM pedido
 * aberto já mostra; nenhum outro limite.
 * Ex.: "7 pedidos de ajuda abertos · o mais antigo há 5 dias".
 */
export function textoDosPedidosAbertos(p: PedidosEmAberto, agora: number): string | null {
  if (p.abertos < 1) return null;
  const quantos =
    p.abertos === 1 ? "1 pedido de ajuda aberto" : `${p.abertos} pedidos de ajuda abertos`;
  if (!p.maisAntigo) return quantos;
  // Um só: "1 pedido de ajuda aberto há 3 horas" (o "mais antigo" de um é ele mesmo).
  const ha = haQuanto(p.maisAntigo, agora);
  return p.abertos === 1 ? `${quantos} ${ha}` : `${quantos} · o mais antigo ${ha}`;
}

// ---------------------------------------------------------------------------
// Lembretes da agenda que não saíram (28/10/2026, dono)
// ---------------------------------------------------------------------------

/**
 * Horários futuros cujo lembrete automático a Evolution recusou e que ainda não
 * saíram (`admin_lembretes_com_falha`). Mesmo padrão dos pedidos abertos: um
 * ícone próprio ao lado do nome, fora de `alertasDaConta`. A execução seguinte
 * das 9h tenta de novo enquanto o horário não passou.
 */
export interface LembretesComFalha {
  falhas: number;
  /** Quando falhou o mais antigo; nulo quando não há nenhum. */
  maisAntiga: string | null;
}

export const SEM_FALHAS_DE_LEMBRETE: LembretesComFalha = { falhas: 0, maisAntiga: null };

/** O texto do ícone, ou `null`. Ex.: "2 lembretes da agenda não saíram · o mais antigo há 3 horas". */
export function textoDosLembretesComFalha(l: LembretesComFalha, agora: number): string | null {
  if (l.falhas < 1) return null;
  const quantos = l.falhas === 1 ? "1 lembrete da agenda não saiu" : `${l.falhas} lembretes da agenda não saíram`;
  if (!l.maisAntiga) return quantos;
  const ha = haQuanto(l.maisAntiga, agora);
  return l.falhas === 1 ? `${quantos} (${ha})` : `${quantos} · o mais antigo ${ha}`;
}
