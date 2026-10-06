import { LayoutDashboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveTenant } from "@/lib/auth";
import PainelOperacaoBloco, {
  type JanelaCalculada,
} from "@/components/painel/PainelOperacaoBloco";
import PainelMovimento, {
  type MovimentoJanela,
  type MovimentoKey,
} from "@/components/painel/PainelMovimento";
import {
  PainelFilaCartao,
  PainelUltimaResposta,
} from "@/components/PainelBlocos";
import PainelAssuntos from "@/components/painel/PainelAssuntos";
import PainelMotivos, { type MotivosDoPeriodo } from "@/components/painel/PainelMotivos";
import { contagemPorMotivo } from "@/lib/motivos";
import ValorResumo from "@/components/ValorResumo";
import {
  AreaRolavel,
  DISSOLVER_LISTA,
} from "@/components/ui/dissolver-rolagem";
import { esperaLegivel } from "@/lib/metrics";
import {
  agoraMs,
  ORDEM_PERIODOS,
  PERIODOS,
  type PeriodoKey,
} from "@/lib/periodo";
import { cleanName } from "@/lib/inbox";
import {
  barrasDeHoraDoCubo,
  escolherVerbatim,
  rotuloHorario,
  VERBATIM_MIN_CHARS,
  type CandidatoVerbatim,
} from "@/lib/painel";
import { foraDaLista } from "@/lib/inbox-lista";
import {
  barrasDasSeries,
  diasDoMes,
  metricsDaJanela,
  montarJanelas,
  resumoDeValorAgregado,
} from "@/lib/painel-agregado";
import { carregarAgregadoDoPainel, carregarMotivosDoPainel } from "@/lib/painel-dados";
import { dentroDoHorario, parteLocal } from "@/lib/valor";
import { frasesDeValor, mesFechado, rotuloDoMes } from "@/lib/valor";
import type { BusinessHours } from "@/lib/agent-prompt";
import { semNumeroDeAvisos } from "@/lib/avisos";

export const dynamic = "force-dynamic";

/** As duas janelas do gráfico de movimento, em dias. */
const DIAS_MOVIMENTO: Record<MovimentoKey, number> = { "14": 14, "30": 30 };

