"use client";

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Input } from "@/components/ui/input";
import { dataLongaSP, diaMesHoraSP } from "@/lib/fuso";
import { numeroBR, plural } from "@/lib/format";
import { PLAN_ORDER, PLANS, billableSeats, type PlanKey } from "@/lib/billing";
import {
  PRAZOS_DO_TESTE,
  RESPOSTA_DO_SQL,
  acoesDoFinanceiro,
  diasDigitados,
  linhasDaAssinatura,
  nomeDoProvedor,
  recusasAgrupadas,
  rotuloDaCobranca,
  textoSemAssinatura,
  type Cobranca,
  type FinanceiroDoCliente,
  type PedidoDeAcao,
} from "@/lib/admin-conta";
import type { EmpresaItem } from "@/lib/admin-empresas";
import type { FonteDoCliente } from "@/lib/admin-cliente-fonte";
import { useCarga } from "@/lib/use-carga";
import { Medidor } from "@/components/ui/medidor";
import { Stat, StatFrase, StatLegenda, StatRotulo, StatTopo, StatValor } from "@/components/ui/stat";
import { Dado, FalhaAoLer, IndicadorDaSituacao, IndicadorDoPlano } from "@/components/admin/pecas";
import DialogoDaAcao from "@/components/admin/DialogoDaAcao";

// ABA "FINANCEIRO" do detalhe de um cliente (central do dono, entrega 2): plano,
// estado da assinatura, prazos, ids do gateway MASCARADOS no servidor, assentos e
// as cobranças do Asaas (pelo helper que já existe). As ações (estender o teste,
// com o vitalício entre as opções; tirar o vitalício; plano; bloqueio) vão por
// `PUT /api/admin/empresas/[id]/conta`, uma transação com a linha em
// `admin_acoes`; a tela só pergunta e mostra.

type Dialogo = "vitalicio" | "teste" | "plano" | "bloqueio" | null;

/** A opção escolhida no controle "Estender teste" (`PRAZOS_DO_TESTE`, Personalizado ou Vitalício). */
type OpcaoDoTeste = (typeof PRAZOS_DO_TESTE)[number] | "personalizado" | "vitalicio";

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

