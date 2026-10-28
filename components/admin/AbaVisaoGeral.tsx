"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Stat, StatFrase, StatLegenda, StatRotulo, StatTopo, StatValor } from "@/components/ui/stat";
import { dataLongaSP, diaMesHoraSP } from "@/lib/fuso";
import { numeroBR, plural } from "@/lib/format";
import { tokensCurto } from "@/lib/custo-ia";
import { custoCurto, type Cambio } from "@/lib/cambio";
import { montagemTerminada } from "@/lib/onboarding";
import type { Alerta, EstadoDoWhatsApp } from "@/lib/admin-alertas";
import { textoDoModelo, type DetalheDoCliente } from "@/lib/admin-cliente";
import {
  ChipAlerta,
  ConsumoEmDestaque,
  Dado,
  IndicadorDaSituacao,
  IndicadorDoPlano,
  RotuloDoUso,
  textoDoAgente,
} from "@/components/admin/pecas";
import { MessageCircleWarning } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { cn } from "@/lib/utils";
import { textoDosPedidosAbertos } from "@/lib/admin-alertas";

// ABA "VISÃO GERAL" do detalhe de um cliente (central do dono). A página abre pelo que o
// dono precisa ler primeiro, grande e em cima: a situação, o plano, o uso de IA contra o
// limite, o WhatsApp, a última atividade e os alertas. Os detalhes (quem é o cliente, em
// que ponto da montagem está o agente) ficam embaixo, menores, em dois cartões. Tudo vem
// pronto: o texto e o tom dos alertas são de `lib/admin-alertas.ts`, o estado da IA de
// `lib/custo-ia.ts`.

const ROTULO_DO_WHATSAPP: Record<EstadoDoWhatsApp, string> = {
  conectado: "Conectado",
  reconectando: "Reconectando",
  desconectado: "Desconectado",
  desconhecido: "Não deu para checar agora",
};

