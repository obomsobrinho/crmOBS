import type { Supa } from "@/lib/supabase/tipos";
import type { JanelaCalculada } from "@/components/painel/PainelOperacaoBloco";
import type { MovimentoJanela, MovimentoKey } from "@/components/painel/PainelMovimento";
import type { MotivosDoPeriodo } from "@/components/painel/PainelMotivos";
import { contagemPorMotivo } from "@/lib/motivos";
import { esperaLegivel } from "@/lib/metrics";
import { ORDEM_PERIODOS, PERIODOS, type PeriodoKey } from "@/lib/periodo";
import { cleanName } from "@/lib/inbox";
import { barrasDeHoraDoCubo, escolherVerbatim, rotuloHorario, VERBATIM_MIN_CHARS, type CandidatoVerbatim } from "@/lib/painel";
import { foraDaLista } from "@/lib/inbox-lista";
import {
  barrasDasSeries,
  diasDoMes,
  metricsDaJanela,
  montarJanelas,
  resumoDeValorAgregado,
  type AgregadoDoPainel,
} from "@/lib/painel-agregado";
import { carregarAgregadoDoPainel, carregarMotivosDoPainel } from "@/lib/painel-dados";
import { dentroDoHorario, frasesDeValor, mesFechado, parteLocal, rotuloDoMes } from "@/lib/valor";
import { horarioDaConfig } from "@/lib/horarios";
import { semNumeroDeAvisos } from "@/lib/avisos";

// A LEITURA DO PAINEL (passo 3b de docs/plano-dados-e-estado.md): o que a página do
// servidor lia e calculava até 14/11/2026, agora do navegador, com a sessão de quem
// está logado (RLS). As mesmas leituras em paralelo (`painel_janelas`/`painel_series`
// numa ida, `clients.agent_config->hours`, os pedidos abertos, `painel_verbatim`,
// `painel_motivos`) e o MESMO cálculo, pelas mesmas funções puras (lib/valor,
// lib/metrics, lib/periodo, lib/painel, lib/painel-agregado): a tela não tem opinião
// própria sobre número nenhum. Erro do banco levanta (zero por timeout é número errado).

/** As duas janelas do gráfico de movimento, em dias. */
export const DIAS_MOVIMENTO: Record<MovimentoKey, number> = { "14": 14, "30": 30 };

type Resumo = ReturnType<typeof resumoDeValorAgregado>;

export interface DadosDoPainel {
  resumo: Resumo;
  frases: ReturnType<typeof frasesDeValor>;
  periodo: string;
  acumulado: Resumo;
  frasesAcumuladas: ReturnType<typeof frasesDeValor>;
  horas: ReturnType<typeof barrasDeHoraDoCubo>;
  rotuloHorario: ReturnType<typeof rotuloHorario>;
  avisoHorario: boolean;
  janelas: Record<PeriodoKey, JanelaCalculada>;
  movimento: Record<MovimentoKey, MovimentoJanela>;
  desdeMs: ReturnType<AgregadoDoPainel["janela"]>["primeira_em"];
  esperando: number | null;
  esperaMs: number | null;
  esperaTexto: string;
  motivos: Record<PeriodoKey, MotivosDoPeriodo>;
  verbatim: {
    mensagens: string[];
    nome: string;
    quando: string;
    href: string;
    etiqueta: string;
    pergunta?: string;
    perguntaHora?: string;
    foraDoHorario: boolean;
  } | null;
}