function AbaFinanceiro({
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
  const [opcao, setOpcao] = useState<OpcaoDoTeste | null>(null);
  const [diasTexto, setDiasTexto] = useState("");
  const [plano, setPlano] = useState<PlanKey | null>(financeiro.planoChave);

  const conta = empresa.conta;
  // O que dá para fazer e por que não sai de UMA regra pura (`acoesDoFinanceiro`,
  // espelho das recusas de `admin_mudar_conta`); o texto da recusa é o da rota.
  const acoes = acoesDoFinanceiro(conta, financeiro);
  const controle = acoes.estenderTeste;
  const vitalicio = acoes.vitalicio.acao === "remover_vitalicio";
  const bloqueado = acoes.bloqueio.acao === "liberar";
  const recusas = recusasAgrupadas(acoes);
  // As datas do cartão saem do TIPO de acesso (a situação), não das colunas que existem.
  const datas = linhasDaAssinatura(conta, empresa.situacao.kind);
  const atendentes = billableSeats(membros);
  const incluidos = financeiro.planoChave ? PLANS[financeiro.planoChave].seats : null;

  // O pedido da opção escolhida no "Estender teste" (nulo = falta escolher ou digitar).
  const dias = opcao === "personalizado" ? diasDigitados(diasTexto) : typeof opcao === "number" ? opcao : undefined;
  const pedidoDoTeste: PedidoDeAcao | null =
    opcao === "vitalicio" ? { acao: "vitalicio" } : dias !== undefined ? { acao: "estender_teste", dias } : null;

  function fechar() {
    setDialogo(null);
    setOpcao(null);
    setDiasTexto("");
    setPlano(financeiro.planoChave);
  }

  return (
    <div data-slot="central-aba-financeiro" className="flex flex-col gap-3">
      <div data-bloco="financeiro-resumo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <IndicadorDaSituacao e={empresa} bloco="financeiro-tile-situacao" slot="financeiro-situacao" />

        <IndicadorDoPlano
          e={empresa}
          bloco="financeiro-tile-plano"
          slot="financeiro-plano"
          frase={
            financeiro.planoChave ? `R$ ${numeroBR(PLANS[financeiro.planoChave].priceBRL)} por mês` : "nenhum plano escolhido"
          }
        />

        <Stat variant="bloco" tamanho="compacto" data-bloco="financeiro-tile-atendentes">
          <StatTopo>
            <StatRotulo>Atendentes</StatRotulo>
          </StatTopo>
          <StatValor tamanho="padrao">
            <span data-slot="financeiro-atendentes">
              {numeroBR(atendentes)}
              {incluidos !== null && <span className="text-titulo text-ink-3"> de {numeroBR(incluidos)}</span>}
            </span>
          </StatValor>
          {incluidos !== null ? (
            <>
              <Medidor
                valor={(atendentes / incluidos) * 100}
                tom={atendentes > incluidos ? "aviso" : "marca"}
                rotulo="Atendentes contra o incluído no plano"
                className="mt-1"
              />
              <StatFrase>
                {atendentes > incluidos
                  ? `${atendentes - incluidos} ${plural(atendentes - incluidos, "extra", "extras")} além do plano`
                  : `${plural(incluidos, "incluso", "inclusos")} no plano, sem contar o dono`}
              </StatFrase>
            </>
          ) : (
            <StatFrase>sem contar o dono; o limite vale com um plano</StatFrase>
          )}
        </Stat>

        <Stat variant="bloco" tamanho="compacto" data-bloco="financeiro-tile-cobranca">
          <StatTopo>
            <StatRotulo>Cobrança</StatRotulo>
          </StatTopo>
          <StatValor tamanho="padrao" className="text-balance">
            <span data-slot="financeiro-tile-cobranca-valor">{financeiro.provedor ? nomeDoProvedor(financeiro.provedor) : "Sem assinatura"}</span>
          </StatValor>
          <StatFrase>
            {financeiro.provedor
              ? financeiro.assentosCobrados === null
                ? "assentos ainda não sincronizados"
                : `${numeroBR(financeiro.assentosCobrados)} ${plural(financeiro.assentosCobrados, "assento cobrado", "assentos cobrados")}`
              : textoSemAssinatura(conta)}
          </StatFrase>
          <StatLegenda>Os ids do provedor aparecem só com o final, abaixo</StatLegenda>
        </Stat>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
      <Card variant="secao" data-bloco="financeiro-assinatura">
        <h2 className="text-rotulo uppercase text-ink-3">Prazos da assinatura</h2>
        {datas.length === 0 ? (
          <p data-slot="financeiro-sem-prazos" className="mt-2 text-apoio text-ink-2">
            Nenhum prazo a acompanhar nesta situação.
          </p>
        ) : (
          <dl className="mt-1">
            {datas.map((l) => (
              <Dado key={l.chave} rotulo={l.rotulo} slot={`financeiro-${l.chave}`}>
                <span suppressHydrationWarning>{l.quando ? diaMesHoraSP(l.quando) : l.vazio}</span>
              </Dado>
            ))}
          </dl>
        )}
      </Card>

      {financeiro.provedor && (
        <Card variant="secao" data-bloco="financeiro-gateway">
          <h2 className="text-rotulo uppercase text-ink-3">Cobrança no provedor</h2>
          <dl className="mt-1">
            <Dado rotulo="Provedor" slot="financeiro-provedor">
              {nomeDoProvedor(financeiro.provedor)}
            </Dado>
            {financeiro.clienteNoGateway && (
              <Dado rotulo="Cliente no provedor" slot="financeiro-cliente-gateway">
                {financeiro.clienteNoGateway}
              </Dado>
            )}
            {financeiro.assinaturaNoGateway && (
              <Dado rotulo="Assinatura no provedor" slot="financeiro-assinatura-gateway">
                {financeiro.assinaturaNoGateway}
              </Dado>
            )}
            <Dado rotulo="Assentos cobrados" slot="financeiro-assentos">
              {financeiro.assentosCobrados === null ? "Não sincronizado" : numeroBR(financeiro.assentosCobrados)}
            </Dado>
            {financeiro.atualizadoEm && (
              <Dado rotulo="Última mudança" slot="financeiro-atualizado">
                <span suppressHydrationWarning>{dataCurta(financeiro.atualizadoEm)}</span>
              </Dado>
            )}
          </dl>
          <p className="mt-2 text-legenda text-ink-3">
            Os ids do provedor aparecem só com o final, para conferir no painel dele.
          </p>
        </Card>
      )}

      <Card variant="secao" data-bloco="financeiro-acoes">
        <h2 className="text-rotulo uppercase text-ink-3">Ações</h2>
        <ul className="mt-2 flex flex-col gap-3">
          {/* Só entra o que dá para fazer agora: ação travada não vira botão apagado, vira uma linha com a razão (abaixo). */}
          {controle.recusa === null && (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-apoio text-ink-2">
                Estender o teste (7 dias, 15 dias ou outro prazo) ou marcar como vitalício.
              </span>
              <Button
                variant="outline"
                size="control"
                data-slot="financeiro-teste-botao"
                onClick={() => setDialogo("teste")}
              >
                Estender teste
              </Button>
            </li>
          )}
          {vitalicio && (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-apoio text-ink-2">Vitalício: acesso pleno, nunca cobrado.</span>
              <Button
                variant="outline"
                size="control"
                data-slot="financeiro-vitalicio-botao"
                onClick={() => setDialogo("vitalicio")}
              >
                Remover vitalício
              </Button>
            </li>
          )}
          {acoes.mudarPlano.recusa === null && (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-apoio text-ink-2">Plano: define o limite de atendentes.</span>
              <Button
                variant="outline"
                size="control"
                data-slot="financeiro-plano-botao"
                onClick={() => setDialogo("plano")}
              >
                Mudar plano
              </Button>
            </li>
          )}
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-apoio text-ink-2">
              {bloqueado
                ? "Bloqueado: o cliente só lê as conversas e a IA não atende."
                : "Bloquear: modo leitura e IA parada, mesmo para um vitalício."}
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
        {recusas.length > 0 && (
          <ul data-slot="financeiro-recusas" className="mt-3 flex flex-col gap-1.5 border-t border-line-soft pt-3">
            {recusas.map((r) => (
              <li
                key={r.recusa}
                data-slot="financeiro-recusa"
                data-recusa={r.recusa}
                data-acoes={r.acoes.join("|")}
                className="text-legenda text-ink-3"
              >
                {r.frase}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card variant="secao" data-bloco="financeiro-cobrancas">
        <h2 className="text-rotulo uppercase text-ink-3">Cobranças no Asaas</h2>
        {financeiro.temAssinatura ? (
          <Cobrancas fonte={fonte} />
        ) : (
          <EstadoVazio tamanho="compacto" data-slot="financeiro-sem-assinatura" texto={textoSemAssinatura(conta)} />
        )}
      </Card>

      </div>

      <DialogoDaAcao
        aberto={dialogo === "vitalicio"}
        slot="dialogo-vitalicio"
        titulo="Remover vitalício?"
        texto={
          <p>
            {empresa.nome} volta a seguir a assinatura gravada: um teste vencido ou um pagamento atrasado passam a
            bloquear.
          </p>
        }
        rotuloConfirmar="Remover"
        onConfirmar={() => executar({ acao: "remover_vitalicio" })}
        onFechar={fechar}
      />

      <DialogoDaAcao
        aberto={dialogo === "teste"}
        slot="dialogo-teste"
        titulo="Estender o teste"
        texto={
          opcao === "vitalicio" ? (
            <p>
              {empresa.nome} passa a ter acesso pleno, nunca cobrado e nunca bloqueado por teste ou pagamento. O
              Asaas não muda isso.
            </p>
          ) : (
            <p>
              Os dias contam a partir do fim atual do teste ou de agora, o que for mais tarde. Fim atual:{" "}
              <span suppressHydrationWarning>{conta.trial_ends_at ? diaMesHoraSP(conta.trial_ends_at) : "sem prazo"}</span>.
            </p>
          )
        }
        rotuloConfirmar={opcao === "vitalicio" ? "Marcar vitalício" : "Estender"}
        podeConfirmar={pedidoDoTeste !== null}
        onConfirmar={() =>
          pedidoDoTeste === null ? Promise.resolve("Escolha uma opção ou digite um número inteiro de dias.") : executar(pedidoDoTeste)
        }
        onFechar={fechar}
      >
        <div role="group" aria-label="Opções" className="flex flex-wrap gap-1.5">
          {PRAZOS_DO_TESTE.map((n) => (
            <Button
              key={n}
              type="button"
              variant="alternavel"
              size="control"
              data-opcao={n}
              disabled={controle.dias.recusa !== null}
              aria-pressed={opcao === n}
              onClick={() => setOpcao(n)}
            >
              {n} dias
            </Button>
          ))}
          <Button
            type="button"
            variant="alternavel"
            size="control"
            data-opcao="personalizado"
            disabled={controle.dias.recusa !== null}
            aria-pressed={opcao === "personalizado"}
            onClick={() => setOpcao("personalizado")}
          >
            Personalizado
          </Button>
          {controle.vitalicio && (
            <Button
              type="button"
              variant="alternavel"
              size="control"
              data-opcao="vitalicio"
              disabled={controle.vitalicio.recusa !== null}
              aria-pressed={opcao === "vitalicio"}
              onClick={() => setOpcao("vitalicio")}
            >
              Vitalício
            </Button>
          )}
        </div>
        {(controle.dias.recusa !== null || (controle.vitalicio?.recusa ?? null) !== null) && (
          <ul className="flex flex-col gap-1">
            <Recusa slot="dialogo-teste-motivo-dias" recusa={controle.dias.recusa} />
            <Recusa slot="dialogo-teste-motivo-vitalicio" recusa={controle.vitalicio?.recusa ?? null} />
          </ul>
        )}
        {opcao === "personalizado" && (
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-legenda font-semibold text-ink-2">Dias a mais</span>
            <Input
              data-campo="dias"
              inputMode="numeric"
              autoFocus
              value={diasTexto}
              onChange={(e) => setDiasTexto(e.target.value)}
              placeholder="Ex.: 30"
            />
          </label>
        )}
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
              {empresa.nome} entra em modo leitura: vê as conversas, não trabalha, e a IA para. Vale mesmo para um
              vitalício. Nada é apagado.
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

export default memo(AbaFinanceiro);