function AbaVisaoGeral({
  detalhe,
  cambio,
  alertas,
  whatsapp,
  onChecarWhatsapp,
  onVerPedidos,
}: {
  detalhe: DetalheDoCliente;
  /** A cotação PTAX do dólar; `null` = indisponível ou ainda sendo buscada (os custos ficam em US$). */
  cambio: Cambio | null;
  alertas: Alerta[];
  /** `null` = checando agora (só existe para quem tem instância). */
  whatsapp: EstadoDoWhatsApp | null;
  onChecarWhatsapp: () => void;
  /** A página seguinte de "Pedidos em aberto" (a fonte do detalhe; estável). */
  /** Abre a aba Atendimento na seção "Pedidos em aberto" (estável). */
  onVerPedidos: () => void;
}) {
  const e = detalhe.empresa;
  const custo = custoCurto(e.custoUsd, cambio);
  const atendentes = Math.max(0, detalhe.membros - 1);
  const resumoDosPedidos = detalhe.pedidos?.resumo;
  const fraseDosPedidos =
    resumoDosPedidos &&
    textoDosPedidosAbertos({ abertos: resumoDosPedidos.total, maisAntigo: resumoDosPedidos.maisAntigo }, detalhe.agora);
  return (
    <div data-slot="central-aba-visao" className="flex flex-col gap-4">

      <div data-bloco="visao-resumo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <IndicadorDaSituacao e={e} bloco="visao-situacao" slot="visao-situacao" />

        <IndicadorDoPlano
          e={e}
          bloco="visao-plano"
          slot="visao-plano"
          frase={`Limite de IA: ${tokensCurto(e.limite)} tokens por mês`}
        />

        <Stat variant="bloco" tamanho="compacto" className="sm:col-span-2" data-bloco="visao-consumo">
          <StatTopo>
            <StatRotulo>IA no mês</StatRotulo>
            <RotuloDoUso e={e} custo={custo} className="text-right" />
          </StatTopo>
          <ConsumoEmDestaque e={e} agora={detalhe.agora} />
          <StatLegenda>
            <span data-slot="visao-modelo">Modelo de IA: {textoDoModelo(detalhe.modelo)}.</span>
          </StatLegenda>
        </Stat>

        <Stat variant="bloco" tamanho="compacto" data-bloco="visao-whatsapp">
          <StatTopo>
            <StatRotulo>WhatsApp</StatRotulo>
            {e.temInstancia && (
              <Button
                variant="outline"
                size="control"
                data-slot="visao-checar"
                carregando={whatsapp === null}
                onClick={onChecarWhatsapp}
              >
                Checar de novo
              </Button>
            )}
          </StatTopo>
          <StatValor tamanho="compacto" className="text-balance">
            <span data-slot="visao-conexao">
              {!e.temInstancia ? "Sem WhatsApp" : whatsapp === null ? "Checando…" : ROTULO_DO_WHATSAPP[whatsapp]}
            </span>
          </StatValor>
          <StatFrase>
            Instância: <span data-slot="visao-instancia">{e.temInstancia ? "Criada" : "Ainda não criada"}</span>
          </StatFrase>
          <StatLegenda>Consultada na Evolution só ao abrir esta página.</StatLegenda>
        </Stat>

        <Stat variant="bloco" tamanho="compacto" data-bloco="visao-atividade">
          <StatTopo>
            <StatRotulo>Última atividade</StatRotulo>
          </StatTopo>
          <StatValor tamanho="compacto" className="text-balance">
            <span data-slot="visao-atividade" suppressHydrationWarning>
              {e.ultimaAtividade ? diaMesHoraSP(e.ultimaAtividade) : "Nenhuma"}
            </span>
          </StatValor>
          <StatFrase>Último turno ou mensagem do agente</StatFrase>
        </Stat>

        <Stat variant="bloco" tamanho="compacto" className="sm:col-span-2" data-bloco="visao-alertas">
          <StatTopo>
            <StatRotulo>Alertas</StatRotulo>
          </StatTopo>
          {/* Pedido aberto É alerta (dono, 28/10/2026): "Nada pede atenção" só quando a conta não tem alerta, NÃO
              há pedido aberto E a leitura dos pedidos deu certo (sem ela não dá para afirmar que não há). */}
          {alertas.length === 0 && !fraseDosPedidos && detalhe.pedidos !== null ? (
            <EstadoVazio tamanho="compacto" data-slot="visao-sem-alertas" texto="Nada pede atenção agora." />
          ) : (
            <>
              {alertas.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" data-slot="visao-alertas-lista">
                  {alertas.map((a) => (
                    <li key={a.chave}>
                      <ChipAlerta alerta={a} />
                    </li>
                  ))}
                </ul>
              )}
              {detalhe.pedidos === null && (
                <Aviso
                  tom="neutro"
                  data-slot="visao-pedidos-sem-leitura"
                  className={alertas.length > 0 ? "mt-2" : undefined}
                >
                  Não deu para ler os pedidos de ajuda agora.
                </Aviso>
              )}
              {fraseDosPedidos && (
                <AlertaDePedidos frase={fraseDosPedidos} onVer={onVerPedidos} className={alertas.length > 0 ? "mt-2" : undefined} />
              )}
            </>
          )}
          <StatLegenda>
            Do mais urgente ao menos. O primeiro é o que aparece na lista e no topo desta página
            {fraseDosPedidos ? "; os pedidos de ajuda abertos ficam à parte, no ícone da lista." : "."}
          </StatLegenda>
        </Stat>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card variant="secao" data-bloco="visao-cliente">
          <h2 className="text-rotulo uppercase text-ink-3">Cliente</h2>
          <dl className="mt-1">
            <Dado rotulo="Empresa" slot="visao-nome">
              {e.nome}
            </Dado>
            <Dado rotulo="Dono (e-mail do login)" slot="visao-dono">
              {detalhe.donoEmail ?? "Sem dono vinculado"}
            </Dado>
            <Dado rotulo="Cliente desde" slot="visao-criado">
              <span suppressHydrationWarning>{dataLongaSP(e.criadaEm)}</span>
            </Dado>
            <Dado rotulo="Pessoas com acesso" slot="visao-equipe">
              {numeroBR(detalhe.membros)}{" "}
              <span className="text-ink-3">
                (o dono{atendentes === 0 ? "" : ` e ${atendentes} ${plural(atendentes, "atendente", "atendentes")}`})
              </span>
            </Dado>
          </dl>
        </Card>

        <Card variant="secao" data-bloco="visao-agente">
          <h2 className="text-rotulo uppercase text-ink-3">Montagem e agente</h2>
          <dl className="mt-1">
            <Dado rotulo="Montagem" slot="visao-montagem">
              {montagemTerminada(e.publicada) ? "Terminada" : "Não terminada"}
            </Dado>
            <Dado rotulo="Agente" slot="visao-agente">
              {textoDoAgente(e)}
            </Dado>
            <Dado rotulo="Modo do prompt" slot="visao-modo">
              {detalhe.modoDoPrompt === "avancado" ? "Avançado" : "Guiado"}
            </Dado>
            <Dado rotulo="Destino dos avisos" slot="visao-avisos">
              {detalhe.avisosConfigurados ? "Configurado" : "Não configurado"}
            </Dado>
          </dl>
        </Card>
      </div>
    </div>
  );
}

/**
 * Os pedidos de ajuda abertos DENTRO do cartão "Alertas" (dono, 27/10/2026): só com pelo menos um aberto, a
 * frase do ícone da lista e "Ver pedidos", que leva à seção da aba Atendimento (logo abaixo de "Por que a IA
 * chamou o time"). Fica fora de `alertasDaConta` de propósito: não disputa o alerta principal da lista e do
 * topo (a ordem é decisão registrada em `admin.md`). Âmbar porque é "alguém espera", o sentido do ícone.
 */
function AlertaDePedidos({ frase, onVer, className }: { frase: string; onVer: () => void; className?: string }) {
  return (
    <Aviso
      tom="warn"
      data-slot="visao-alerta-pedidos"
      className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-2", className)}
    >
      <MessageCircleWarning size={15} aria-hidden className="shrink-0" />
      <span data-slot="visao-alerta-pedidos-texto" className="min-w-0 flex-1 font-semibold" suppressHydrationWarning>
        {frase}
      </span>
      <Button variant="outline" size="control" data-slot="visao-ver-pedidos" onClick={onVer} className="shrink-0">
        Ver pedidos
      </Button>
    </Aviso>
  );
}

export default memo(AbaVisaoGeral);
