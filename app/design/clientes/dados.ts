import { FUSO, diaIsoSP, somarDias } from "@/lib/fuso";
import { paraEmpresa, type EmpresaItem, type LinhaEmpresa } from "@/lib/admin-empresas";
import {
  atendimentoPorPeriodo,
  usoParaTela,
  type AtendimentoPorPeriodo,
  type DetalheDoCliente,
  type DiaDeUso,
  type HoraDeUso,
  type UsoBruto,
} from "@/lib/admin-cliente";
import type { PreviewDoCliente } from "@/lib/admin-cliente-fonte";
import { financeiroDe, type Cobranca } from "@/lib/admin-conta";
import { PLAN_ORDER, PLANS } from "@/lib/billing";
import type { EstadoDoWhatsApp } from "@/lib/admin-alertas";
import { SERIES_VAZIAS, type JanelaAgregada, type SeriesAgregadas } from "@/lib/painel-agregado";
import { ORDEM_PERIODOS, type PeriodoKey } from "@/lib/periodo";

// Dados FALSOS da central do dono, para os previews `/design/clientes` e
// `/design/clientes/detalhe` (dev-only). Passam pelas MESMAS contas das telas de
// verdade (`paraEmpresa`, `usoParaTela`, `atendimentoDe`): o preview prova o
// desenho e a conta, nunca o banco.

const H = 3_600_000;
const D = 24 * H;
const MODELO = "gpt-5.4-mini";

