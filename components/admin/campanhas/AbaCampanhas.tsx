"use client";

import { memo } from "react";
import { BarChart3, Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Medidor } from "@/components/ui/medidor";
import { numeroBR, pct } from "@/lib/format";
import { diaMesHoraSP } from "@/lib/fuso";
import { resultadoDaCampanha } from "@/lib/prospeccao";
import { SeloDaCampanha, haQuanto, textoDaTaxa } from "./pecas";
import type { Campanha, ConexaoDisponivel } from "./tipos";

// CAMPANHAS, a home: um cartão por campanha (situação, progresso, respostas) e
// "Nova campanha" no topo. O rascunho mostra onde parou e volta para o assistente.

const PASSOS = ["Campanha", "Contatos", "Mensagem", "Confirmar"];

function CartaoDaCampanha({
  campanha,
  conexoes,
  agora,
  abrir,
}: {
  campanha: Campanha;
  conexoes: ConexaoDisponivel[];
  agora: number;
  abrir: () => void;
}) {
  const r = resultadoDaCampanha(campanha.envios, campanha.variantes.length);
  const numero = conexoes.find((c) => c.id === campanha.conexaoId);
  const rascunho = campanha.situacao === "rascunho";
  return (
    <li>
      <Button
        variant="nu"
        size="none"
        onClick={abrir}
        data-slot="campanha-cartao"
        data-campanha={campanha.id}
        className="flex h-full w-full flex-col items-stretch gap-5 rounded-xl border border-line bg-raised p-5 text-left transition-colors hover:border-line-strong"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-cartao text-ink">{campanha.nome || "Campanha sem nome"}</p>
            <p className="mt-0.5 truncate text-apoio text-ink-2">
              {numero ? `Pelo WhatsApp de ${numero.nome}` : "Sem número escolhido"}
            </p>
          </div>
          <SeloDaCampanha situacao={campanha.situacao} />
        </div>

        {rascunho ? (
          <div className="flex flex-col gap-2">
            <p className="text-apoio text-ink-2">
              Parou no passo {campanha.passo} de 4, {PASSOS[campanha.passo - 1]}.
            </p>
            <Medidor valor={((campanha.passo - 1) / 4) * 100} tom="neutro" rotulo={`Passo ${campanha.passo} de 4`} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-apoio text-ink-2">
                <span className="text-titulo tabular-nums text-ink">{numeroBR(r.enviados)}</span> de {numeroBR(r.total)}{" "}
                enviadas
              </span>
              <span className="text-apoio tabular-nums text-ink-3">{pct(r.enviados + r.falharam, r.total)}%</span>
            </div>
            <Medidor
              valor={pct(r.enviados + r.falharam, r.total)}
              tom={campanha.situacao === "rodando" ? "marca" : "neutro"}
              rotulo={`Progresso: ${r.enviados} de ${r.total} enviadas`}
            />
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line-soft pt-4 text-apoio">
          {rascunho ? (
            <span className="text-ink-3">Salvo {haQuanto(campanha.salvaEm, agora)}</span>
          ) : campanha.situacao === "agendada" && campanha.agendadaPara ? (
            <span className="text-ink-2">Começa em {diaMesHoraSP(campanha.agendadaPara)}</span>
          ) : (
            <span className="text-ink-2">
              <span className="font-semibold text-ink">{numeroBR(r.responderam)}</span> respostas
              {r.taxa !== null && <span className="text-ink-3"> · {textoDaTaxa(r.taxa)}</span>}
            </span>
          )}
          <span className="font-semibold text-brand-ink">{rascunho ? "Continuar" : "Abrir"}</span>
        </div>
      </Button>
    </li>
  );
}

function AbaCampanhas({
  campanhas,
  conexoes,
  agora,
  abrir,
  editar,
  nova,
  verResultados,
}: {
  campanhas: Campanha[];
  conexoes: ConexaoDisponivel[];
  agora: number;
  abrir: (id: string) => void;
  editar: (id: string) => void;
  nova: () => void;
  verResultados: () => void;
}) {
  const algumaEnviou = campanhas.some((c) => c.envios.some((e) => e.enviadoEm !== null));
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-titulo text-ink">Campanhas</h2>
          <p className="mt-1 text-apoio text-ink-2">
            Uma mensagem só para cada lead, no máximo 10 por dia, das 8h às 18h. Quem responde cai em Conversas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {algumaEnviou && (
            <Button variant="outline" onClick={verResultados} data-slot="campanhas-resultados">
              <BarChart3 aria-hidden />
              Resultados
            </Button>
          )}
          <Button onClick={nova} data-slot="campanhas-nova">
            <Plus aria-hidden />
            Nova campanha
          </Button>
        </div>
      </div>

      {campanhas.length === 0 ? (
        <Card variant="conteudo" className="py-4">
          <EstadoVazio
            icone={Megaphone}
            titulo="Nenhuma campanha ainda"
            texto="Uma campanha manda uma mensagem para os leads de uma busca, 10 por dia. Comece pela busca na aba Leads, ou crie a campanha e escolha os contatos depois."
          >
            <Button className="mt-2" onClick={nova}>
              <Plus aria-hidden />
              Nova campanha
            </Button>
          </EstadoVazio>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-slot="campanhas-lista">
          {campanhas.map((c) => (
            <CartaoDaCampanha
              key={c.id}
              campanha={c}
              conexoes={conexoes}
              agora={agora}
              abrir={() => (c.situacao === "rascunho" ? editar(c.id) : abrir(c.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default memo(AbaCampanhas);
