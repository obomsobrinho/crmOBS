"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { dataLongaSP, diaMesHoraSP } from "@/lib/fuso";
import { numeroBR, plural } from "@/lib/format";
import { PLAN_ORDER, PLANS, billableSeats, type PlanKey } from "@/lib/billing";
import {
  RESPOSTA_DO_SQL,
  acoesDoFinanceiro,
  diasDigitados,
  rotuloDaCobranca,
  type Cobranca,
  type FinanceiroDoCliente,
  type PedidoDeAcao,
} from "@/lib/admin-conta";
import type { EmpresaItem } from "@/lib/admin-empresas";
import type { FonteDoCliente } from "@/lib/admin-cliente-fonte";
import { useCarga } from "@/lib/use-carga";
import { Dado, FalhaAoLer, SeloSituacao } from "@/components/admin/pecas";
import DialogoDaAcao from "@/components/admin/DialogoDaAcao";

// ABA "FINANCEIRO" do detalhe de um cliente (central do dono, entrega 2): plano,
// estado da assinatura, prazos, ids do gateway MASCARADOS no servidor, assentos e
// as cobranças do Asaas (pelo helper que já existe). As ações (vitalício,
// estender o teste, plano, bloqueio) vão por `PUT /api/admin/empresas/[id]/conta`,
// uma transação com a linha em `admin_acoes`; a tela só pergunta e mostra.

type Dialogo = "vitalicio" | "teste" | "plano" | "bloqueio" | null;

const DATA_DO_ASAAS = /^\d{4}-\d{2}-\d{2}$/;

function dataCurta(iso: string | null): string {
  return iso ? diaMesHoraSP(iso) : "Não";
}

