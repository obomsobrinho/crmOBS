"use client";

import { ListFilter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemMarcado,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// O BOTÃO DE FILTRO de uma lista: UM botão de ícone ao lado da busca, que abre
// a lista de escolhas e mostra quantos filtros estão ligados. Nasceu na central
// (Clientes, 14/10/2026) e virou a regra das tabelas (29/10/2026, dono: "só
// fazer igual está em clientes"): Clientes, Contatos e a prospecção usam esta
// peça, nunca uma faixa de chips. Cada grupo tem um título; uma escolha pode ser
// única (o grupo marca uma) ou ligar e desligar (vários do mesmo grupo).

export interface OpcaoDoFiltro {
  chave: string;
  rotulo: React.ReactNode;
  /** O número ao lado ("Em conversa 12"). */
  contagem?: number;
  marcado: boolean;
  aoEscolher: () => void;
}

export interface GrupoDoFiltro {
  titulo: string;
  opcoes: OpcaoDoFiltro[];
  /** Liga e desliga (vários do grupo) e deixa o menu aberto; sem isto o grupo marca uma e fecha. */
  multiplo?: boolean;
}

export default function BotaoDeFiltro({
  grupos,
  ativos,
  rotulo,
  slot,
  largura = "w-56",
}: {
  grupos: GrupoDoFiltro[];
  /** Quantos filtros estão ligados (o número no canto do botão; 0 some). */
  ativos: number;
  /** O nome acessível ("Filtrar por situação: Rodando"). */
  rotulo: string;
  /** O `data-slot` do botão; o número é `{slot}-contagem` e o menu `data-menu={slot}`. */
  slot: string;
  largura?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-control"
          className="relative shrink-0"
          data-slot={slot}
          data-ativo={ativos > 0 ? ativos : undefined}
          aria-label={rotulo}
        >
          <ListFilter size={15} />
          {ativos > 0 && (
            <Badge variant="nao-lidas" data-slot={`${slot}-contagem`} className="absolute -right-1.5 -top-1.5">
              {ativos}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={largura} data-menu={slot}>
        {grupos.map((g, i) => (
          <div key={g.titulo}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{g.titulo}</DropdownMenuLabel>
            {g.opcoes.map((o) => (
              <DropdownMenuItemMarcado
                key={o.chave}
                data-filtro={o.chave}
                marcado={o.marcado}
                onSelect={(e) => {
                  // Um filtro que liga e desliga deixa o menu aberto para escolher outro.
                  if (g.multiplo) e.preventDefault();
                  o.aoEscolher();
                }}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate">{o.rotulo}</span>
                  {o.contagem !== undefined && <span className="tabular-nums text-ink-3">{o.contagem}</span>}
                </span>
              </DropdownMenuItemMarcado>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

