"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, RefreshCw, AlertTriangle } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { CampoBusca } from "@/components/ui/campo-busca";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { cn } from "@/lib/utils";
import { diaMesHoraSP } from "@/lib/fuso";
import { useDebounce } from "@/lib/use-debounce";
import { usePaginada } from "@/lib/use-paginada";
import { usdCurto } from "@/lib/custo-ia";
import { plural } from "@/lib/format";
import { FILTROS_DE_SITUACAO, type FiltroDeSituacao } from "@/lib/admin-alertas";
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
// limite de IA se edita no detalhe, na aba "Uso de IA".
export default function ListaCentral({
  inicial,
  previewTodas,
  hrefModelo = "/clientes/{id}",
  bloqueariamSemBeta = null,
}: {
  /** A primeira página, que o servidor já buscou. */
  inicial: { itens: EmpresaItem[]; temMais: boolean };
  /** Preview `/design/clientes`: a lista roda sobre a memória. */
  previewTodas?: EmpresaItem[];
  /** Para onde a linha leva; o preview aponta para o detalhe de mentira. */
  hrefModelo?: string;
  /**
   * Com `BETA_ABERTO` ligado: quantos clientes ficariam bloqueados se a chave
   * fosse desligada hoje (`admin_bloqueados_sem_beta`). Nulo = chave desligada
   * (ou a contagem falhou): sem aviso.
   */
  bloqueariamSemBeta?: number | null;
}) {
  const simular = !!previewTodas;
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
            preços.
          </p>
          {bloqueariamSemBeta !== null && <AvisoDoBeta bloqueariam={bloqueariamSemBeta} />}
          <CampoBusca
            className="mt-3 md:max-w-[420px]"
            valor={q}
            aoMudar={setQ}
            placeholder="Buscar cliente pelo nome"
            rotulo="Buscar clientes"
            aoLimpar={() => setQ("")}
            mostrarLimpar={q !== ""}
          />
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Situação">
            <Button
              variant="chip"
              size="chip"
              data-slot="central-chip"
              aria-pressed={situacao === null}
              onClick={() => setSituacao(null)}
            >
              Todos
            </Button>
            {FILTROS_DE_SITUACAO.map((f) => (
              <Button
                key={f.chave}
                variant="chip"
                size="chip"
                data-slot="central-chip"
                data-filtro={f.chave}
                aria-pressed={situacao === f.chave}
                onClick={() => setSituacao(f.chave)}
              >
                {f.rotulo}
              </Button>
            ))}
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
                <Linha key={e.id} e={e} href={hrefModelo.replace("{id}", e.id)} />
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

const COLUNAS =
  "grid xl:grid-cols-[minmax(200px,1.3fr)_130px_120px_120px_minmax(140px,190px)_130px] xl:gap-3";

function Linha({ e, href }: { e: EmpresaItem; href: string }) {
  const custo = usdCurto(e.custoUsd);
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
            <span data-slot="central-nome" className="truncate text-corpo font-semibold text-ink">
              {e.nome}
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

/**
 * O aviso do `BETA_ABERTO` (entrega 2): enquanto a chave está ligada ninguém é
 * bloqueado, e o dono vê quantos clientes cairiam se ela fosse desligada hoje,
 * para marcar como vitalício quem deve continuar sem pagar antes de desligar.
 */
function AvisoDoBeta({ bloqueariam }: { bloqueariam: number }) {
  return (
    <Aviso
      tom={bloqueariam > 0 ? "warn" : "neutro"}
      icone={AlertTriangle}
      className="mt-3"
      data-slot="central-aviso-beta"
      data-bloqueariam={bloqueariam}
    >
      Beta aberto: hoje ninguém é bloqueado.{" "}
      {bloqueariam > 0
        ? `Se a chave fosse desligada hoje, ${bloqueariam} ${plural(bloqueariam, "cliente ficaria bloqueado", "clientes ficariam bloqueados")} (teste encerrado, pagamento atrasado fora da carência ou cancelado). Marque como vitalício quem deve continuar sem pagar.`
        : "Se a chave fosse desligada hoje, nenhum cliente ficaria bloqueado."}
    </Aviso>
  );
}
