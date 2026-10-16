"use client";

import { memo, useState } from "react";
import { Download, Pencil } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { diaMesHoraSP } from "@/lib/fuso";
import { numeroBR } from "@/lib/format";
import { limiteDaEmpresa, tokensCurto } from "@/lib/custo-ia";
import { PLAN_ORDER, PLANS } from "@/lib/billing";
import { nomeConfere, type PedidoDeAcao } from "@/lib/admin-conta";
import type { EmpresaItem } from "@/lib/admin-empresas";
import type { FonteDoCliente, RespostaDoApagar } from "@/lib/admin-cliente-fonte";
import DialogoDaAcao from "@/components/admin/DialogoDaAcao";

// ABA "AÇÕES" do detalhe de um cliente (central do dono, entrega 2): a zona de
// perigo, separada de propósito. Dois passos (docs/adr/2026-10-15-two-step-company-deletion.md):
// 1. DESATIVAR (reversível): a IA para e os logins do cliente vão para uma tela
//    clara; nada é apagado. REATIVAR desfaz.
// 2. APAGAR DE VEZ: só para cliente desativado. Antes, a exportação LGPD (ZIP, um
//    CSV por tabela); depois, a confirmação digitando o nome do cliente.
// Quem faz cada coisa é o servidor (rotas do admin); esconder um botão nunca é a trava.
//
// O LIMITE DE IA do mês mora aqui também (15/10/2026, antes estava na aba Uso de IA): é uma
// decisão do dono sobre a conta, no mesmo lugar das outras. O teto SEGUE o plano da empresa
// (`limiteDaEmpresa`, `lib/custo-ia.ts`), então "Padrão do plano" limpa o limite personalizado (`null`) e
// a empresa continua seguindo o plano se ele mudar. O valor de OUTRO plano só entra como valor
// personalizado, de propósito e com o número já preenchido na caixa de edição (`EditarLimiteDialog`,
// uma transação com a linha em `admin_acoes`): gravá-lo direto faria a empresa parar de seguir o plano
// sem o dono perceber.

