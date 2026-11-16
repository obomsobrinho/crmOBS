import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Medidor } from "@/components/ui/medidor";
import { MedidorDeMeta } from "@/components/ui/medidor-de-meta";
import { Stat, StatFrase, StatLegenda, StatRotulo, StatTopo, StatValor } from "@/components/ui/stat";
import { cn } from "@/lib/utils";
import type { Alerta, Situacao } from "@/lib/admin-alertas";
import type { EmpresaItem } from "@/lib/admin-empresas";
import { avatarPair, initials } from "@/lib/inbox";
import {
  ROTULO_ESTADO_DA_IA,
  posicaoNoRitmo,
  ritmoDoMes,
  textoDoRitmo,
  tokensCurto,
  type EstadoDaIa,
  type EstadoDoConsumo,
} from "@/lib/custo-ia";

// Peças pequenas que a lista e o detalhe da central do dono compartilham. Nenhuma
// decide nada: o tom e o texto chegam prontos de `lib/admin-alertas.ts` e
// `lib/custo-ia.ts`.

/** O chip de estado: o tom (`bom`, `aviso`, `perigo`, `neutro`) escolhe a variante `estado-*` do `Badge`. */
function SeloDeEstado({
  tom,
  rotulo,
  className,
  ...atributos
}: {
  tom: Situacao["tom"] | Alerta["tom"];
  rotulo: string;
  className?: string;
} & Record<`data-${string}`, string>) {
  return (
    <Badge {...atributos} variant={`estado-${tom}`} className={className}>
      <span className="truncate">{rotulo}</span>
    </Badge>
  );
}

/** O selo da situação da assinatura ("Em teste", "Ativo"). */
export function SeloSituacao({ situacao, className }: { situacao: Situacao; className?: string }) {
  return (
    <SeloDeEstado
      data-slot="admin-situacao"
      data-situacao={situacao.chave}
      tom={situacao.tom}
      rotulo={situacao.rotulo}
      className={className}
    />
  );
}

/**
 * O avatar de um cliente: as iniciais do nome, na cor que `avatarPair` deriva do
 * id (regra do sistema, .claude/rules/ui.md), como os avatares de contato e de
 * membro. Nunca uma cor fixa.
 */
export function AvatarCliente({
  e,
  size,
  className,
}: {
  e: Pick<EmpresaItem, "id" | "nome">;
  size: "md" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} style={avatarPair(e.id)} className={className}>
      {initials(e.nome)}
    </Avatar>
  );
}

/** O chip de um alerta. */
export function ChipAlerta({ alerta, className }: { alerta: Alerta; className?: string }) {
  return (
    <SeloDeEstado
      data-slot="admin-alerta"
      data-alerta={alerta.chave}
      tom={alerta.tom}
      rotulo={alerta.rotulo}
      className={className}
    />
  );
}

// Estado da IA é cor de ESTADO (verde, âmbar, vermelho); desligada é neutra.
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

