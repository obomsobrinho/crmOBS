"use client";

import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Stat, StatFrase, StatLegenda, StatTopo, StatValor } from "@/components/ui/stat";
import { diaMesHoraSP } from "@/lib/fuso";
import { numeroBR, prettyPhone } from "@/lib/format";
import { ESPERA_AVISO_MS } from "@/lib/painel";
import { cn } from "@/lib/utils";
import { rotuloDoMotivo } from "@/lib/motivos";
import { haQuanto, textoDosPedidosAbertos } from "@/lib/admin-alertas";
import {
  PAGINA_PEDIDOS_DA_CENTRAL,
  type PedidoDaCentral,
  type ResumoDosPedidos,
} from "@/lib/admin-pedidos";
import { usePaginada } from "@/lib/use-paginada";

// "PEDIDOS EM ABERTO" do detalhe de um cliente na central (27/10/2026, pedido do dono), na aba
// Atendimento, logo abaixo de "Por que a IA chamou o time" (a Visão geral só tem o cartão que leva aqui).
// Serve para o dono chamar o cliente com contexto ("você tem pedidos abertos há X dias;
// estes se repetem e podem virar regra"), então abre pelo RESUMO (quantos, o mais antigo),
// depois os motivos que se REPETEM, e por fim a lista de TODOS os abertos, do mais antigo ao
// mais novo. O período escolhido nas outras abas NÃO se aplica: pedido aberto sempre precisa
// ser resolvido. A regra (agrupar, ordenar, o que é repetido) é de lib/admin-pedidos.ts. A
// primeira página e o resumo vêm do servidor com o detalhe; as páginas seguintes, pela
// rolagem (`usePaginada`, 10 por vez). Sem realtime: a central se atualiza ao abrir de novo.
// O ícone da lista de clientes traz até aqui pela âncora `#pedidos`.

const SEM_PARAMS = {};