// Painel, rodada 3 do desenho.
//
// ARRANJO: coluna principal mais trilha de 380px. Na coluna, a manchete com o
// gráfico de hora dentro, a operação em quatro cartões e o movimento. Na
// trilha, os assuntos e a frase real do agente. A fila subiu para o cabeçalho.
//
// ⚠️ CADA BLOCO MANDA NO PRÓPRIO PERÍODO. Não existe mais seletor global, e por
// isso também não existe mais o aviso escrito de que a manchete "não segue o
// seletor": aviso de texto explicando um controle era o sintoma de o controle
// estar no lugar errado.
//
// Tudo por RLS (tenant). O cálculo mora em módulos puros (lib/valor,
// lib/metrics, lib/periodo, lib/delta, lib/mensagem, lib/painel), então servidor
// e browser leem a MESMA regra e a página não tem opinião própria sobre número
// nenhum.
export default async function PainelPage() {
  const client = await requireActiveTenant();
  const supabase = await createClient();
  const mes = mesFechado();

  // O relógio vem de `lib/periodo`, e não de `Date.now()` escrito aqui: chamada
  // impura no corpo de um Server Component é erro de lint.
  const agora = agoraMs();

  // Todas as janelas (os quatro períodos e o anterior de cada um, as duas do
  // movimento e o mês fechado) pedidas numa chamada só (lib/painel-agregado).
  const plano = montarJanelas(agora, DIAS_MOVIMENTO, {
    inicioMs: Date.parse(mes.inicioISO),
    fimMs: Date.parse(mes.fimISO),
  });

  // As janelas ATUAIS dos quatro períodos, para o bloco de motivos (o anterior
  // não entra: o bloco não compara, só conta).
  const janelasDosMotivos = ORDEM_PERIODOS.map((k) => plano.lista[plano.operacao[k].atual - 1]);

  const [agregado, { data: cfg }, espera, { data: verbatimLinhas }, motivosLinhas] =
    await Promise.all([
      // ⚠️ SEM LINHAS (02/10/2026, R-04, docs/adr/2026-10-02-painel-agrega-no-banco.md).
      // Antes a página baixava até 20.000 linhas e contava em memória, mas o
      // "Max rows" do PostgREST é 1000: acima de 1.000 mensagens os números e o
      // "desde o início" estavam errados em silêncio. Agora o banco devolve
      // escalares por janela (`painel_janelas`) e séries pequenas por data e por
      // dia da semana x minuto (`painel_series`); quem classifica horário,
      // feriado, período e "quem respondeu" continua sendo o TS. O acumulado
      // (janela 0) é "tudo que a IA já fez nesta conta", o que trava a mão de
      // quem ia cancelar. Erro do banco levanta: zero por timeout é número errado.
      carregarAgregadoDoPainel(supabase, {
        clientId: client.id,
        avisos: client.avisos,
        agora,
        janelas: plano.lista,
        mes: { inicioMs: Date.parse(mes.inicioISO), fimMs: Date.parse(mes.fimISO) },
      }),
      // O horário de atendimento vive em agent_config (é configuração da
      // empresa, editada na tela do agente). Sem ele, o resumo omite o número de
      // "fora do horário" em vez de estimar, e o gráfico de hora some junto.
      // Só `hours` sai do jsonb (R-51): a persona e o resto da configuração não
      // têm o que fazer aqui.
      supabase
        .from("clients")
        .select("hours:agent_config->hours, prompt_mode")
        .eq("id", client.id)
        .maybeSingle(),
      // Conversas com handoff em aberto AGORA, e a mais antiga delas. É o único
      // número acionável do painel, e por isso o único que vale consulta
      // própria. A ordenação usa o índice parcial em (client_id, handoff_at).
      // Sem `limit(1)` e sem `count` do banco (29/09/2026): o número de
      // avisos sai da conta (lib/avisos.ts), e isso só dá para fazer com os
      // telefones na mão. São só as conversas com pedido aberto agora.
      supabase
        .from("conversations")
        .select("phone, handoff_at")
        .not("handoff_at", "is", null)
        .order("handoff_at", { ascending: true }),
      // As poucas linhas de onde sai a frase real do agente (lib/painel.ts).
      supabase.rpc("painel_verbatim", {
        p_client: client.id,
        p_min: VERBATIM_MIN_CHARS,
        p_fora: foraDaLista(client.avisos),
      }),
      // Pedidos de ajuda por motivo (06/10/2026, P1 item 4), contados no banco.
      carregarMotivosDoPainel(supabase, {
        clientId: client.id,
        avisos: client.avisos,
        janelas: janelasDosMotivos,
      }),
    ]);

  const motivos = Object.fromEntries(
    ORDEM_PERIODOS.map((k, i) => [k, contagemPorMotivo(motivosLinhas.filter((l) => l.janela === i + 1))])
  ) as Record<PeriodoKey, MotivosDoPeriodo>;

  const hours = (cfg?.hours as BusinessHours | null | undefined) ?? null;

  // O número que RECEBE os avisos do time não é cliente: fora de toda conta
  // (lib/avisos.ts). O banco já o deixa fora das agregações (`p_fora`); aqui só
  // a fila de pedidos abertos, que vem de outra tabela.
  const abertas = semNumeroDeAvisos(
    (espera.data ?? []),
    client.avisos,
    (c) => c.phone
  );

  // Primeira mensagem da conta inteira. O gráfico de movimento usa isto para
  // marcar como trilho os dias que a conta ainda não teve, em vez de desenhar um
  // vale que conta uma queda que nunca houve.
  const desdeMs = agregado.janela(0).primeira_em;

  // ── As quatro janelas da operação ──────────────────────────────────────────
  //
  // Sem truncamento: o teto de linhas deixou de existir, então o período
  // anterior é sempre calculado (antes ele virava `null` quando o acumulado
  // batia no teto).
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

  // ── As duas janelas do movimento ───────────────────────────────────────────
  //
  // 14 e 30 dias, e não os quatro períodos da operação: movimento é tendência, e
  // tendência de 24 horas não existe. São janelas PRÓPRIAS porque o seletor
  // agora é do bloco.
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

  // ── A fila ─────────────────────────────────────────────────────────────────
  const esperando = espera.error ? null : abertas.length;
  const maisVelha = abertas[0]?.handoff_at as string | null | undefined;
  const esperaMs = maisVelha ? agora - Date.parse(maisVelha) : null;
  const esperaTexto = maisVelha ? esperaLegivel(maisVelha, agora) : "";

  // ── A frase real do agente ─────────────────────────────────────────────────
  //
  // A regra mora em lib/painel.ts e é OBJETIVA: a mais recente de uma conversa
  // que a IA atendeu sozinha, com reserva por comprimento. Nunca escolhida a
  // dedo. Vem de `painel_verbatim`, as poucas linhas que ela precisa.
  const candidatosVerbatim = (verbatimLinhas ?? []) as (CandidatoVerbatim & {
    conversa_com_humano: boolean;
  })[];
  const verbatim = escolherVerbatim(
    candidatosVerbatim,
    new Set(candidatosVerbatim.filter((m) => m.conversa_com_humano).map((m) => m.phone))
  );
  // Hora da pergunta e se a resposta saiu com a empresa fechada. As duas saem
  // do MESMO instante, porque pergunta e resposta moram na mesma linha.
  // ⚠️ A LATÊNCIA não é passada: com um `created_at` só, a diferença entre
  // pergunta e resposta não existe no dado, e estimá-la seria inventar.
  const parteVerbatim = verbatim ? parteLocal(verbatim.created_at) : null;
  const verbatimForaDoHorario =
    !!parteVerbatim && !!hours && !dentroDoHorario(parteVerbatim, hours);
  const dois = (n: number) => String(n).padStart(2, "0");
  const verbatimHora = parteVerbatim
    ? dois(parteVerbatim.hora) + "h" + dois(parteVerbatim.minuto)
    : undefined;

  // ── Manchete: mês fechado e acumulado ──────────────────────────────────────
  //
  // O mês fechado é uma janela própria do banco ([inicio, fim), em instantes) e
  // as datas do mês, para fim de semana e feriado, são as do calendário de São
  // Paulo (as fronteiras do mês caem na meia-noite de lá).
  const resumo = resumoDeValorAgregado({
    janela: agregado.janela(plano.mes ?? -1),
    series: agregado.series,
    hours,
    mes: diasDoMes(mes.ano, mes.mes),
  });
  const periodo = rotuloDoMes(mes.ano, mes.mes);
  const frases = frasesDeValor(resumo, periodo);

  const acumulado = resumoDeValorAgregado({
    janela: agregado.janela(0),
    series: agregado.series,
    hours,
    mes: null,
  });
  const frasesAcumuladas = frasesDeValor(acumulado, "desde o início");

  // ⚠️ O GRÁFICO DE HORA TEM QUE COBRIR A MESMA JANELA DA MANCHETE, senão a soma
  // das partes roxas não fecha com o número. Quando o mês fechado está vazio, a
  // manchete cai no acumulado (regra que já existia no ValorResumo), e o gráfico
  // precisa cair junto. É por isso que a janela é escolhida aqui, e não lá
  // dentro: o componente não pode ter uma segunda opinião sobre o período. As
  // duas leem o MESMO cubo (dia da semana x minuto) do banco.
  const caiuNoAcumulado = frases.length === 0 && frasesAcumuladas.length > 0;
  const horas = barrasDeHoraDoCubo(
    caiuNoAcumulado ? agregado.series.cubo : agregado.series.cubo_mes,
    hours
  );

  // ⚠️ O painel NÃO é um cartão branco: é página sobre o canvas, com os cartões
  // flutuando (`Stat variant="elevado"`). É obrigatório no claro por um motivo
  // de token: `--s-bloco` claro é igual ao `--canvas`, então cartão `bloco`
  // dentro de cartão branco ficaria um degrau ABAIXO da casca.
  return (
    <AreaRolavel
      tamanho={DISSOLVER_LISTA}
      className="flex min-h-0 flex-1 flex-col gap-5 pr-1 max-md:px-4 max-md:pb-6 max-md:pt-4"
    >
      {/* Cabeçalho: título à esquerda, fila à direita, na MESMA linha. A fila
          saiu da trilha porque `/painel` é onde o dono cai ao entrar, e o que
          ele precisa saber primeiro é se tem gente esperando. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <LayoutDashboard size={20} className="text-brand-ink" />
            <h1 className="text-titulo">Painel</h1>
          </div>
          <p className="text-apoio text-ink-2">
            O que a IA fez pela conta {client?.name ?? ""}.
          </p>
        </div>
      </div>

      {/* ⚠️ GRADE DE LINHAS COMPARTILHADAS. Ver a explicação em
          app/design/painel/page.tsx: com duas colunas em `flex`, o verbatim caía
          desalinhado do movimento; com linhas compartilhadas os dois começam e
          terminam juntos, seja qual for a altura do conteúdo. */}
      {/* ⚠️ `xl:flex-1` mais `xl:min-h-0` dão à grade uma altura DEFINIDA. Sem
          isso as linhas resolvem pela altura do conteúdo, a lista de assuntos
          cresce sem limite e a rolagem interna dela não tem contra o que
          resolver. A linha elástica é a TERCEIRA (movimento e verbatim), porque
          é ela que a prancha estica até o fim da tela.

          ⚠️ Ela é `minmax(220px, 1fr)` e NÃO `1fr`. `1fr` sozinho é
          `minmax(auto, 1fr)`, ou seja, o mínimo é o min-content do cartão, e era
          ele que impedia a tela de caber em janela mais baixa: quem abre o
          navegador com barra de favoritos perde ~100px e ganhava um resto de
          rolagem. Com o piso explícito a linha cede até 220px e a tela fecha;
          abaixo disso a rolagem volta, que é o certo em monitor pequeno. */}
      {/* CELULAR (plano do mobile, fase 2): uma coluna na ordem do desenho,
          manchete, "precisa de você", operação, movimento, assuntos, última
          resposta. A trilha vira `contents` para a fila e os assuntos entrarem
          na ordem da coluna, e a ordem sai por `order`, sem duplicar bloco. */}
      <div className="grid min-w-0 gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_auto_minmax(220px,1fr)]">
        <div className="min-w-0 max-md:order-1 xl:col-start-1 xl:row-start-1">
          <ValorResumo
            resumo={resumo}
            frases={frases}
            periodo={periodo}
            acumulado={acumulado}
            frasesAcumuladas={frasesAcumuladas}
            parte="manchete"
            horas={horas}
            rotuloHorario={rotuloHorario(hours)}
            avisoHorario={cfg?.prompt_mode !== "avancado"}
          />

        </div>

        <div className="min-w-0 max-md:order-3 xl:col-start-1 xl:row-start-2">
          <PainelOperacaoBloco janelas={janelas} />
        </div>

          {/* ⚠️ NÃO EXISTE "o que mais ela fez" AQUI. A coluna termina no
              movimento, como na prancha da rodada 3. As frases secundárias de
              valor continuam existindo em `frasesDeValor` e aparecem no
              `/design/valor` e no passo de cancelar; o que saiu foi a seção no
              painel, que o desenho não tem. */}
        <div className="min-w-0 [&>section]:h-full max-md:order-4 xl:col-start-1 xl:row-start-3">
          <PainelMovimento janelas={movimento} desdeMs={desdeMs} />
        </div>

        {/* ⚠️ `xl:h-0 xl:min-h-full` conserta um efeito real da grade: este bloco
            ATRAVESSA as linhas 1 e 2, e como as duas são `auto`, a grade somava
            a altura de CONTEÚDO dele (fila mais a lista inteira de assuntos) e
            distribuía a sobra nas duas, abrindo um vão embaixo da manchete e
            outro embaixo da operação. Com `h-0` a contribuição intrínseca vira
            zero, quem dimensiona as linhas passa a ser só a coluna principal, e
            `min-h-full` devolve a altura das duas linhas para ele preencher. */}
        <div className="flex min-h-0 min-w-0 flex-col gap-5 max-md:contents max-md:[&>:first-child]:order-2 max-md:[&>:last-child]:order-5 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:h-0 xl:min-h-full">
          <PainelFilaCartao
            quantas={esperando}
            esperaMs={esperaMs}
            espera={esperaTexto}
          />
          {/* No celular a coluna vira `contents` e cada filho entra na grade pela
              ordem: o primeiro (fila) e o último (assuntos) já têm a sua; este,
              do meio, vai logo depois do movimento. */}
          <PainelMotivos porPeriodo={motivos} className="max-md:order-4" />
          {/* ⚠️ Sem `itens`, e por isso sai o estado vazio honesto: não existe
              coluna que classifique o ASSUNTO de um turno. Quando existir, a
              página passa a lista e o placeholder some sozinho. */}
          <PainelAssuntos />
        </div>

        <div className="min-w-0 [&>section]:h-full max-md:order-6 xl:col-start-2 xl:row-start-3">

          {verbatim && (
            <PainelUltimaResposta
              mensagens={verbatim.mensagens}
              nome={cleanName(verbatim.nomewpp) ?? "um contato"}
              quando={esperaLegivel(verbatim.created_at, agora)}
              href={`/inbox/${encodeURIComponent(verbatim.phone)}`}
              etiqueta={
                verbatim.sozinha ? "atendida só pela IA" : "a mais recente"
              }
              pergunta={verbatim.pergunta ?? undefined}
              perguntaHora={verbatimHora}
              foraDoHorario={verbatimForaDoHorario}
            />
          )}
        </div>
      </div>
    </AreaRolavel>
  );
}
