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
import type { Cambio } from "@/lib/cambio";
import type { CambioDaTela } from "@/lib/use-cambio";
import { janelaDoChip, picosDeHistorico, type DadosDePicos } from "@/lib/picos";
import type { PreviewDoCliente } from "@/lib/admin-cliente-fonte";
import { financeiroDe, type Cobranca } from "@/lib/admin-conta";
import { PLAN_ORDER, PLANS } from "@/lib/billing";
import type { EstadoDoWhatsApp, PedidosEmAberto } from "@/lib/admin-alertas";
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
    // 4. Agente desativado, teste sem prazo.
    linha(4, "Loja Teste", [120_000, 40_000, 3_000], {
      agent_enabled: false,
      subscription_status: "trialing",
      ultima_atividade: iso(12 * D),
    }),
    // 5. Limite maior, nunca teve turno, no ar há 60 dias: "Sem atividade".
    linha(5, "OBM", [0, 0, 0], {
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

// Pedidos de ajuda abertos (ícone da lista, 27/10/2026): um cliente com vários e
// antigos, um com um só e recente; o resto sem nenhum (sem ícone).
// Pelo NOME, e os dois na primeira página da lista (que é em ordem de nome).
const PEDIDOS_FALSOS: Record<string, (agora: number) => PedidosEmAberto> = {
  "Barbearia do Zé": (agora) => ({ abertos: 7, maisAntigo: new Date(agora - 5 * D - 3 * H).toISOString() }),
  "Ateliê Lumière": (agora) => ({ abertos: 1, maisAntigo: new Date(agora - 3 * H).toISOString() }),
};

export function clientesFalsos(agora: number): EmpresaItem[] {
  return linhasFalsas(agora).map((l) => paraEmpresa(l, MODELO, agora, PEDIDOS_FALSOS[l.name]?.(agora)));
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

/** Quantos dias para trás o uso falso vai: mais de três meses, para o seletor ter meses passados. */
const DIAS_DE_HISTORICO = 100;

/** O peso de cada hora num dia (8h às 21h, pico às 14h; segunda tem um pico extra às 16h), para repartir os turnos do dia. */
function pesoDaHora(dow: number, h: number): number {
  if (h < 8 || h > 21) return 0;
  const peso = dow === 0 || dow === 6 ? 1 : 3;
  return peso * (1 + ((h * 5 + dow * 3) % 7)) + (dow === 1 && h === 16 ? 25 : 0);
}

/**
 * O histórico falso: para cada dia, os turnos de cada hora (24 números). O total do dia é o de sempre
 * (`6 + ((dia * 7) % 13) * 4`), repartido pelas horas com `pesoDaHora`; hoje só tem as horas que já passaram.
 */
function historicoFalso(agora: number): { dia: string; horas: number[] }[] {
  const hoje = diaIsoSP(agora);
  const horaAtual = Number(FMT_HORA.format(new Date(agora)));
  const saida: { dia: string; horas: number[] }[] = [];
  for (let dia = somarDias(hoje, -DIAS_DE_HISTORICO); dia <= hoje; dia = somarDias(dia, 1)) {
    const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
    const total = 6 + ((Number(dia.slice(8)) * 7) % 13) * 4;
    const pesos = Array.from({ length: 24 }, (_, h) => (dia === hoje && h > horaAtual ? 0 : pesoDaHora(dow, h)));
    const soma = pesos.reduce((s, p) => s + p, 0);
    const horas = pesos.map((p) => Math.floor((total * p) / soma));
    // O resto da divisão vai para a hora de maior peso, para o total do dia fechar.
    horas[pesos.indexOf(Math.max(...pesos))] += total - horas.reduce((s, n) => s + n, 0);
    saida.push({ dia, horas });
  }
  return saida;
}

function usoFalso(agora: number, vazio: boolean, escala = 1): { bruto: UsoBruto; hist: { dia: string; horas: number[] }[] } {
  if (vazio) return { bruto: { dias: [], horas: [], primeira: null }, hist: [] };
  const hoje = diaIsoSP(agora);
  const hist = historicoFalso(agora);
  const dias: DiaDeUso[] = hist.map(({ dia, horas }) => {
    const turnos = horas.reduce((s, n) => s + n, 0);
    return { dia, turnos, tokens: { entrada: turnos * 4700 * escala, cache: turnos * 2300 * escala, saida: turnos * 85 * escala } };
  });
  // Por hora (as últimas 48): ontem tem movimento entre 8h e 21h; HOJE tem em toda hora, para o "Dia" (00h
  // até agora) nunca ficar vazio conforme o relógio de quem abre o preview.
  const horas: HoraDeUso[] = [];
  for (const { dia, hora } of horasRecentes(agora, 48)) {
    if ((hora < 8 || hora > 21) && dia !== hoje) continue;
    const turnos = 2 + ((hora * 5) % 9) + (hora === 14 ? 14 : 0);
    horas.push({
      chave: `${dia}T${String(hora).padStart(2, "0")}`,
      turnos,
      tokens: { entrada: turnos * 4700 * escala, cache: turnos * 2300 * escala, saida: turnos * 85 * escala },
    });
  }
  const picos = Object.fromEntries(
    ORDEM_PERIODOS.map((k) => [k, picosDeHistorico(hist, janelaDoChip(k, hoje))])
  ) as Record<PeriodoKey, DadosDePicos>;
  return { bruto: { dias, horas, primeira: dias[0].dia, picos }, hist };
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
    // O período anterior do preview: um pouco menos movimento e um primeiro atendimento mais lento.
    anteriores: ORDEM_PERIODOS.map((k, i) => ({
      ...janelaFalsa(FATOR[k] * 0.8),
      janela: i + 1,
      dif_lo: 52_000,
      dif_hi: 58_000,
      dif_soma: 2_200_000,
    })),
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
  vazio: boolean,
  /** Multiplica os tokens do uso falso (prova um número grande no centro do donut). */
  escala = 1
): PreviewDoCliente {
  const { bruto, hist } = usoFalso(agora, vazio, escala);
  return {
    uso: usoParaTela(bruto, agora, MODELO),
    memoria: { dias: bruto.dias, hist, primeira: bruto.primeira ?? null, agora, modelo: MODELO },
    atendimento: atendimentoFalso(agora, vazio),
    whatsapp,
    cobrancas: cobrancasFalsas(e, agora),
  };
}

/** A cotação FALSA do preview (só desenho: na tela de verdade ela vem da PTAX do Banco Central). */
export function cambioFalso(agora: number, indisponivel = false): Cambio | null {
  return indisponivel ? null : { taxa: 5.0521, data: diaIsoSP(agora) };
}

/**
 * A cotação do preview como a página de verdade a entrega: pronta, ou como PROMESSA (`?cambio=atraso`: chega depois
 * de 3 s; `?cambio=falha`: chega vazia depois de 0,6 s), para provar que a tela abre em US$ e troca para
 * reais sem a página esperar (`useCambio`).
 */
export function cambioDoPreview(agora: number, modo?: string, indisponivel = false): CambioDaTela {
  if (modo === "atraso") return new Promise((resolve) => setTimeout(() => resolve(cambioFalso(agora)), 3000));
  if (modo === "falha") return new Promise((resolve) => setTimeout(() => resolve(null), 600));
  return cambioFalso(agora, indisponivel);
}

export function detalheFalso(
  e: EmpresaItem,
  agora: number,
  opcoes: { vazio?: boolean } = {}
): DetalheDoCliente {
  const asaas = e.nome === COM_ASSINATURA;
  return {
    empresa: e,
    agora,
    // O cliente do preview sem uso ainda não teve turno: vale o modelo do sistema.
    modelo: { nome: MODELO, origem: opcoes.vazio ? "sistema" : "ultimo_turno" },
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
