import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Medidor } from "@/components/ui/medidor";
import { Stat, StatFrase, StatLegenda, StatRotulo, StatTopo, StatValor } from "@/components/ui/stat";
import { cn } from "@/lib/utils";
import type { Alerta, Situacao } from "@/lib/admin-alertas";
import type { EmpresaItem } from "@/lib/admin-empresas";
import { avatarPair, initials } from "@/lib/inbox";
import { ROTULO_ESTADO_DA_IA, tokensCurto, type EstadoDaIa, type EstadoDoConsumo } from "@/lib/custo-ia";

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
 * O uso do limite do mês de um cliente: "2,4 mi de 10 mi", a porcentagem e a
 * barra. Uma peça só na lista, na Visão geral e na aba Uso de IA. `unidade`
 * escreve "tokens" depois do total; `extra` vai ao lado da porcentagem.
 */
export function MedidorDoLimite({
  e,
  unidade = false,
  extra,
  className,
}: {
  e: Pick<EmpresaItem, "usados" | "limite" | "percentual" | "consumo">;
  unidade?: boolean;
  extra?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="flex items-baseline justify-between gap-2 text-apoio text-ink-2">
        <span data-slot="central-tokens" className="tabular-nums">
          {tokensCurto(e.usados)} de {tokensCurto(e.limite)}
          {unidade ? " tokens" : ""}
        </span>
        <span data-slot="central-percentual" className="text-legenda tabular-nums text-ink-3">
          {Math.floor(e.percentual)}%{extra ? `, ${extra}` : ""}
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

/** "Agente ativo", "Desativado" ou "Sem publicar" (vocabulário do agente, nunca "pausado"). */
export function textoDoAgente(e: Pick<EmpresaItem, "publicada" | "ligada">): string {
  if (!e.publicada) return "Sem publicar";
  return e.ligada ? "Agente ativo" : "Desativado";
}

/** "beta, plano Essencial": o tipo da conta e o plano, sem inventar nenhum dos dois. */
export function linhaDoPlano(e: Pick<EmpresaItem, "tipo" | "plano">): string {
  return [e.tipo ?? "Sem tipo", e.plano ? `plano ${e.plano}` : "sem plano"].join(", ");
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
 * Um indicador das abas Uso de IA e Atendimento: rótulo, valor, frase e a legenda do período
 * (obrigatória no `Stat`). Os `data-*` vão no cartão (os testes de cada tela os usam); `marcaDoValor`
 * marca o número (`data-bloco` do `StatValor`).
 */
export function Indicador({
  rotulo,
  valor,
  frase,
  legenda,
  marcaDoValor,
  ...atributos
}: {
  rotulo: React.ReactNode;
  valor: React.ReactNode;
  frase: React.ReactNode;
  legenda: React.ReactNode;
  marcaDoValor?: string;
} & AtributosDeDados) {
  return (
    <Stat {...atributos} variant="bloco" tamanho="compacto">
      <StatTopo>
        <StatRotulo>{rotulo}</StatRotulo>
      </StatTopo>
      <StatValor tamanho="padrao" data-bloco={marcaDoValor}>
        {valor}
      </StatValor>
      <StatFrase>{frase}</StatFrase>
      <StatLegenda>{legenda}</StatLegenda>
    </Stat>
  );
}
