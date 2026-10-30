"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CalendarX2, MessageCircleWarning, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { agoraMs } from "@/lib/periodo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BotaoDeFiltro from "@/components/BotaoDeFiltro";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { CampoBusca } from "@/components/ui/campo-busca";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { cn } from "@/lib/utils";
import { diaMesHoraSP } from "@/lib/fuso";
import { useDebounce } from "@/lib/use-debounce";
import { usePaginada } from "@/lib/use-paginada";
import { custoCurto, type Cambio } from "@/lib/cambio";
import { useCambio, type CambioDaTela } from "@/lib/use-cambio";
import {
  FILTROS_DE_SITUACAO,
  textoDosLembretesComFalha,
  textoDosPedidosAbertos,
  type FiltroDeSituacao,
} from "@/lib/admin-alertas";
import {
  PAGINA_EMPRESAS,
  fonteEmpresasDaApi,
  fonteEmpresasDaMemoria,
  type EmpresaItem,
  type FonteEmpresas,
  type ParamsEmpresas,
} from "@/lib/admin-empresas";
import {
  AvatarCliente,
  ChipAlerta,
  MedidorDoLimite,
  SeloSituacao,
  linhaDoPlano,
  textoDoAgente,
} from "@/components/admin/pecas";

// LISTA DE CLIENTES DA CENTRAL DO DONO (docs/plano-central-clientes.md, entrega 1).
//
// 10 por vez, mais ao rolar (`usePaginada`), busca por nome e filtro de situação
// no SERVIDOR (busca com debounce). Sem realtime (decisão do plano): o botão
// "Atualizar" revalida o que está na tela. A linha inteira abre o detalhe. O
// limite de IA se edita no detalhe, na aba "Ações".
//
// A situação se filtra por UM botão de ícone ao lado da busca, que abre a lista de
// situações e mostra um "1" quando há filtro (eram sete chips ocupando uma linha
// inteira). A linha é um `Link`: no navegador de produção o Next já busca o esqueleto
// do detalhe (`clientes/[id]/loading.tsx`) quando a linha aparece, e o clique mostra
// a tela na hora.
export default function ListaCentral({
  inicial,
  previewTodas,
  hrefModelo = "/clientes/{id}",
  cambio: cambioDaTela = null,
}: {
  /** A primeira página, que o servidor já buscou. */
  inicial: { itens: EmpresaItem[]; temMais: boolean };
  /** Preview `/design/clientes`: a lista roda sobre a memória. */
  previewTodas?: EmpresaItem[];
  /** Para onde a linha leva; o preview aponta para o detalhe de mentira. */
  hrefModelo?: string;
  /**
   * A cotação PTAX do dólar (o custo sai em reais): pronta, `null` (indisponível, os custos ficam em US$) ou a
   * promessa de uma que ainda está sendo buscada (a página não espera por ela, `useCambio`).
   */
  cambio?: CambioDaTela;
}) {
  const simular = !!previewTodas;
  const { cambio, buscando: cambioBuscando } = useCambio(cambioDaTela);
  const [q, setQ] = useState("");
  const busca = useDebounce(q.trim(), 300);
  const [situacao, setSituacao] = useState<FiltroDeSituacao | null>(null);

  const fonte = useMemo<FonteEmpresas>(
    () => (previewTodas ? fonteEmpresasDaMemoria(previewTodas) : fonteEmpresasDaApi()),
    [previewTodas]
  );
  const params = useMemo<ParamsEmpresas>(() => ({ busca, situacao }), [busca, situacao]);

  const { itens, temMais, carregando, fimRef, revalidar } = usePaginada<EmpresaItem, ParamsEmpresas>({
    inicial: inicial.itens,
    temMaisInicial: inicial.temMais,
    params,
    buscar: (p, depois, n) => fonte.pagina(p, depois, n),
    chave: (e) => e.id,
    tamanho: PAGINA_EMPRESAS,
    revalidarAoVoltar: !simular,
  });

  const temBusca = busca.length > 0;

  return (
    <Card asChild variant="pagina" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <section aria-label="Clientes">
        <div className="border-b border-line px-4 pb-3 pt-4 md:px-5">
          <div className="flex items-center gap-2">
            <h1 className="text-titulo">Clientes</h1>
            <Button
              variant="outline"
              size="control"
              data-slot="central-atualizar"
              className="ml-auto"
              carregando={carregando}
              onClick={() => void revalidar()}
            >
              <RefreshCw size={14} />
              Atualizar
            </Button>
          </div>
          <p className="mt-1 text-legenda text-ink-3">
            As empresas que usam o CRM. Uso de IA do mês (fuso de São Paulo), custo estimado pela tabela oficial de
            preços
            {cambio
              ? ", em reais pela PTAX do Banco Central"
              : cambioBuscando
                ? ", em US$ por enquanto (buscando a cotação do dólar)"
                : ", em US$ (a cotação do dólar está indisponível agora)"}
            .
          </p>
          <div className="mt-3 flex items-center gap-2">
            <CampoBusca
              className="min-w-0 flex-1 md:max-w-[420px]"
              valor={q}
              aoMudar={setQ}
              placeholder="Buscar cliente pelo nome"
              rotulo="Buscar clientes"
              aoLimpar={() => setQ("")}
              mostrarLimpar={q !== ""}
            />
            <BotaoDeFiltro
              slot="central-filtro"
              largura="w-52"
              ativos={situacao ? 1 : 0}
              rotulo={
                situacao
                  ? `Filtrar por situação: ${FILTROS_DE_SITUACAO.find((f) => f.chave === situacao)?.rotulo}`
                  : "Filtrar por situação"
              }
              grupos={[
                {
                  titulo: "Situação",
                  opcoes: [
                    { chave: "todos", rotulo: "Todos", marcado: situacao === null, aoEscolher: () => setSituacao(null) },
                    ...FILTROS_DE_SITUACAO.map((f) => ({
                      chave: f.chave,
                      rotulo: f.rotulo,
                      marcado: situacao === f.chave,
                      aoEscolher: () => setSituacao(f.chave),
                    })),
                  ],
                },
              ]}
            />
          </div>
        </div>

        <div
          aria-hidden
          className={`${COLUNAS} border-b border-line-soft px-5 py-2 text-rotulo uppercase text-ink-3 max-xl:hidden`}
        >
          <span>Cliente</span>
          <span>Situação</span>
          <span>WhatsApp</span>
          <span>Agente</span>
          <span>Uso de IA no mês</span>
          <span>Última atividade</span>
        </div>

        <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
          {itens.length === 0 && !carregando ? (
            <EstadoVazio
              data-slot="central-vazio"
              icone={Building2}
              titulo={
                temBusca
                  ? `Nenhum cliente para “${busca}”`
                  : situacao
                    ? "Nenhum cliente nesta situação"
                    : "Nenhum cliente ainda"
              }
              texto={
                temBusca
                  ? "A busca olha o nome do cliente."
                  : situacao
                    ? "Escolha outra situação ou volte para Todos."
                    : "Quem se cadastrar no CRM aparece aqui."
              }
            />
          ) : (
            <ul data-slot="central-lista">
              {itens.map((e) => (
                <Linha key={e.id} e={e} href={hrefModelo.replace("{id}", e.id)} cambio={cambio} />
              ))}
              {temMais && (
                <li
                  ref={(el) => {
                    fimRef.current = el;
                  }}
                  data-slot="central-mais"
                  aria-hidden
                  className="h-px"
                />
              )}
              {carregando && (
                <li data-slot="central-carregando" className="px-5 py-3 text-legenda text-ink-3">
                  Carregando…
                </li>
              )}
            </ul>
          )}
        </AreaRolavel>
      </section>
    </Card>
  );
}