function AbaAcoes({
  empresa,
  fonte,
  executar,
  onApagado,
  onEditarLimite,
  aoMudarLimite,
}: {
  empresa: EmpresaItem;
  fonte: FonteDoCliente;
  executar: (pedido: PedidoDeAcao) => Promise<string | null>;
  onApagado: (r: Extract<RespostaDoApagar, { ok: true }>) => void;
  /** Abre a caixa de edição do limite de IA (o diálogo mora no detalhe), com um valor já preenchido quando há. */
  onEditarLimite: (sugestao?: number) => void;
  /** O limite foi limpo (volta a seguir o plano): o detalhe refaz o item (`comLimite`), sem ir ao banco. */
  aoMudarLimite: (limite: number | null) => void;
}) {
  const [aplicando, setAplicando] = useState(false);
  const [erroDoLimite, setErroDoLimite] = useState<string | null>(null);

  /** "Padrão do plano": limpa o limite personalizado, e o teto volta a seguir o plano da empresa. */
  async function seguirOPlano() {
    setAplicando(true);
    setErroDoLimite(null);
    const r = await fonte.mudarLimite(null);
    setAplicando(false);
    if (!r.ok) {
      setErroDoLimite(r.erro);
      return;
    }
    aoMudarLimite(null);
  }

  // O que o teto vale para cada plano vem de `limiteDaEmpresa` (a única regra), nunca de uma tabela lida aqui.
  const padrao = limiteDaEmpresa(null, empresa.planoChave);
  const outrosPlanos = PLAN_ORDER.filter((k) => k !== empresa.planoChave);

  const [dialogo, setDialogo] = useState<"desativar" | "apagar" | null>(null);
  const [nome, setNome] = useState("");
  const desativada = !!empresa.conta.desativada_em;
  const confere = nomeConfere(nome, empresa.nome);

  function fechar() {
    setDialogo(null);
    setNome("");
  }

  async function apagar(): Promise<string | null> {
    const r = await fonte.apagar(nome);
    if (!r.ok) return [r.erro, ...r.pendencias].join(" ");
    onApagado(r);
    return null;
  }

  return (
    <div data-slot="central-aba-acoes" className="flex flex-col gap-3">
      <Card variant="secao" data-bloco="acoes-limite">
        <h2 className="text-rotulo uppercase text-ink-3">Limite de IA do mês</h2>
        <p className="mt-2 text-apoio text-ink-2" data-slot="acoes-limite-atual">
          Limite atual: {numeroBR(empresa.limite)} tokens ({empresa.origemDoLimite}). Ao chegar nele, a IA para até o
          mês virar ou o limite subir.
        </p>
        <div
          role="group"
          aria-label="Limite de IA do mês"
          data-slot="acoes-limite-opcoes"
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <Button
            type="button"
            variant="alternavel"
            size="control"
            data-limite-plano="padrao"
            aria-pressed={empresa.limiteGravado == null}
            carregando={aplicando}
            onClick={() => void seguirOPlano()}
          >
            {empresa.planoChave ? `Padrão do plano, ${tokensCurto(padrao)}` : `Sem plano, ${tokensCurto(padrao)}`}
          </Button>
          {outrosPlanos.map((k) => (
            <Button
              key={k}
              type="button"
              variant="outline"
              size="control"
              data-limite-valor={k}
              onClick={() => onEditarLimite(limiteDaEmpresa(null, k))}
            >
              {PLANS[k].name}, {tokensCurto(limiteDaEmpresa(null, k))}
            </Button>
          ))}
          <Button variant="outline" size="control" data-slot="central-editar-limite" onClick={() => onEditarLimite()}>
            <Pencil size={14} />
            Valor personalizado
          </Button>
        </div>
        <p className="mt-2 text-legenda text-ink-3" data-slot="acoes-limite-nota">
          Os valores dos outros planos abrem o valor personalizado já preenchido: um limite personalizado deixa de
          seguir o plano da empresa.
        </p>
        {erroDoLimite && (
          <p data-slot="acoes-limite-erro" className="mt-2 text-apoio text-danger-ink" role="alert">
            {erroDoLimite}
          </p>
        )}
      </Card>

      <Aviso tom="danger" forma="caixa" data-slot="acoes-zona-de-perigo">
        Zona de perigo. Cada ação aqui fica registrada com o seu login e a hora.
      </Aviso>

      <Card variant="secao" data-bloco="acoes-desativar">
        <h2 className="text-rotulo uppercase text-ink-3">{desativada ? "Reativar" : "Desativar"}</h2>
        <p className="mt-2 text-apoio text-ink-2" data-slot="acoes-estado">
          {desativada ? (
            <>
              Desativado em <span suppressHydrationWarning>{diaMesHoraSP(empresa.conta.desativada_em ?? "")}</span>.
              A IA está parada e os logins deste cliente veem a tela de conta desativada. Nada foi apagado.
            </>
          ) : (
            "Desativar faz a IA parar e barra os logins deste cliente com uma tela clara. Nada é apagado, e dá para reativar."
          )}
        </p>
        <Button
          variant={desativada ? "outline" : "danger"}
          size="control"
          className="mt-3"
          data-slot="acoes-desativar-botao"
          onClick={() => setDialogo("desativar")}
        >
          {desativada ? "Reativar cliente" : "Desativar cliente"}
        </Button>
      </Card>

      <Card variant="secao" data-bloco="acoes-apagar">
        <h2 className="text-rotulo uppercase text-ink-3">Apagar de vez</h2>
        {!desativada ? (
          <p className="mt-2 text-apoio text-ink-2" data-slot="acoes-apagar-bloqueado">
            Só um cliente desativado pode ser apagado. Desative primeiro.
          </p>
        ) : (
          <>
            <p className="mt-2 text-apoio text-ink-2">
              Remove conversas, contatos, pedidos de ajuda, arquivos, a base de conhecimento e os logins que só
              pertencem a este cliente; cancela a assinatura no Asaas e desconecta o WhatsApp. Não tem volta.
            </p>
            <ol className="mt-3 flex flex-col gap-3">
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-apoio text-ink-2">1. Exporte os dados antes (LGPD): um ZIP com um CSV por tabela.</span>
                {/* No preview não há endereço: o link fica sem href (inerte), e o título diz por quê. */}
                <Button asChild variant="outline" size="control" data-slot="acoes-exportar">
                  <a
                    href={fonte.urlDaExportacao ?? undefined}
                    download
                    aria-disabled={fonte.urlDaExportacao ? undefined : true}
                    title={fonte.urlDaExportacao ? undefined : "O preview não tem dados para baixar"}
                  >
                    <Download size={14} />
                    Exportar dados
                  </a>
                </Button>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-apoio text-ink-2">2. Confirme digitando o nome do cliente.</span>
                <Button
                  variant="danger"
                  size="control"
                  data-slot="acoes-apagar-botao"
                  onClick={() => setDialogo("apagar")}
                >
                  Apagar de vez
                </Button>
              </li>
            </ol>
          </>
        )}
      </Card>

      <DialogoDaAcao
        aberto={dialogo === "desativar"}
        slot="dialogo-desativar"
        titulo={desativada ? "Reativar o cliente?" : "Desativar o cliente?"}
        texto={
          desativada ? (
            <p>{empresa.nome} volta a entrar e a IA volta a atender (se o agente estiver ativo).</p>
          ) : (
            <p>
              A IA de {empresa.nome} para e os logins dele passam a ver a tela de conta desativada. Nada é apagado.
            </p>
          )
        }
        perigo={!desativada}
        rotuloConfirmar={desativada ? "Reativar" : "Desativar"}
        onConfirmar={() => executar({ acao: desativada ? "reativar" : "desativar" })}
        onFechar={fechar}
      />

      <DialogoDaAcao
        aberto={dialogo === "apagar"}
        slot="dialogo-apagar"
        titulo="Apagar de vez?"
        texto={
          <>
            <p>Isto não tem volta. Exportou os dados antes?</p>
            <p>
              Para confirmar, digite o nome do cliente: <strong data-slot="dialogo-apagar-nome">{empresa.nome}</strong>
            </p>
          </>
        }
        perigo
        rotuloConfirmar="Apagar de vez"
        podeConfirmar={confere}
        onConfirmar={apagar}
        onFechar={fechar}
      >
        <Input
          data-campo="nome-do-cliente"
          aria-label="Nome do cliente"
          autoComplete="off"
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder={empresa.nome}
        />
      </DialogoDaAcao>
    </div>
  );
}

export default memo(AbaAcoes);
