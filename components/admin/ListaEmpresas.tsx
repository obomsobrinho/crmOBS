"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Building2, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Medidor } from "@/components/ui/medidor";
import { CampoBusca } from "@/components/ui/campo-busca";
import { AreaRolavel, DISSOLVER_LISTA } from "@/components/ui/dissolver-rolagem";
import { cn } from "@/lib/utils";
import { diaMesHoraSP } from "@/lib/fuso";
import { useDebounce } from "@/lib/use-debounce";
import { usePaginada } from "@/lib/use-paginada";
import {
  LIMITE_PADRAO_TOKENS,
  ROTULO_ESTADO_DA_IA,
  tokensCurto,
  usdCurto,
  type EstadoDaIa,
  type EstadoDoConsumo,
} from "@/lib/custo-ia";
import {
  PAGINA_EMPRESAS,
  comLimite,
  fonteEmpresasDaApi,
  fonteEmpresasDaMemoria,
  type EmpresaItem,
  type FonteEmpresas,
  type ParamsEmpresas,
} from "@/lib/admin-empresas";

// O diálogo só pesa quando o dono clica em editar (chunk à parte).
const EditarLimiteDialog = dynamic(() => import("@/components/admin/EditarLimiteDialog"));

// LISTA DE EMPRESAS DO /admin (P1 item 6, primeira fatia do Admin v1).
//
// 10 por vez, mais ao rolar (`usePaginada`), busca por nome no SERVIDOR com
// debounce. Sem realtime (decisão do plano): o botão "Atualizar" revalida o que
// está na tela. Editar o limite grava pela rota do admin e corrige SÓ a linha.
export default function ListaEmpresas({
  inicial,
  previewTodas,
}: {
  /** A primeira página, que o servidor já buscou. */
  inicial: { itens: EmpresaItem[]; temMais: boolean };
  /** Preview `/design/admin`: a lista roda sobre a memória e editar não grava. */
  previewTodas?: EmpresaItem[];
}) {
  const simular = !!previewTodas;
  const [q, setQ] = useState("");
  const busca = useDebounce(q.trim(), 300);
  const [editando, setEditando] = useState<EmpresaItem | null>(null);

  const fonte = useMemo<FonteEmpresas>(
    () => (previewTodas ? fonteEmpresasDaMemoria(previewTodas) : fonteEmpresasDaApi()),
    [previewTodas]
  );
  const params = useMemo<ParamsEmpresas>(() => ({ busca }), [busca]);

  const { itens, setItens, temMais, carregando, fimRef, revalidar } = usePaginada<
    EmpresaItem,
    ParamsEmpresas
  >({
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
      <section aria-label="Empresas">
        <div className="border-b border-line px-4 pb-3 pt-4 md:px-5">
          <div className="flex items-center gap-2">
            <h1 className="text-titulo">Empresas</h1>
            <Button
              variant="outline"
              size="control"
              data-slot="admin-atualizar"
              className="ml-auto"
              carregando={carregando}
              onClick={() => void revalidar()}
            >
              <RefreshCw size={14} />
              Atualizar
            </Button>
          </div>
          <p className="mt-1 text-legenda text-ink-3">
            Uso de IA do mês (fuso de São Paulo). Custo estimado pela tabela oficial de preços.
          </p>
          <CampoBusca
            className="mt-3 md:max-w-[420px]"
            valor={q}
            aoMudar={setQ}
            placeholder="Buscar empresa pelo nome"
            rotulo="Buscar empresas"
            aoLimpar={() => setQ("")}
            mostrarLimpar={q !== ""}
          />
        </div>

        <div
          aria-hidden
          className="grid grid-cols-[minmax(0,1fr)_140px_minmax(0,220px)_120px_150px_120px] gap-3 border-b border-line-soft px-5 py-2 text-rotulo uppercase text-ink-3 max-lg:hidden"
        >
          <span>Empresa</span>
          <span>IA</span>
          <span>Uso do mês</span>
          <span>Custo estimado</span>
          <span>Limite</span>
          <span>Última atividade</span>
        </div>

        <AreaRolavel tamanho={DISSOLVER_LISTA} className="min-h-0 flex-1">
          {itens.length === 0 && !carregando ? (
            <EstadoVazio
              data-slot="admin-vazio"
              icone={Building2}
              titulo={temBusca ? `Nenhuma empresa para “${busca}”` : "Nenhuma empresa ainda"}
              texto={
                temBusca
                  ? "A busca olha o nome da empresa."
                  : "Quem se cadastrar no CRM aparece aqui."
              }
            />
          ) : (
            <ul data-slot="admin-lista">
              {itens.map((e) => (
                <Linha key={e.id} e={e} onEditar={() => setEditando(e)} />
              ))}
              {temMais && (
                <li
                  ref={(el) => {
                    fimRef.current = el;
                  }}
                  data-slot="admin-mais"
                  aria-hidden
                  className="h-px"
                />
              )}
              {carregando && (
                <li data-slot="admin-carregando" className="px-5 py-3 text-legenda text-ink-3">
                  Carregando…
                </li>
              )}
            </ul>
          )}
        </AreaRolavel>

        {editando && (
          <EditarLimiteDialog
            key={editando.id}
            empresa={editando}
            simular={simular}
            onFechar={() => setEditando(null)}
            onSalvo={(id, limite) =>
              setItens((cur) => cur.map((x) => (x.id === id ? comLimite(x, limite) : x)))
            }
          />
        )}
      </section>
    </Card>
  );
}

function Linha({ e, onEditar }: { e: EmpresaItem; onEditar: () => void }) {
  const custo = usdCurto(e.custoUsd);
  const detalhe = [e.tipo ?? "Sem tipo", e.plano ? `plano ${e.plano}` : null]
    .filter(Boolean)
    .join(", ");
  return (
    <li
      data-slot="admin-empresa"
      data-estado={e.estado}
      className="grid grid-cols-1 gap-2 border-b border-line-soft px-4 py-3 md:px-5 lg:grid-cols-[minmax(0,1fr)_140px_minmax(0,220px)_120px_150px_120px] lg:items-center lg:gap-3"
    >
      <span className="flex min-w-0 flex-col gap-px">
        <span data-slot="admin-nome" className="truncate text-corpo font-semibold text-ink">
          {e.nome}
        </span>
        <span className="truncate text-legenda text-ink-3">{detalhe}</span>
      </span>

      <EstadoIa estado={e.estado} />

      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2 text-apoio text-ink-2">
          <span data-slot="admin-tokens" className="tabular-nums">
            {tokensCurto(e.usados)} de {tokensCurto(e.limite)}
          </span>
          <span data-slot="admin-percentual" className="text-legenda tabular-nums text-ink-3">
            {Math.floor(e.percentual)}%
          </span>
        </span>
        <Medidor
          valor={e.percentual}
          tom={TOM_DA_BARRA[e.consumo]}
          rotulo="Uso do limite do mês"
          data-consumo={e.consumo}
        />
      </span>

      <span data-slot="admin-custo" className="text-apoio tabular-nums text-ink-2">
        <span className="text-legenda text-ink-3 lg:hidden">Custo estimado: </span>
        {custo ?? "Sem preço do modelo"}
      </span>

      <span className="flex items-center gap-1.5">
        <span data-slot="admin-limite" className="text-apoio tabular-nums text-ink-2">
          {e.limiteGravado == null
            ? `Padrão (${tokensCurto(LIMITE_PADRAO_TOKENS)})`
            : tokensCurto(e.limiteGravado)}
        </span>
        <Button
          variant="ghost"
          size="icon-chrome"
          data-slot="admin-editar-limite"
          aria-label={`Editar o limite de ${e.nome}`}
          onClick={onEditar}
        >
          <Pencil size={14} />
        </Button>
      </span>

      <span className="text-legenda text-ink-3" suppressHydrationWarning>
        <span className="lg:hidden">Última atividade: </span>
        {e.ultimaAtividade ? diaMesHoraSP(e.ultimaAtividade) : "Nenhuma"}
      </span>
    </li>
  );
}

// Estado é cor de ESTADO (verde, âmbar, vermelho); desligada é neutra.
const COR_DO_ESTADO: Record<EstadoDaIa, string> = {
  ativa: "bg-human",
  aviso: "bg-warn",
  parada: "bg-danger",
  desligada: "bg-ink-faint",
};

const TINTA_DO_ESTADO: Record<EstadoDaIa, string> = {
  ativa: "text-ink-2",
  aviso: "text-warn-ink",
  parada: "text-danger-ink",
  desligada: "text-ink-3",
};

function EstadoIa({ estado }: { estado: EstadoDaIa }) {
  return (
    <span
      data-slot="admin-estado"
      className={cn("flex items-center gap-1.5 text-apoio", TINTA_DO_ESTADO[estado])}
    >
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", COR_DO_ESTADO[estado])} />
      {ROTULO_ESTADO_DA_IA[estado]}
    </span>
  );
}

// Tom da barra: marca abaixo de 80%, ESTADO (aviso, perigo) perto e no teto.
const TOM_DA_BARRA: Record<EstadoDoConsumo, "marca" | "aviso" | "perigo"> = {
  normal: "marca",
  aviso: "aviso",
  parado: "perigo",
};