/** Ponto de cor mais o rótulo do estado da IA (Ativa, Perto do limite, Parada no limite, Desligada). */
export function EstadoIa({ estado }: { estado: EstadoDaIa }) {
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

/**
 * O uso do limite do mês na LISTA: "2,4 mi de 10 mi", a porcentagem e a barra fina (tom pelo estado do
 * consumo). A aba Uso de IA e a Visão geral usam `RitmoDoLimite` (a barra de meta com ritmo).
 */
export function MedidorDoLimite({
  e,
  className,
}: {
  e: Pick<EmpresaItem, "usados" | "limite" | "percentual" | "consumo">;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="flex items-baseline justify-between gap-2 text-apoio text-ink-2">
        <span data-slot="central-tokens" className="tabular-nums">
          {tokensCurto(e.usados)} de {tokensCurto(e.limite)}
        </span>
        <span data-slot="central-percentual" className="text-legenda tabular-nums text-ink-3">
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
  );
}

/**
 * O rótulo do canto de cima do cartão de uso: "2,4 mi de 100 mi tokens (Plano Avançado), R$ 4,22 estimado".
 * `custo` já vem escrito por `custoCurto` (nulo quando não há preço do modelo: a frase some, nunca um valor
 * inventado).
 */
export function RotuloDoUso({
  e,
  custo,
  className,
}: {
  e: Pick<EmpresaItem, "usados" | "limite" | "origemDoLimite">;
  custo?: string | null;
  className?: string;
}) {
  return (
    <span data-slot="central-tokens" className={cn("text-apoio tabular-nums text-ink-2", className)}>
      {tokensCurto(e.usados)} de {tokensCurto(e.limite)} tokens ({e.origemDoLimite})
      {custo ? `, ${custo} estimado` : ""}
    </span>
  );
}

/**
 * A barra de META COM RITMO do uso do mês (referência do dono, 16/10/2026): o uso é o preenchimento, a bolinha
 * é o gasto ideal de hoje (limite x fração do mês), o trecho entre os dois é listrado. Verde no ou abaixo do
 * ritmo, vermelho acima (gasto: menos é melhor). Onde o uso está contra o ritmo (`posicaoNoRitmo`) e a frase
 * embaixo (`ritmoDoMes`, `textoDoRitmo`: a projeção do mesmo contador do mês) saem de `lib/custo-ia.ts`, a
 * única regra; aqui só se desenha. Sem dado de verdade a frase não aparece, e a cor nunca é a única pista.
 */
export function RitmoDoLimite({
  e,
  agora,
  className,
}: {
  e: Pick<EmpresaItem, "usados" | "limite" | "percentual" | "consumo">;
  agora: number;
  className?: string;
}) {
  const { idealPct, estado: posicao } = posicaoNoRitmo(e.usados, e.limite, agora);
  const estado = posicao === "abaixo" ? "bom" : "ruim";
  const ritmo = ritmoDoMes(e.usados, e.limite, agora);
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <MedidorDeMeta
        valor={e.percentual}
        marcador={idealPct}
        estado={estado}
        rotulo="Uso do limite do mês contra o ritmo ideal"
        data-consumo={e.consumo}
        data-ideal-pct={Math.round(idealPct)}
      />
      {ritmo && (
        <p
          data-slot="central-ritmo-frase"
          data-ritmo={ritmo.estado}
          className={cn("text-apoio", estado === "bom" ? "text-human-ink" : "text-danger-ink")}
        >
          {textoDoRitmo(ritmo)}
        </p>
      )}
    </div>
  );
}

/**
 * O uso do mês em destaque (Visão geral): a porcentagem grande, o estado da IA ao lado e a barra de meta com
 * ritmo. O rótulo "X de Y tokens (...)" fica no canto de cima do cartão (`RotuloDoUso`).
 */
export function ConsumoEmDestaque({
  e,
  agora,
}: {
  e: Pick<EmpresaItem, "usados" | "limite" | "percentual" | "consumo" | "estado">;
  agora: number;
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <StatValor tamanho="padrao">
          <span data-slot="central-percentual">{Math.floor(e.percentual)}%</span>
        </StatValor>
        <span data-slot="visao-ia">
          <EstadoIa estado={e.estado} />
        </span>
      </div>
      <RitmoDoLimite e={e} agora={agora} className="mt-1.5" />
    </>
  );
}

/** A tinta de TEXTO de cada tom de estado (`ink`, nunca `fill`): o selo grande da Visão geral. */
export const TINTA_DO_TOM: Record<Situacao["tom"], string> = {
  bom: "text-human-ink",
  aviso: "text-warn-ink",
  perigo: "text-danger-ink",
  neutro: "text-ink",
};

/** "Agente ativo", "Desativado" ou "Sem publicar" (vocabulário do agente, nunca "pausado"). */
export function textoDoAgente(e: Pick<EmpresaItem, "publicada" | "ligada">): string {
  if (!e.publicada) return "Sem publicar";
  return e.ligada ? "Agente ativo" : "Desativado";
}

/** "Plano Essencial" ou "Sem plano": o plano, sem inventar nenhum. */
export function linhaDoPlano(e: Pick<EmpresaItem, "plano">): string {
  return e.plano ? `Plano ${e.plano}` : "Sem plano";
}

/** A leitura de uma aba falhou: o texto e o "tentar de novo" (`useCarga`). */
export function FalhaAoLer({ texto, aoTentar }: { texto: string; aoTentar: () => void }) {
  return (
    <Card variant="secao" data-bloco="central-falha">
      <p className="text-apoio text-ink-2">{texto}</p>
      <Button variant="outline" size="control" className="mt-2" onClick={aoTentar}>
        Tentar de novo
      </Button>
    </Card>
  );
}

