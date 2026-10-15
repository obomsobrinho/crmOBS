"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { diaMesHoraSP } from "@/lib/fuso";
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

export default function AbaAcoes({
  empresa,
  fonte,
  executar,
  onApagado,
}: {
  empresa: EmpresaItem;
  fonte: FonteDoCliente;
  executar: (pedido: PedidoDeAcao) => Promise<string | null>;
  onApagado: (r: Extract<RespostaDoApagar, { ok: true }>) => void;
}) {
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
