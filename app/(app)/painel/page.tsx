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
import ValorResumo from "@/components/ValorResumo";
import {
  AreaRolavel,
  DISSOLVER_LISTA,
} from "@/components/ui/dissolver-rolagem";
import {
  barras,
  computeMetrics,
  esperaLegivel,
  primeirasMensagens,
  type JanelaMsg,
} from "@/lib/metrics";
import {
  agoraMs,
  instanteMaisAntigoNecessario,
  limites,
  naJanela,
  ORDEM_PERIODOS,
  PERIODOS,
  type PeriodoKey,
} from "@/lib/periodo";
import { cleanName } from "@/lib/inbox";
import {
  barrasDeHora,
  escolherVerbatim,
  rotuloHorario,
  type CandidatoVerbatim,
} from "@/lib/painel";
import { dentroDoHorario, parteLocal } from "@/lib/valor";
import {
  frasesDeValor,
  mesFechado,
  resumoDeValor,
  rotuloDoMes,
  type ValorMsg,
  type ValorQual,
} from "@/lib/valor";
import type { BusinessHours } from "@/lib/agent-prompt";

export const dynamic = "force-dynamic";

/** Teto de linhas do acumulado. Ver a guarda de truncamento mais abaixo. */
const TETO = 20000;
/** As duas janelas do gráfico de movimento, em dias. */
const DIAS_MOVIMENTO: Record<MovimentoKey, number> = { "14": 14, "30": 30 };