export function idFalso(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function linhasFalsas(agora: number): LinhaEmpresa[] {
  const iso = (ms: number) => new Date(agora - ms).toISOString();
  const futuro = (ms: number) => new Date(agora + ms).toISOString();

  const linha = (
    n: number,
    nome: string,
    tokens: [number, number, number],
    extra: Partial<LinhaEmpresa> = {}
  ): LinhaEmpresa => ({
    id: idFalso(n),
    name: nome,
    account_type: "beta",
    billing_plan: null,
    agent_enabled: true,
    agent_published_at: iso(40 * D),
    ia_limite_tokens: null,
    tokens_entrada: tokens[0],
    tokens_cache: tokens[1],
    tokens_saida: tokens[2],
    ultima_atividade: iso(n * H),
    subscription_status: "active",
    trial_ends_at: null,
    grace_until: null,
    created_at: iso(60 * D),
    tem_instancia: true,
    vitalicio_desde: null,
    bloqueado_em: null,
    desativada_em: null,
    ...extra,
  });

  return [
    // 1. Ativo, plano Essencial, uso normal, sem alerta.
    linha(1, "Barbearia do Zé", [2_400_000, 1_200_000, 42_000], { billing_plan: "essencial" }),
    // 2. Em teste (5 dias), 85% do padrão: alerta "Perto do limite de IA".
    linha(2, "Clínica Sorriso", [8_330_000, 4_100_000, 170_000], {
      subscription_status: "trialing",
      trial_ends_at: futuro(4.5 * D),
    }),
    // 3. Em teste, IA parada no limite gravado (5 mi): alerta mais urgente.
    linha(3, "Dra Maria Jullia", [5_020_000, 2_500_000, 90_000], {
      ia_limite_tokens: 5_000_000,
      subscription_status: "trialing",
      trial_ends_at: futuro(2.5 * D),
    }),
    // 4. Agente desativado, teste sem prazo, sem tipo.
    linha(4, "Loja Teste", [120_000, 40_000, 3_000], {
      agent_enabled: false,
      account_type: null,
      subscription_status: "trialing",
      ultima_atividade: iso(12 * D),
    }),
    // 5. Interno, limite maior, nunca teve turno, no ar há 60 dias: "Sem atividade".
    linha(5, "OBM", [0, 0, 0], {
      account_type: "interno",
      ia_limite_tokens: 50_000_000,
      ultima_atividade: null,
      billing_plan: "avancado",
    }),
    // 6. Nunca publicou, sem WhatsApp, criada ontem: "Montagem não terminada".
    linha(6, "Pizzaria Bella", [0, 0, 0], {
      agent_published_at: null,
      ultima_atividade: null,
      tem_instancia: false,
      subscription_status: "trialing",
      trial_ends_at: futuro(6 * D),
      created_at: iso(1 * D),
    }),
    // 7. Pagamento atrasado, dentro da carência: "Pagamento atrasado" (âmbar).
    linha(7, "Estúdio Aurora", [900_000, 300_000, 18_000], {
      subscription_status: "past_due",
      grace_until: futuro(3 * D),
      billing_plan: "profissional",
    }),
    // 8. Cancelado, parado há 20 dias.
    linha(8, "Mercearia Central", [60_000, 10_000, 1_500], {
      subscription_status: "canceled",
      ultima_atividade: iso(20 * D),
      billing_plan: "essencial",
    }),
    // 9. Teste que já terminou: bloqueado.
    linha(9, "Ótica Vision", [400_000, 150_000, 9_000], {
      subscription_status: "trialing",
      trial_ends_at: iso(2 * D),
      ultima_atividade: iso(9 * D),
    }),
    // 18. Vitalício (teste vencido por baixo: a marca vence o estado gravado).
    linha(18, "Ateliê Lumière", [700_000, 200_000, 12_000], {
      subscription_status: "trialing",
      trial_ends_at: iso(20 * D),
      vitalicio_desde: iso(10 * D),
    }),
    // 19. Bloqueio manual do dono do produto (assinatura ativa por baixo).
    linha(19, "Padaria Pão Quente", [200_000, 50_000, 4_000], {
      billing_plan: "essencial",
      bloqueado_em: iso(2 * D),
    }),
    // 20. Desativada: nada entra; pronta para "Apagar de vez".
    linha(20, "Academia Força", [0, 0, 0], {
      subscription_status: "trialing",
      trial_ends_at: iso(30 * D),
      ultima_atividade: iso(40 * D),
      desativada_em: iso(5 * D),
    }),
    ...Array.from({ length: 8 }, (_, i) =>
      linha(10 + i, `Cliente de exemplo ${String(i + 1).padStart(2, "0")}`, [300_000 * (i + 1), 100_000, 5_000 * (i + 1)], {
        billing_plan: i % 2 === 0 ? "essencial" : "profissional",
      })
    ),
  ];
}

export function clientesFalsos(agora: number): EmpresaItem[] {
  return linhasFalsas(agora).map((l) => paraEmpresa(l, MODELO, agora));
}

// --- Uso de IA falso: o mês até hoje e a grade de 30 dias -------------------

const FMT_HORA = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" });

/** As 25 últimas horas civis de São Paulo (a atual e as 24 anteriores), da mais antiga à atual. */
function horasRecentes(agora: number, quantas: number): { dia: string; hora: number }[] {
  return Array.from({ length: quantas }, (_, k) => {
    const inst = new Date(agora - (quantas - 1 - k) * H);
    return { dia: diaIsoSP(inst), hora: Number(FMT_HORA.format(inst)) };
  });
}

function usoFalso(agora: number, vazio: boolean): UsoBruto {
  if (vazio) return { dias: [], horas: [], cubo: [] };
  const hoje = diaIsoSP(agora);
  const dias: DiaDeUso[] = [];
  for (let dia = somarDias(hoje, -30); dia <= hoje; dia = somarDias(dia, 1)) {
    const n = Number(dia.slice(8));
    const turnos = 6 + ((n * 7) % 13) * 4;
    dias.push({
      dia,
      turnos,
      tokens: { entrada: turnos * 4700, cache: turnos * 2300, saida: turnos * 85 },
    });
  }
  // Por hora: movimento só entre 8h e 21h, com um pico às 14h.
  const horas: HoraDeUso[] = [];
  for (const { dia, hora } of horasRecentes(agora, 25)) {
    if (hora < 8 || hora > 21) continue;
    const turnos = 2 + ((hora * 5) % 9) + (hora === 14 ? 14 : 0);
    horas.push({
      chave: `${dia}T${String(hora).padStart(2, "0")}`,
      turnos,
      tokens: { entrada: turnos * 4700, cache: turnos * 2300, saida: turnos * 85 },
    });
  }
  const cubo: [number, number, number][] = [];
  for (let dw = 0; dw < 7; dw++) {
    for (let h = 8; h <= 21; h++) {
      const peso = dw === 0 || dw === 6 ? 1 : 3;
      const n = peso * (1 + ((h * 5 + dw * 3) % 7)) + (dw === 1 && h === 16 ? 25 : 0);
      cubo.push([dw, h, n]);
    }
  }
  return { dias, horas, cubo };
}

/** As respostas por dia e por hora que `painel_series` devolveria: a IA responde mais que o time. */
function seriesFalsas(agora: number, vazio: boolean): SeriesAgregadas | null {
  if (vazio) return null;
  const hoje = diaIsoSP(agora);
  const dias: SeriesAgregadas["dias"] = [];
  for (let dia = somarDias(hoje, -31); dia <= hoje; dia = somarDias(dia, 1)) {
    const n = Number(dia.slice(8));
    dias.push([dia, 30 + ((n * 7) % 13) * 5, 4 + ((n * 3) % 6)]);
  }
  const horas: SeriesAgregadas["horas"] = [];
  for (const { dia, hora } of horasRecentes(agora, 48)) {
    if (hora < 8 || hora > 21) continue;
    horas.push([dia, hora, 3 + ((hora * 5) % 9) + (hora === 14 ? 9 : 0), hora % 4 === 0 ? 2 : 0]);
  }
  return { ...SERIES_VAZIAS, dias, horas };
}

// --- Atendimento falso: números fixos, para provar a conta da aba ----------

/** A janela do painel com números fixos (`fator` vezes o dia); `janelaFalsa(0)` é uma janela sem movimento. */
export function janelaFalsa(fator: number): JanelaAgregada {
  return {
    janela: 1,
    conversas: 48 * fator,
    sem_humano: 36 * fator,
    respostas_ia: 210 * fator,
    recebidas: 260 * fator,
    dif_n: 40,
    dif_lo: 42_000,
    dif_hi: 46_000,
    dif_soma: 1_760_000,
    dif_rapidas: 10,
    pessoas_novas: 12 * fator,
    primeira_em: null,
    leads: 20 * fator,
    pausar: 9 * fator,
    agendar: 3 * fator,
  };
}

const FATOR: Record<PeriodoKey, number> = { dia: 1, semana: 7, quinzena: 15, mes: 30 };

/**
 * Os quatro períodos pelo MESMO caminho da tela de verdade (`atendimentoPorPeriodo`):
 * as linhas do banco, uma janela por período, na ordem de `ORDEM_PERIODOS`.
 */
function atendimentoFalso(agora: number, vazio: boolean): AtendimentoPorPeriodo {
  const janelas = ORDEM_PERIODOS.map((k, i) =>
    vazio
      ? { ...janelaFalsa(0), janela: i + 1, dif_n: 0, dif_lo: null, dif_hi: null, dif_soma: 0, dif_rapidas: 0 }
      : { ...janelaFalsa(FATOR[k]), janela: i + 1 }
  );
  if (vazio) return atendimentoPorPeriodo({ janelas, motivos: [], solucoes: [], regrasSalvas: 0, agora });
  return atendimentoPorPeriodo({
    janelas,
    series: seriesFalsas(agora, false),
    agora,
    // A soma dos motivos é a das soluções (os dois contam os mesmos pedidos): 9f + 2.
    motivos: ORDEM_PERIODOS.flatMap((k, i) => [
      { janela: i + 1, motivo: "preco", n: 4 * FATOR[k] },
      { janela: i + 1, motivo: "pessoa", n: 3 * FATOR[k] },
      { janela: i + 1, motivo: "falta_info", n: 2 * FATOR[k] },
      { janela: i + 1, motivo: null, n: 2 },
    ]),
    solucoes: ORDEM_PERIODOS.flatMap((k, i) => [
      { janela: i + 1, solucao: "orientou_ia", aberto: false, n: 4 * FATOR[k] },
      { janela: i + 1, solucao: "time_resolveu", aberto: false, n: 3 * FATOR[k] },
      { janela: i + 1, solucao: "time_assumiu", aberto: false, n: 2 * FATOR[k] },
      { janela: i + 1, solucao: null, aberto: false, n: 1 },
      { janela: i + 1, solucao: null, aberto: true, n: 1 },
    ]),
    regrasSalvas: 4,
  });
}

/** O único cliente falso com assinatura no Asaas (para a aba Financeiro). */
const COM_ASSINATURA = "Estúdio Aurora";

function cobrancasFalsas(e: EmpresaItem, agora: number): Cobranca[] | null {
  if (e.nome !== COM_ASSINATURA) return null;
  const dia = (d: number) => diaIsoSP(agora - d * D);
  return [
    { vencimento: dia(2), valor: 347, status: "OVERDUE" },
    { vencimento: dia(32), valor: 347, status: "RECEIVED" },
    { vencimento: dia(62), valor: 347, status: "RECEIVED" },
  ];
}

export function previewDoCliente(
  e: EmpresaItem,
  agora: number,
  whatsapp: EstadoDoWhatsApp,
  vazio: boolean
): PreviewDoCliente {
  return {
    uso: usoParaTela(usoFalso(agora, vazio), agora, MODELO),
    atendimento: atendimentoFalso(agora, vazio),
    whatsapp,
    cobrancas: cobrancasFalsas(e, agora),
  };
}

export function detalheFalso(e: EmpresaItem, agora: number): DetalheDoCliente {
  const asaas = e.nome === COM_ASSINATURA;
  return {
    empresa: e,
    agora,
    modoDoPrompt: e.nome === "OBM" ? "avancado" : "guiado",
    avisosConfigurados: e.publicada,
    donoEmail: `dono@${e.nome.toLowerCase().replace(/[^a-z0-9]+/g, "")}.exemplo`,
    membros: e.nome === "Barbearia do Zé" ? 3 : 1,
    // Pela MESMA função do servidor (`financeiroDe`): os ids saem mascarados.
    financeiro: financeiroDe({
      billing_plan: PLAN_ORDER.find((k) => PLANS[k].name === e.plano) ?? null,
      billing_provider: asaas ? "asaas" : null,
      billing_customer_id: asaas ? "cus_000000aurora" : null,
      billing_subscription_id: asaas ? "sub_00000000aur1" : null,
      billing_seats: asaas ? 2 : null,
      billing_updated_at: asaas ? new Date(agora - 3 * D).toISOString() : null,
    }),
  };
}
