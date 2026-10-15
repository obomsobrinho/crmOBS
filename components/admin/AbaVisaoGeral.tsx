"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { dataLongaSP, diaMesHoraSP } from "@/lib/fuso";
import { numeroBR, plural } from "@/lib/format";
import { usdCurto } from "@/lib/custo-ia";
import { montagemTerminada } from "@/lib/onboarding";
import type { Alerta, EstadoDoWhatsApp } from "@/lib/admin-alertas";
import type { DetalheDoCliente } from "@/lib/admin-cliente";
import { ChipAlerta, Dado, EstadoIa, MedidorDoLimite, textoDoAgente } from "@/components/admin/pecas";

// ABA "VISÃO GERAL" do detalhe de um cliente (central do dono, entrega 1): quem é
// o cliente, em que ponto da montagem está, como está o agente e o WhatsApp e o
// que pede atenção. Tudo vem pronto: o texto e o tom dos alertas são de
// `lib/admin-alertas.ts`, o estado da IA de `lib/custo-ia.ts`.

const ROTULO_DO_WHATSAPP: Record<EstadoDoWhatsApp, string> = {
  conectado: "Conectado",
  reconectando: "Reconectando",
  desconectado: "Desconectado",
  desconhecido: "Não deu para checar agora",
};

export default function AbaVisaoGeral({
  detalhe,
  alertas,
  whatsapp,
  onChecarWhatsapp,
}: {
  detalhe: DetalheDoCliente;
  alertas: Alerta[];
  /** `null` = checando agora (só existe para quem tem instância). */
  whatsapp: EstadoDoWhatsApp | null;
  onChecarWhatsapp: () => void;
}) {
  const e = detalhe.empresa;
  const custo = usdCurto(e.custoUsd);
  const atendentes = Math.max(0, detalhe.membros - 1);
  return (
    <div data-slot="central-aba-visao" className="grid gap-3 lg:grid-cols-2">
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
          <Dado rotulo="Tipo de conta" slot="visao-tipo">
            {e.tipo ?? "Sem tipo"}
          </Dado>
          <Dado rotulo="Pessoas com acesso" slot="visao-equipe">
            {numeroBR(detalhe.membros)}{" "}
            <span className="text-ink-3">
              (o dono{atendentes === 0 ? "" : ` e ${atendentes} ${plural(atendentes, "atendente", "atendentes")}`})
            </span>
          </Dado>
          <Dado rotulo="Última atividade" slot="visao-atividade">
            <span suppressHydrationWarning>{e.ultimaAtividade ? diaMesHoraSP(e.ultimaAtividade) : "Nenhuma"}</span>
          </Dado>
        </dl>
      </Card>

      <Card variant="secao" data-bloco="visao-alertas">
        <h2 className="text-rotulo uppercase text-ink-3">Alertas</h2>
        {alertas.length === 0 ? (
          <EstadoVazio tamanho="compacto" data-slot="visao-sem-alertas" texto="Nada pede atenção agora." />
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5" data-slot="visao-alertas-lista">
            {alertas.map((a) => (
              <li key={a.chave}>
                <ChipAlerta alerta={a} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-legenda text-ink-3">
          Do mais urgente ao menos. O primeiro é o que aparece na lista e no topo desta página.
        </p>
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
          <Dado rotulo="IA no mês" slot="visao-ia">
            <EstadoIa estado={e.estado} />
          </Dado>
        </dl>
        <MedidorDoLimite e={e} unidade extra={custo ? `${custo} estimado` : null} className="mt-2" />
      </Card>

      <Card variant="secao" data-bloco="visao-whatsapp">
        <div className="flex items-center gap-2">
          <h2 className="text-rotulo uppercase text-ink-3">WhatsApp</h2>
          {e.temInstancia && (
            <Button
              variant="outline"
              size="control"
              className="ml-auto"
              data-slot="visao-checar"
              carregando={whatsapp === null}
              onClick={onChecarWhatsapp}
            >
              Checar de novo
            </Button>
          )}
        </div>
        <dl className="mt-1">
          <Dado rotulo="Instância" slot="visao-instancia">
            {e.temInstancia ? "Criada" : "Ainda não criada"}
          </Dado>
          <Dado rotulo="Conexão agora" slot="visao-conexao">
            {!e.temInstancia ? "Sem WhatsApp" : whatsapp === null ? "Checando…" : ROTULO_DO_WHATSAPP[whatsapp]}
          </Dado>
        </dl>
        <p className="mt-2 text-legenda text-ink-3">
          A conexão é consultada na Evolution só aqui, ao abrir a página. A lista de clientes não consulta.
        </p>
      </Card>
    </div>
  );
}