const DIA_MS = 24 * 60 * 60 * 1000;

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

  const [{ data: todasMsgs }, { data: todasQuals }, { data: cfg }, espera] =
    await Promise.all([
      // Acumulado, SEM janela de data: é o "tudo que a IA já fez nesta conta", e
      // é ele que trava a mão de quem ia cancelar. As janelas de período, o mês
      // fechado e as duas do movimento são recortadas DELE em memória, em vez de
      // virarem consultas próprias.
      //
      // ⚠️ NUNCA `.limit()` sem `order`. Uma versão anterior fazia exatamente
      // isso numa consulta de 7 dias, e um tenant com mais de 5.000 mensagens na
      // semana recebia um subconjunto arbitrário, com os números subestimando em
      // silêncio.
      //
      // `nomewpp` vem junto agora: o verbatim precisa do nome do contato, e
      // antes isso era uma quinta consulta só para uma linha.
      supabase
        .from("chat_messages")
        .select(
          "phone, nomewpp, user_message, bot_message, message_type, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(TETO),
      supabase
        .from("conversation_qualifications")
        .select("id, phone, action, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      // O horário de atendimento vive em agent_config (é configuração da
      // empresa, editada na tela do agente). Sem ele, o resumo omite o número de
      // "fora do horário" em vez de estimar, e o gráfico de hora some junto.
      supabase
        .from("clients")
        .select("agent_config")
        .eq("id", client.id)
        .maybeSingle(),
      // Conversas com handoff em aberto AGORA, e a mais antiga delas. É o único
      // número acionável do painel, e por isso o único que vale consulta
      // própria. A ordenação usa o índice parcial em (client_id, handoff_at).
      supabase
        .from("conversations")
        .select("phone, handoff_at", { count: "exact" })
        .not("handoff_at", "is", null)
        .order("handoff_at", { ascending: true })
        .limit(1),
    ]);

  const hours =
    (cfg?.agent_config as { hours?: BusinessHours } | null)?.hours ?? null;

  const acumuladoMsgs = (todasMsgs ?? []) as (ValorMsg & {
    nomewpp: string | null;
  })[];
  const acumuladoQuals = (todasQuals ?? []) as (ValorQual & {
    id: number;
    summary: string | null;
  })[];

  // O relógio vem de `lib/periodo`, e não de `Date.now()` escrito aqui: chamada
  // impura no corpo de um Server Component é erro de lint.
  const agora = agoraMs();

  // ── Guarda de truncamento ──────────────────────────────────────────────────
  //
  // ⚠️ O acumulado tem teto de linhas, ordenado do mais novo para o mais velho.
  // Se ele bateu no teto E a linha mais antiga que veio já é mais nova do que o
  // começo da janela ANTERIOR mais longa, essa janela está INCOMPLETA, e um selo
  // calculado sobre janela incompleta mostraria variação inventada. Nesse caso o
  // período anterior vira `null` e nenhum cartão mostra selo.
  const maisAntiga = acumuladoMsgs[acumuladoMsgs.length - 1]?.created_at;
  const truncado =
    acumuladoMsgs.length >= TETO &&
    (!maisAntiga ||
      Date.parse(maisAntiga) > instanteMaisAntigoNecessario(agora));

  const primeiras = primeirasMensagens(acumuladoMsgs as JanelaMsg[]);
  // Primeira mensagem da conta inteira. O gráfico de movimento usa isto para
  // marcar como trilho os dias que a conta ainda não teve, em vez de desenhar um
  // vale que conta uma queda que nunca houve.
  const desdeMs = primeiras.size > 0 ? Math.min(...primeiras.values()) : null;

  const recorte = (de: number, ate: number) => ({
    msgs: (acumuladoMsgs as JanelaMsg[]).filter((m) =>
      naJanela(Date.parse(m.created_at), de, ate)
    ),
    quals: acumuladoQuals.filter((q) =>
      naJanela(Date.parse(q.created_at), de, ate)
    ),
  });

  // ── As quatro janelas da operação ──────────────────────────────────────────
  const janelas = Object.fromEntries(
    ORDEM_PERIODOS.map((k) => {
      const p = PERIODOS[k];
      const lim = limites(p, agora);
      const atual = recorte(lim.de, lim.ate);
      const ant = recorte(lim.anteriorDe, lim.anteriorAte);
      const janela: JanelaCalculada = {
        key: k,
        metrics: computeMetrics({
          ...atual,
          primeiras,
          de: lim.de,
          ate: lim.ate,
        }),
        anterior: truncado
          ? null
          : computeMetrics({
              ...ant,
              primeiras,
              de: lim.anteriorDe,
              ate: lim.anteriorAte,
            }),
        barras: barras(atual.msgs, p.dias, agora),
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
      const de = agora - dias * DIA_MS;
      const anteriorDe = agora - dias * 2 * DIA_MS;
      const atual = recorte(de, agora);
      const ant = recorte(anteriorDe, de);
      const m = computeMetrics({ ...atual, primeiras, de, ate: agora });
      const j: MovimentoJanela = {
        dias,
        barras: barras(atual.msgs, dias, agora),
        conversas: m.conversas,
        conversasAnterior: truncado
          ? null
          : computeMetrics({ ...ant, primeiras, de: anteriorDe, ate: de })
              .conversas,
      };
      return [k, j];
    })
  ) as Record<MovimentoKey, MovimentoJanela>;

  // ── A fila ─────────────────────────────────────────────────────────────────
  const esperando = espera.error ? null : (espera.count ?? 0);
  const maisVelha = espera.data?.[0]?.handoff_at as string | null | undefined;
  const esperaMs = maisVelha ? agora - Date.parse(maisVelha) : null;
  const esperaTexto = maisVelha ? esperaLegivel(maisVelha, agora) : "";

  // ── A frase real do agente ─────────────────────────────────────────────────
  //
  // A regra mora em lib/painel.ts e é OBJETIVA: a mais recente de uma conversa
  // que a IA atendeu sozinha, com reserva por comprimento. Nunca escolhida a
  // dedo. Sai do acumulado que já está em memória, sem consulta nova.
  const verbatim = escolherVerbatim(acumuladoMsgs as CandidatoVerbatim[]);
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

  // ── Manchete: mês fechado, recortado do acumulado ──────────────────────────
  //
  // Comparação por instante (Date.parse) e não por string: o banco devolve
  // "…+00:00" e mesFechado gera "…Z", e comparar esses dois como texto erra
  // exatamente na linha da fronteira.
  const inicioMs = Date.parse(mes.inicioISO);
  const fimMs = Date.parse(mes.fimISO);
  const noMes = (iso: string) => naJanela(Date.parse(iso), inicioMs, fimMs);
  const msgsDoMes = acumuladoMsgs.filter((m) => noMes(m.created_at));

  const resumo = resumoDeValor({
    msgs: msgsDoMes,
    quals: acumuladoQuals.filter((q) => noMes(q.created_at)),
    hours,
  });
  const periodo = rotuloDoMes(mes.ano, mes.mes);
  const frases = frasesDeValor(resumo, periodo);

  const acumulado = resumoDeValor({
    msgs: acumuladoMsgs,
    quals: acumuladoQuals,
    hours,
  });
  const frasesAcumuladas = frasesDeValor(acumulado, "desde o início");

  // ⚠️ O GRÁFICO DE HORA TEM QUE COBRIR A MESMA JANELA DA MANCHETE, senão a soma
  // das partes roxas não fecha com o número. Quando o mês fechado está vazio, a
  // manchete cai no acumulado (regra que já existia no ValorResumo), e o gráfico
  // precisa cair junto. É por isso que a janela é escolhida aqui, e não lá
  // dentro: o componente não pode ter uma segunda opinião sobre o período.
  const caiuNoAcumulado = frases.length === 0 && frasesAcumuladas.length > 0;
  const horas = barrasDeHora({
    msgs: caiuNoAcumulado ? acumuladoMsgs : msgsDoMes,
    hours,
  });

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