export async function lerPainel(supabase: Supa, s: { clientId: string; avisos: string | null }, agora: number): Promise<DadosDoPainel> {
  const mes = mesFechado();
  const plano = montarJanelas(agora, DIAS_MOVIMENTO, {
    inicioMs: Date.parse(mes.inicioISO),
    fimMs: Date.parse(mes.fimISO),
  });
  const janelasDosMotivos = ORDEM_PERIODOS.map((k) => plano.lista[plano.operacao[k].atual - 1]);

  const [agregado, cfgR, espera, verbatimR, motivosLinhas] = await Promise.all([
    carregarAgregadoDoPainel(supabase, {
      clientId: s.clientId,
      avisos: s.avisos,
      agora,
      janelas: plano.lista,
      mes: { inicioMs: Date.parse(mes.inicioISO), fimMs: Date.parse(mes.fimISO) },
    }),
    supabase
      .from("clients")
      .select("hours:agent_config->hours, hoursConfirmed:agent_config->hoursConfirmed, prompt_mode")
      .eq("id", s.clientId)
      .maybeSingle(),
    supabase.from("conversations").select("phone, handoff_at").not("handoff_at", "is", null).order("handoff_at", { ascending: true }),
    supabase.rpc("painel_verbatim", { p_client: s.clientId, p_min: VERBATIM_MIN_CHARS, p_fora: foraDaLista(s.avisos) }),
    carregarMotivosDoPainel(supabase, { clientId: s.clientId, avisos: s.avisos, janelas: janelasDosMotivos }),
  ]);
  // Como antes: sem a configuração o horário some (não se estima), e sem as linhas da
  // frase real o bloco dela não aparece; só o agregado e os motivos levantam erro.
  const cfg = cfgR.data;

  const motivos = Object.fromEntries(
    ORDEM_PERIODOS.map((k, i) => [k, contagemPorMotivo(motivosLinhas.filter((l) => l.janela === i + 1))])
  ) as Record<PeriodoKey, MotivosDoPeriodo>;

  const hours = horarioDaConfig(cfg);
  const abertas = semNumeroDeAvisos(espera.data ?? [], s.avisos, (c) => c.phone);
  const desdeMs = agregado.janela(0).primeira_em;

  const janelas = Object.fromEntries(
    ORDEM_PERIODOS.map((k) => {
      const par = plano.operacao[k];
      const janela: JanelaCalculada = {
        key: k,
        metrics: metricsDaJanela(agregado.janela(par.atual)),
        anterior: metricsDaJanela(agregado.janela(par.anterior)),
        barras: barrasDasSeries(agregado.series, PERIODOS[k].dias, agora),
      };
      return [k, janela];
    })
  ) as Record<PeriodoKey, JanelaCalculada>;

  const movimento = Object.fromEntries(
    (Object.keys(DIAS_MOVIMENTO) as MovimentoKey[]).map((k) => {
      const dias = DIAS_MOVIMENTO[k];
      const par = plano.movimento[k];
      const j: MovimentoJanela = {
        dias,
        barras: barrasDasSeries(agregado.series, dias, agora),
        conversas: agregado.janela(par.atual).conversas,
        conversasAnterior: agregado.janela(par.anterior).conversas,
      };
      return [k, j];
    })
  ) as Record<MovimentoKey, MovimentoJanela>;

  const esperando = espera.error ? null : abertas.length;
  const maisVelha = abertas[0]?.handoff_at as string | null | undefined;
  const esperaMs = maisVelha ? agora - Date.parse(maisVelha) : null;
  const esperaTexto = maisVelha ? esperaLegivel(maisVelha, agora) : "";

  const candidatosVerbatim = (verbatimR.data ?? []) as (CandidatoVerbatim & { conversa_com_humano: boolean })[];
  const v = escolherVerbatim(
    candidatosVerbatim,
    new Set(candidatosVerbatim.filter((m) => m.conversa_com_humano).map((m) => m.phone))
  );
  const parteVerbatim = v ? parteLocal(v.created_at) : null;
  const dois = (n: number) => String(n).padStart(2, "0");

  const resumo = resumoDeValorAgregado({
    janela: agregado.janela(plano.mes ?? -1),
    series: agregado.series,
    hours,
    mes: diasDoMes(mes.ano, mes.mes),
  });
  const periodo = rotuloDoMes(mes.ano, mes.mes);
  const frases = frasesDeValor(resumo, periodo);
  const acumulado = resumoDeValorAgregado({ janela: agregado.janela(0), series: agregado.series, hours, mes: null });
  const frasesAcumuladas = frasesDeValor(acumulado, "desde o início");
  // O gráfico de hora cobre a MESMA janela da manchete (a explicação está no histórico
  // de app/(app)/painel/page.tsx): mês fechado vazio cai no acumulado, e o gráfico junto.
  const caiuNoAcumulado = frases.length === 0 && frasesAcumuladas.length > 0;
  const horas = barrasDeHoraDoCubo(caiuNoAcumulado ? agregado.series.cubo : agregado.series.cubo_mes, hours);

  return {
    resumo,
    frases,
    periodo,
    acumulado,
    frasesAcumuladas,
    horas,
    rotuloHorario: rotuloHorario(hours),
    avisoHorario: cfg?.prompt_mode !== "avancado",
    janelas,
    movimento,
    desdeMs,
    esperando,
    esperaMs,
    esperaTexto,
    motivos,
    verbatim: v
      ? {
          mensagens: v.mensagens,
          nome: cleanName(v.nomewpp) ?? "um contato",
          quando: esperaLegivel(v.created_at, agora),
          href: `/inbox/${encodeURIComponent(v.phone)}`,
          etiqueta: v.sozinha ? "atendida só pela IA" : "a mais recente",
          pergunta: v.pergunta ?? undefined,
          perguntaHora: parteVerbatim ? dois(parteVerbatim.hora) + "h" + dois(parteVerbatim.minuto) : undefined,
          foraDoHorario: !!parteVerbatim && !!hours && !dentroDoHorario(parteVerbatim, hours),
        }
      : null,
  };
}
