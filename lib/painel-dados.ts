import type { Supa } from "@/lib/supabase/tipos";
import { foraDaLista } from "@/lib/inbox-lista";
import {
  agregadoDe,
  type AgregadoDoPainel,
  type LimitesDeJanela,
  type SeriesAgregadas,
} from "@/lib/painel-agregado";
import { UM_MINUTO } from "@/lib/valor";

const DIA_MS = 24 * 60 * 60 * 1000;

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Lê do banco o que o painel e a assinatura contam (R-04, R-06): UMA chamada de
 * escalares por janela (`painel_janelas`) e UMA de séries (`painel_series`),
 * ambas com a sessão do usuário (RLS) e sem baixar linha de mensagem.
 *
 * Fonte única das duas telas: `/painel` pede as janelas todas e o mês fechado;
 * `/assinatura` pede só o acumulado (`janelas: []`, `mes: null`). Erro do banco
 * LEVANTA em vez de virar zero: um painel que mostra zero porque a consulta
 * estourou o tempo é número errado em silêncio, que era o defeito.
 */
export async function carregarAgregadoDoPainel(
  supabase: Supa,
  o: {
    clientId: string;
    /** `client.avisos`: o número de avisos do time fica fora de toda conta. */
    avisos: string | null | undefined;
    agora: number;
    janelas: LimitesDeJanela[];
    mes: { inicioMs: number; fimMs: number } | null;
  }
): Promise<AgregadoDoPainel> {
  const fora = foraDaLista(o.avisos);
  const [janelas, series] = await Promise.all([
    supabase.rpc("painel_janelas", {
      p_client: o.clientId,
      p_fora: fora,
      p_agora: iso(o.agora),
      p_de: o.janelas.map((j) => iso(j.de)),
      p_ate: o.janelas.map((j) => iso(j.ate)),
      p_rapida_ms: UM_MINUTO,
    }),
    supabase.rpc("painel_series", {
      p_client: o.clientId,
      p_fora: fora,
      p_ate: iso(o.agora),
      // As colunas por hora só existem para a janela de 24 horas; dois dias
      // sobram para o esqueleto inteiro.
      p_horas_de: iso(o.agora - 2 * DIA_MS),
      p_mes_de: o.mes ? iso(o.mes.inicioMs) : null,
      p_mes_ate: o.mes ? iso(o.mes.fimMs) : null,
    }),
  ]);
  if (janelas.error) throw new Error(`painel_janelas: ${janelas.error.message}`);
  if (series.error) throw new Error(`painel_series: ${series.error.message}`);
  return agregadoDe(
    janelas.data ?? [],
    series.data as SeriesAgregadas | null
  );
}