/**
 * O ícone dos pedidos de ajuda abertos (27/10/2026, dono): aparece com UM pedido
 * aberto, e o texto do balão é o da regra (`textoDosPedidosAbertos`). Âmbar porque
 * é "alguém espera por você", o mesmo sentido do âmbar em Pedidos. O texto vai
 * também em `aria-label`: no celular não há ponteiro para abrir o balão.
 * Clicar nele abre o detalhe na aba Atendimento, já na seção "Pedidos em aberto"
 * (`?aba=atendimento#pedidos`); o resto da linha continua abrindo a Visão geral.
 */
function IconeDePedidos({ e, href }: { e: EmpresaItem; href: string }) {
  const router = useRouter();
  const texto = textoDosPedidosAbertos(e.pedidos, agoraMs());
  if (!texto) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={texto}
          data-slot="central-pedidos"
          data-abertos={e.pedidos.abertos}
          // Fica dentro do link da linha (um link não pode morar em outro), então o clique
          // troca o destino da linha pelo bloco de pedidos.
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            // A seção "Pedidos em aberto" mora na aba Atendimento do detalhe.
            const destino = new URL(href, window.location.origin);
            destino.searchParams.set("aba", "atendimento");
            destino.hash = "pedidos";
            router.push(`${destino.pathname}${destino.search}${destino.hash}`);
          }}
          className="flex shrink-0 items-center text-warn-ink"
        >
          <MessageCircleWarning size={15} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="whitespace-nowrap" suppressHydrationWarning>
        {texto}
      </TooltipContent>
    </Tooltip>
  );
}