type AtributosDeDados = Record<`data-${string}`, string | number | undefined>;

/**
 * Um indicador da central (abas Uso de IA, Atendimento, Visão geral, Financeiro, Horários de pico): rótulo,
 * valor, frase e a legenda do período (obrigatória no `Stat` para tudo que mede um período; só os cartões de
 * ESTADO, sem período, como a situação e o plano, ficam sem ela). Os `data-*` vão no cartão (os testes de cada
 * tela os usam); `marcaDoValor` marca o número (`data-bloco` do `StatValor`).
 */
export function Indicador({
  rotulo,
  valor,
  frase,
  legenda,
  marcaDoValor,
  variacao,
  tendencia,
  variant = "bloco",
  tamanhoDoValor = "padrao",
  classeDoValor,
  className,
  ...atributos
}: {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  frase: React.ReactNode;
  legenda?: React.ReactNode;
  marcaDoValor?: string;
  /** `bloco` dentro de um cartão de página; `elevado` solto sobre o cartão (os três números dos picos). */
  variant?: "bloco" | "elevado";
  tamanhoDoValor?: "padrao" | "compacto";
  classeDoValor?: string;
  className?: string;
  /** O selo de variação contra o período anterior (`Variacao`), no canto do cartão. */
  variacao?: React.ReactNode;
  /** O mini gráfico de tendência (`ChartSparkline`), embaixo do número. */
  tendencia?: React.ReactNode;
} & AtributosDeDados) {
  return (
    <Stat {...atributos} variant={variant} tamanho="compacto" className={className}>
      <StatTopo>
        <StatRotulo>{rotulo}</StatRotulo>
        {variacao}
      </StatTopo>
      <StatValor tamanho={tamanhoDoValor} data-bloco={marcaDoValor} className={classeDoValor}>
        {valor}
      </StatValor>
      <StatFrase>{frase}</StatFrase>
      {tendencia && <div className="mt-1">{tendencia}</div>}
      {legenda != null && <StatLegenda>{legenda}</StatLegenda>}
    </Stat>
  );
}

export type PropsDoIndicador = Parameters<typeof Indicador>[0];

/** O cartão "Situação" (Visão geral e Financeiro): o rótulo grande na tinta do tom e o detalhe embaixo. */
export function IndicadorDaSituacao({
  e,
  bloco,
  slot,
}: {
  e: Pick<EmpresaItem, "situacao">;
  /** O `data-bloco` do cartão e o `data-slot` do texto, que cada aba usa para os testes. */
  bloco: string;
  slot: string;
}) {
  return (
    <Indicador
      data-bloco={bloco}
      rotulo="Situação"
      valor={
        <span data-slot={slot} data-situacao={e.situacao.chave}>
          {e.situacao.rotulo}
        </span>
      }
      classeDoValor={`text-balance ${TINTA_DO_TOM[e.situacao.tom]}`}
      frase={e.situacao.detalhe ?? "Assinatura em dia"}
    />
  );
}

/** O cartão "Plano": o nome do plano (ou "Sem plano") e a frase que cada aba escolhe (limite de IA, preço). */
export function IndicadorDoPlano({
  e,
  bloco,
  slot,
  frase,
}: {
  e: Pick<EmpresaItem, "plano">;
  bloco: string;
  slot: string;
  frase: React.ReactNode;
}) {
  return (
    <Indicador
      data-bloco={bloco}
      rotulo="Plano"
      valor={<span data-slot={slot}>{e.plano ?? "Sem plano"}</span>}
      classeDoValor="text-balance"
      frase={frase}
    />
  );
}

/** Uma linha rótulo e valor de um cartão do detalhe (Visão geral, Financeiro). */
export function Dado({ rotulo, children, slot }: { rotulo: string; children: React.ReactNode; slot?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2 last:border-b-0">
      <dt className="text-apoio text-ink-3">{rotulo}</dt>
      <dd data-slot={slot} className="min-w-0 text-right text-apoio text-ink">
        {children}
      </dd>
    </div>
  );
}