function Cobrancas({ fonte }: { fonte: FonteDoCliente }) {
  const { dados, erro, tentarDeNovo } = useCarga<Cobranca[] | null>(fonte.cobrancas);
  if (erro) return <FalhaAoLer texto="Não deu para ler as cobranças no Asaas agora." aoTentar={tentarDeNovo} />;
  if (dados === null) return <p className="text-apoio text-ink-3">Lendo as cobranças…</p>;
  if (dados.length === 0) {
    return <EstadoVazio tamanho="compacto" data-slot="financeiro-sem-cobrancas" texto="Nenhuma cobrança no Asaas." />;
  }
  return (
    <ul className="mt-1" data-slot="financeiro-cobrancas">
      {dados.map((c, i) => (
        <li
          key={`${c.vencimento}-${i}`}
          data-slot="financeiro-cobranca"
          data-status={c.status}
          className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2 text-apoio last:border-b-0"
        >
          <span className="text-ink-3" suppressHydrationWarning>
            {DATA_DO_ASAAS.test(c.vencimento) ? dataLongaSP(`${c.vencimento}T12:00:00Z`) : c.vencimento}
          </span>
          <span className="tabular-nums text-ink">R$ {numeroBR(c.valor)}</span>
          <span className="text-ink-2">{rotuloDaCobranca(c.status)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Por que uma ação está travada: o MESMO texto que a rota devolveria. */
function Recusa({ slot, recusa }: { slot: string; recusa: string | null }) {
  if (!recusa) return null;
  return (
    <li className="text-legenda text-ink-3" data-slot={slot} data-recusa={recusa}>
      {RESPOSTA_DO_SQL[recusa]?.texto ?? recusa}
    </li>
  );
}

export default function AbaFinanceiro({
  empresa,
  financeiro,
  membros,
  fonte,
  executar,
}: {
  empresa: EmpresaItem;
  financeiro: FinanceiroDoCliente;
  membros: number;
  fonte: FonteDoCliente;
  /** Roda a ação na rota (ou no preview) e devolve o erro, ou `null`. */
  executar: (pedido: PedidoDeAcao) => Promise<string | null>;
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [diasTexto, setDiasTexto] = useState("");
  const [plano, setPlano] = useState<PlanKey | null>(financeiro.planoChave);

  const conta = empresa.conta;
  // O que dá para fazer e por que não sai de UMA regra pura (`acoesDoFinanceiro`,
  // espelho das recusas de `admin_mudar_conta`); o texto da recusa é o da rota.
  const acoes = acoesDoFinanceiro(conta, financeiro);
  const vitalicio = acoes.vitalicio.acao === "remover_vitalicio";
  const bloqueado = acoes.bloqueio.acao === "liberar";
  const dias = diasDigitados(diasTexto);
  const atendentes = billableSeats(membros);
  const incluidos = financeiro.planoChave ? PLANS[financeiro.planoChave].seats : null;

  function fechar() {
    setDialogo(null);
    setDiasTexto("");
    setPlano(financeiro.planoChave);
  }

  return (
    <div data-slot="central-aba-financeiro" className="grid gap-3 lg:grid-cols-2">
      <Card variant="secao" data-bloco="financeiro-assinatura">
        <h2 className="text-rotulo uppercase text-ink-3">Assinatura</h2>
        <dl className="mt-1">
          <Dado rotulo="Situação" slot="financeiro-situacao">
            <SeloSituacao situacao={empresa.situacao} />
          </Dado>
          <Dado rotulo="Plano" slot="financeiro-plano">
            {empresa.plano ?? "Sem plano"}
          </Dado>
          <Dado rotulo="Fim do teste" slot="financeiro-teste">
            <span suppressHydrationWarning>
              {conta.trial_ends_at ? diaMesHoraSP(conta.trial_ends_at) : "Sem prazo"}
            </span>
          </Dado>
          <Dado rotulo="Carência até" slot="financeiro-carencia">
            <span suppressHydrationWarning>{conta.grace_until ? diaMesHoraSP(conta.grace_until) : "Sem carência"}</span>
          </Dado>
          <Dado rotulo="Vitalício desde" slot="financeiro-vitalicio">
            <span suppressHydrationWarning>{dataCurta(conta.vitalicio_desde)}</span>
          </Dado>
          <Dado rotulo="Bloqueado desde" slot="financeiro-bloqueado">
            <span suppressHydrationWarning>{dataCurta(conta.bloqueado_em)}</span>
          </Dado>
        </dl>
      </Card>

      <Card variant="secao" data-bloco="financeiro-gateway">
        <h2 className="text-rotulo uppercase text-ink-3">Cobrança</h2>
        <dl className="mt-1">
          <Dado rotulo="Provedor" slot="financeiro-provedor">
            {financeiro.provedor ?? "Nenhum"}
          </Dado>
          <Dado rotulo="Cliente no provedor" slot="financeiro-cliente-gateway">
            {financeiro.clienteNoGateway ?? "Não tem"}
          </Dado>
          <Dado rotulo="Assinatura no provedor" slot="financeiro-assinatura-gateway">
            {financeiro.assinaturaNoGateway ?? "Não tem"}
          </Dado>
          <Dado rotulo="Atendentes (sem o dono)" slot="financeiro-atendentes">
            {numeroBR(atendentes)}
            {incluidos !== null ? ` de ${incluidos} ${plural(incluidos, "incluso", "inclusos")}` : ""}
          </Dado>
          <Dado rotulo="Assentos cobrados" slot="financeiro-assentos">
            {financeiro.assentosCobrados === null ? "Não sincronizado" : numeroBR(financeiro.assentosCobrados)}
          </Dado>
          <Dado rotulo="Última mudança" slot="financeiro-atualizado">
            <span suppressHydrationWarning>{dataCurta(financeiro.atualizadoEm)}</span>
          </Dado>
        </dl>
        <p className="mt-2 text-legenda text-ink-3">Os ids do provedor aparecem só com o final, para conferir no painel dele.</p>
      </Card>

      <Card variant="secao" data-bloco="financeiro-acoes">
        <h2 className="text-rotulo uppercase text-ink-3">Ações</h2>
        <ul className="mt-2 flex flex-col gap-3">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-apoio text-ink-2">
              {vitalicio ? "Vitalício: acesso pleno, nunca cobrado." : "Vitalício: nunca cobrado, nunca bloqueado."}
            </span>
            <Button
              variant="outline"
              size="control"
              data-slot="financeiro-vitalicio-botao"
              disabled={acoes.vitalicio.recusa !== null}
              onClick={() => setDialogo("vitalicio")}
            >
              {vitalicio ? "Remover vitalício" : "Marcar como vitalício"}
            </Button>
          </li>
          <Recusa slot="financeiro-vitalicio-motivo" recusa={acoes.vitalicio.recusa} />
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-apoio text-ink-2">
              Estender o teste em alguns dias.
            </span>
            <Button
              variant="outline"
              size="control"
              data-slot="financeiro-teste-botao"
              disabled={acoes.estenderTeste.recusa !== null}
              onClick={() => setDialogo("teste")}
            >
              Estender teste
            </Button>
          </li>
          <Recusa slot="financeiro-teste-motivo" recusa={acoes.estenderTeste.recusa} />
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-apoio text-ink-2">
              Plano: define o limite de atendentes.
            </span>
            <Button
              variant="outline"
              size="control"
              data-slot="financeiro-plano-botao"
              disabled={acoes.mudarPlano.recusa !== null}
              onClick={() => setDialogo("plano")}
            >
              Mudar plano
            </Button>
          </li>
          <Recusa slot="financeiro-plano-motivo" recusa={acoes.mudarPlano.recusa} />
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-apoio text-ink-2">
              {bloqueado
                ? "Bloqueado: o cliente só lê as conversas e a IA não atende."
                : "Bloquear: modo leitura e IA parada, mesmo com o beta aberto."}
            </span>
            <Button
              variant="outline"
              size="control"
              data-slot="financeiro-bloqueio-botao"
              onClick={() => setDialogo("bloqueio")}
            >
              {bloqueado ? "Liberar acesso" : "Bloquear acesso"}
            </Button>
          </li>
        </ul>
      </Card>

      <Card variant="secao" data-bloco="financeiro-cobrancas">
        <h2 className="text-rotulo uppercase text-ink-3">Cobranças no Asaas</h2>
        {financeiro.temAssinatura ? (
          <Cobrancas fonte={fonte} />
        ) : (
          <EstadoVazio tamanho="compacto" data-slot="financeiro-sem-assinatura" texto="Sem assinatura no Asaas." />
        )}
      </Card>

      <DialogoDaAcao
        aberto={dialogo === "vitalicio"}
        slot="dialogo-vitalicio"
        titulo={vitalicio ? "Remover vitalício?" : "Marcar como vitalício?"}
        texto={
          vitalicio ? (
            <p>
              {empresa.nome} volta a seguir a assinatura gravada: um teste vencido ou um pagamento atrasado passam a
              bloquear.
            </p>
          ) : (
            <p>
              {empresa.nome} passa a ter acesso pleno, nunca cobrado e nunca bloqueado por teste ou pagamento. O
              Asaas não muda isso.
            </p>
          )
        }
        rotuloConfirmar={vitalicio ? "Remover" : "Marcar"}
        onConfirmar={() => executar({ acao: acoes.vitalicio.acao })}
        onFechar={fechar}
      />

      <DialogoDaAcao
        aberto={dialogo === "teste"}
        slot="dialogo-teste"
        titulo="Estender o teste"
        texto={
          <p>
            Os dias contam a partir do fim atual do teste ou de agora, o que for mais tarde. Fim atual:{" "}
            <span suppressHydrationWarning>{conta.trial_ends_at ? diaMesHoraSP(conta.trial_ends_at) : "sem prazo"}</span>.
          </p>
        }
        rotuloConfirmar="Estender"
        podeConfirmar={dias !== undefined}
        onConfirmar={() => (dias === undefined ? Promise.resolve("Digite um número inteiro de dias.") : executar({ acao: "estender_teste", dias }))}
        onFechar={fechar}
      >
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-legenda font-semibold text-ink-2">Dias a mais</span>
          <Input
            data-campo="dias"
            inputMode="numeric"
            autoFocus
            value={diasTexto}
            onChange={(e) => setDiasTexto(e.target.value)}
            placeholder="Ex.: 7"
          />
        </label>
      </DialogoDaAcao>

      <DialogoDaAcao
        aberto={dialogo === "plano"}
        slot="dialogo-plano"
        titulo="Mudar o plano"
        texto={<p>O plano define quantos atendentes o cliente pode convidar. Nada é cobrado por aqui.</p>}
        rotuloConfirmar="Salvar plano"
        podeConfirmar={plano !== null && plano !== financeiro.planoChave}
        onConfirmar={() => (plano ? executar({ acao: "mudar_plano", plano }) : Promise.resolve("Escolha um plano."))}
        onFechar={fechar}
      >
        <div role="group" aria-label="Planos" className="flex flex-wrap gap-1.5">
          {PLAN_ORDER.map((k) => (
            <Button
              key={k}
              type="button"
              variant="alternavel"
              size="control"
              data-plano={k}
              aria-pressed={plano === k}
              onClick={() => setPlano(k)}
            >
              {PLANS[k].name}
            </Button>
          ))}
        </div>
      </DialogoDaAcao>

      <DialogoDaAcao
        aberto={dialogo === "bloqueio"}
        slot="dialogo-bloqueio"
        titulo={bloqueado ? "Liberar o acesso?" : "Bloquear o acesso?"}
        texto={
          bloqueado ? (
            <p>{empresa.nome} volta a seguir a assinatura gravada.</p>
          ) : (
            <p>
              {empresa.nome} entra em modo leitura: vê as conversas, não trabalha, e a IA para. Vale mesmo com o beta
              aberto. Nada é apagado.
            </p>
          )
        }
        perigo={!bloqueado}
        rotuloConfirmar={bloqueado ? "Liberar" : "Bloquear"}
        onConfirmar={() => executar({ acao: acoes.bloqueio.acao })}
        onFechar={fechar}
      />
    </div>
  );
}