/** Lembretes da agenda que não saíram (28/10/2026, dono): mesmo desenho do ícone de pedidos. */
function IconeDeLembretes({ e }: { e: EmpresaItem }) {
  const texto = textoDosLembretesComFalha(e.lembretes, agoraMs());
  if (!texto) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={texto} data-slot="central-lembretes" data-falhas={e.lembretes.falhas} className="flex shrink-0 items-center text-warn-ink">
          <CalendarX2 size={15} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="whitespace-nowrap" suppressHydrationWarning>
        {texto}
      </TooltipContent>
    </Tooltip>
  );
}


const COLUNAS =
  "grid xl:grid-cols-[minmax(200px,1.3fr)_130px_120px_120px_minmax(140px,190px)_130px] xl:gap-3";

function Linha({ e, href, cambio }: { e: EmpresaItem; href: string; cambio: Cambio | null }) {
  const custo = custoCurto(e.custoUsd, cambio);
  const principal = e.alertas[0];
  return (
    <li>
      <Link
        href={href}
        data-slot="central-cliente"
        data-estado={e.estado}
        data-alerta={principal?.chave}
        className={cn(
          COLUNAS,
          "grid-cols-1 gap-2 border-b border-line-soft px-4 py-3 transition-colors duration-100 hover:bg-[var(--active-bg)] md:px-5 xl:items-center"
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <AvatarCliente e={e} size="md" className="max-md:hidden" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span data-slot="central-nome" className="truncate text-corpo font-semibold text-ink">
                {e.nome}
              </span>
              <IconeDePedidos e={e} href={href} />
              <IconeDeLembretes e={e} />
            </span>
            <span className="truncate text-legenda text-ink-3">{linhaDoPlano(e)}</span>
            {principal && <ChipAlerta alerta={principal} className="self-start" />}
          </span>
        </span>

        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <SeloSituacao situacao={e.situacao} />
          {e.situacao.detalhe && <span className="truncate text-legenda text-ink-3">{e.situacao.detalhe}</span>}
        </span>

        <span data-slot="central-whatsapp" className="text-apoio text-ink-2">
          <span className="text-legenda text-ink-3 xl:hidden">WhatsApp: </span>
          {e.temInstancia ? "Instância criada" : "Sem WhatsApp"}
        </span>

        <span data-slot="central-agente" className="text-apoio text-ink-2">
          <span className="text-legenda text-ink-3 xl:hidden">Agente: </span>
          {textoDoAgente(e)}
        </span>

        <span className="flex min-w-0 flex-col gap-1">
          <MedidorDoLimite e={e} />
          <span data-slot="central-custo" className="text-legenda tabular-nums text-ink-3">
            {custo ?? "Sem preço do modelo"}
          </span>
        </span>

        <span data-slot="central-atividade" className="text-legenda text-ink-3" suppressHydrationWarning>
          <span className="xl:hidden">Última atividade: </span>
          {e.ultimaAtividade ? diaMesHoraSP(e.ultimaAtividade) : "Nenhuma"}
        </span>
      </Link>
    </li>
  );
}