export default function BlocoDePedidos({
  pedidos,
  agora,
  buscar,
  rolar,
  pronto,
}: {
  /** O resumo e a primeira página; `null` = o servidor não conseguiu ler. */
  pedidos: { resumo: ResumoDosPedidos; primeiros: PedidoDaCentral[] } | null;
  /** O relógio do servidor com que o detalhe foi montado. */
  agora: number;
  buscar: (depois: PedidoDaCentral) => Promise<PedidoDaCentral[]>;
  /** Cada vez que muda (maior que zero), a seção vem para a tela (o cartão da Visão geral). */
  rolar: number;
  /** O que fica ACIMA da seção já está na tela (a leitura da aba chegou): antes disso a rolagem erraria o lugar. */
  pronto: boolean;
}) {
  const primeira = useMemo(() => pedidos?.primeiros ?? [], [pedidos]);
  const { itens, temMais, carregando, fimRef } = usePaginada<PedidoDaCentral, typeof SEM_PARAMS>({
    inicial: primeira,
    temMaisInicial: primeira.length === PAGINA_PEDIDOS_DA_CENTRAL,
    params: SEM_PARAMS,
    // A primeira página só vem do servidor, então não há o que revalidar daqui.
    buscar: async (_p, depois) => (depois ? buscar(depois) : primeira),
    chave: (p) => p.id,
    revalidarAoVoltar: false,
  });

  // Veio pelo ícone da lista (`#pedidos`) ou pelo cartão da Visão geral (`rolar`): a seção aparece na tela.
  // A rolagem é a da área do detalhe, não a da janela, por isso o `scrollIntoView` e não a âncora sozinha,
  // e só depois que o resto da aba desenhou (os gráficos de cima mudam a altura no primeiro quadro).
  const ref = useRef<HTMLDivElement>(null);
  const pelaAncora = useRef(true);
  useEffect(() => {
    if (!pronto) return;
    const veioPelaAncora = pelaAncora.current && window.location.hash === "#pedidos";
    pelaAncora.current = false;
    if (!veioPelaAncora && rolar === 0) return;
    // Um instante depois do commit, e não no próximo quadro: uma aba em segundo plano não desenha
    // quadros, e a rolagem ficaria esperando.
    const t = window.setTimeout(() => ref.current?.scrollIntoView({ block: "start" }), 80);
    return () => window.clearTimeout(t);
  }, [pronto, rolar]);

  const resumo = pedidos?.resumo;
  const frase = resumo && textoDosPedidosAbertos({ abertos: resumo.total, maisAntigo: resumo.maisAntigo }, agora);

  return (
    <Card variant="secao" id="pedidos" ref={ref} data-bloco="atendimento-pedidos" className="scroll-mt-3">
      <h2 className="text-rotulo uppercase text-ink-3">Pedidos em aberto</h2>

      {!pedidos ? (
        <EstadoVazio tamanho="compacto" data-slot="atendimento-pedidos-falha" texto="Não deu para carregar os pedidos agora." />
      ) : !frase ? (
        <EstadoVazio tamanho="compacto" data-slot="atendimento-sem-pedidos" texto="Nenhum pedido de ajuda aberto." />
      ) : (
        <>
          <p
            data-slot="atendimento-pedidos-resumo"
            className="mt-1 text-cartao font-semibold text-ink"
            suppressHydrationWarning
          >
            {frase}
          </p>

          <h3 className="mt-4 text-legenda font-semibold text-ink-2">Por motivo</h3>
          {/* Cartões, e não linhas: o motivo é um NÚMERO a comparar (como no gráfico de cima), a lista é gente. */}
          <ul data-slot="atendimento-pedidos-motivos" className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {pedidos.resumo.porMotivo.map((m) => (
              <li key={m.motivo ?? "sem"} className="flex">
                <Stat
                  variant={m.podeVirarRegra ? "marca" : "bloco"}
                  tamanho="compacto"
                  data-cartao-motivo=""
                  data-motivo={m.motivo ?? ""}
                  data-repetido={m.podeVirarRegra || undefined}
                  className="flex-1"
                >
                  <StatTopo>
                    <span data-slot="atendimento-motivo-rotulo" className="min-w-0 text-apoio font-semibold text-ink">
                      {m.rotulo}
                    </span>
                    {m.podeVirarRegra && <Badge variant="sugestao">Pode virar regra</Badge>}
                  </StatTopo>
                  <StatValor tamanho="compacto">
                    <span data-slot="atendimento-motivo-n">{numeroBR(m.abertos)}</span>{" "}
                    <span className="text-apoio font-normal text-ink-2">{m.abertos === 1 ? "pedido" : "pedidos"}</span>
                  </StatValor>
                  <StatFrase>
                    <span suppressHydrationWarning>
                      {m.abertos === 1 ? "Aberto" : "O mais antigo"} {haQuanto(m.maisAntigo, agora)}
                    </span>
                  </StatFrase>
                </Stat>
              </li>
            ))}
          </ul>

          <h3 className="mt-5 border-t border-line-soft pt-4 text-legenda font-semibold text-ink-2">
            Todos os pedidos, do mais antigo ao mais novo
          </h3>
          <ul data-slot="atendimento-pedidos-lista" className="mt-2 flex flex-col gap-2">
            {itens.map((p) => {
              // A mesma régua de espera da página Pedidos (`ESPERA_AVISO_MS`, lib/painel.ts): passou dela, âmbar.
              const longa = agora - Date.parse(p.abertoEm) >= ESPERA_AVISO_MS;
              return (
                <li
                  key={p.id}
                  data-slot="atendimento-pedido"
                  data-pedido={p.id}
                  data-longa={longa ? "sim" : undefined}
                  className="flex flex-col gap-1 rounded-lg border border-line-soft bg-bloco px-3 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      <span data-slot="atendimento-pedido-quem" className="min-w-0 truncate text-apoio font-semibold text-ink">
                        {p.nome ?? prettyPhone(p.phone)}
                      </span>
                      <Badge variant="motivo" data-motivo={p.motivo}>
                        {rotuloDoMotivo(p.motivo)}
                      </Badge>
                    </div>
                    <span
                      data-slot="atendimento-pedido-idade"
                      title={diaMesHoraSP(p.abertoEm)}
                      className={cn(
                        "shrink-0 pt-0.5 text-legenda tabular-nums",
                        longa ? "font-semibold text-warn-ink" : "text-ink-3"
                      )}
                      suppressHydrationWarning
                    >
                      Aberto {haQuanto(p.abertoEm, agora)}
                    </span>
                  </div>
                  {p.resumo && (
                    <p data-slot="atendimento-pedido-resumo" className="line-clamp-2 text-apoio text-ink-3">
                      {p.resumo}
                    </p>
                  )}
                </li>
              );
            })}
            {temMais && (
              <li
                ref={(el) => {
                  fimRef.current = el;
                }}
                aria-hidden
                className="h-px"
              />
            )}
          </ul>
          {carregando && <p className="mt-2 text-legenda text-ink-3">Carregando mais…</p>}
        </>
      )}

      <StatLegenda>
        Não segue o período escolhido acima: pedido aberto sempre precisa ser resolvido. Agrupados pelo
        motivo que a IA deu; um motivo com mais de um pedido pode virar regra do agente.
      </StatLegenda>
    </Card>
  );
}
