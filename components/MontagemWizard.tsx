"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  FlaskConical,
  Power,
  RotateCcw,
} from "lucide-react";
import BrandMark from "./BrandMark";
import ConnectWhatsApp from "./ConnectWhatsApp";
import AgentTestDrawer from "./AgentTestDrawer";
import {
  CamposOQueSabe,
  CamposQuemAtende,
  SeletorDePreset,
} from "./agente/campos";
import { Banner } from "./agente/ui";
import { useAgentConfig } from "./agente/useAgentConfig";
import { gravarRascunho, lerRascunho, limparRascunho } from "./agente/rascunho";
import { Button } from "@/components/ui/button";
import { PASSOS_MONTAGEM, type PassoMontagem } from "@/lib/onboarding";
import type { AgentConfig } from "@/lib/agent-prompt";
import type { KnowledgeDoc } from "@/lib/crm";

// O assistente de montagem (`/montagem`). Roda UMA vez na vida da conta e some
// para sempre depois da primeira ativação.
//
// ⚠️ ELE NÃO É UM SEGUNDO FORMULÁRIO. Os campos vêm de `agente/campos.tsx` e o
// save vem de `agente/useAgentConfig.ts`, os mesmos que a tela de abas usa: se
// aqui nascessem inputs próprios, as duas superfícies divergiriam na primeira
// mudança de campo. A única diferença permitida é `mostrarOpcionais={false}`.
//
// ⚠️ ELE PEDE MENOS QUE AS ABAS, e isso é a decisão inteira. `validateConfig`
// reprova só quatro campos e `goals` já vem preenchido, então a pessoa DIGITA
// três coisas: nome da empresa, o que a empresa faz e nome do agente. Um
// assistente que mostrasse os mesmos 15 campos fatiados em quatro telas não
// tiraria o medo dos "20 campos", só o parcelaria.
//
// ⚠️ CARREGADO COM `ssr: false` (ver `MontagemCliente.tsx`). O rascunho mora no
// `localStorage`, e ler no servidor devolveria vazio: a primeira pintura
// mostraria o formulário em branco e a segunda o rascunho, o que é divergência
// de hidratação com cara de bug.

export default function MontagemWizard({
  clientId,
  clientName,
  hasInstance,
  initialConfig,
  agentConfigUpdatedAt,
  initialNotifyJid,
  prefillCompanyName,
  knowledgeDocs,
  knowledgeKeyConfigured,
  stageNames,
  passoDoServidor,
  passoInicial,
  preview = false,
}: {
  clientId: string;
  clientName: string;
  hasInstance: boolean;
  initialConfig: AgentConfig | null;
  /** clients.agent_config_updated_at, para o rascunho saber quando perder. */
  agentConfigUpdatedAt: string | null;
  initialNotifyJid: string | null;
  prefillCompanyName: string | null;
  knowledgeDocs: KnowledgeDoc[];
  knowledgeKeyConfigured: boolean;
  stageNames: Record<string, string>;
  /** Onde `montagemState` diz para retomar, olhando só o banco. */
  passoDoServidor: PassoMontagem;
  /**
   * Força o passo de abertura, ignorando servidor e rascunho. Existe para o
   * `/design` e para o e2e conseguirem abrir um passo direto; em produção
   * ninguém passa isto, porque escolher o passo à mão pularia a conexão.
   */
  passoInicial?: PassoMontagem;
  /** /design: não salva, não publica, não navega. */
  preview?: boolean;
}) {
  const router = useRouter();

  // O rascunho é lido UMA vez, na montagem do componente. `lerRascunho` já
  // descarta o que for mais velho que o `agent_config` do servidor, então o que
  // chega aqui é sempre mais novo do que está gravado.
  const [rascunho] = useState(() =>
    preview ? null : lerRascunho(clientId, agentConfigUpdatedAt)
  );

  const form = useAgentConfig({
    clientId,
    initialMode: "guiado",
    initialConfig: rascunho?.config ?? initialConfig,
    initialPersona: null,
    prefillCompanyName,
    hasManualPersona: false,
    initialNotifyJid,
    preview,
  });

  // Onde começar. Conectar é piso duro: sem instância não há o que configurar.
  // Fora isso, o rascunho manda, porque ele é por definição mais novo que o
  // servidor e sabe em qual passo a pessoa parou de digitar.
  const [passo, setPasso] = useState<PassoMontagem>(() => {
    if (passoInicial) return passoInicial;
    if (!hasInstance) return "conectar";
    return rascunho?.passo ?? passoDoServidor;
  });

  const [ativando, setAtivando] = useState(false);
  const [erroAtivar, setErroAtivar] = useState<string | null>(null);
  const [bancadaAberta, setBancadaAberta] = useState(false);

  const indice = PASSOS_MONTAGEM.findIndex((p) => p.key === passo);
  const atual = PASSOS_MONTAGEM[indice];
  const ultimo = passo === "ativar";

  function irPara(p: PassoMontagem) {
    setPasso(p);
    if (!preview) gravarRascunho(clientId, { config: form.cfg, passo: p });
  }

  // Toda tecla digitada cai no rascunho. Escrever aqui, e não dentro do
  // `setCfg`, é de propósito: atualizador de estado roda duas vezes em modo
  // estrito, e efeito colateral dentro dele é armadilha. Aqui é um manipulador
  // de evento, que roda uma vez.
  function patch(p: Partial<AgentConfig>) {
    const proximo = { ...form.cfg, ...p };
    form.setCfg(proximo);
    if (!preview) gravarRascunho(clientId, { config: proximo, passo });
  }

  /**
   * Avança. A ÚNICA gravação no servidor da montagem inteira acontece na
   * passagem de "o que ele sabe" para "ativar".
   *
   * ⚠️ Sem validação no browser, de propósito. Quem diz o que é uma configuração
   * válida é `validateConfig`, no servidor; repetir a regra aqui criaria uma
   * segunda opinião que só divergiria em produção. Se o `PUT` reprovar, o
   * assistente volta para o passo dono do campo e mostra o erro onde ele é
   * resolvido.
   */
  async function avancar() {
    if (passo === "conectar") return irPara("quem");
    if (passo === "quem") return irPara("sabe");
    if (passo === "sabe") {
      const { ok, campos } = await form.save();
      if (!ok) {
        // companyName, companyWhat e agentName moram no passo "quem"; goals nem
        // aparece no assistente (vem preenchido), então qualquer reprovação aqui
        // é do passo anterior.
        if (campos.companyName || campos.companyWhat || campos.agentName) {
          setPasso("quem");
        }
        return;
      }
      // Gravou de verdade: o rascunho perdeu a razão de existir.
      if (!preview) limparRascunho(clientId);
      setPasso("ativar");
    }
  }

  async function ativar() {
    if (preview) return;
    setAtivando(true);
    setErroAtivar(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/publish`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErroAtivar(data.error ?? "Não foi possível ativar o agente.");
        setAtivando(false);
        return;
      }
      limparRascunho(clientId);
      // O assistente acabou e não existe mais para esta conta: `/montagem` passa
      // a redirecionar para `/agente`. Mandar para o painel é mandar para a tela
      // que responde "e agora, o que ele está fazendo?".
      router.replace("/painel");
      router.refresh();
    } catch {
      setErroAtivar("Não foi possível contatar o servidor.");
      setAtivando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* A marca fica porque o assistente é tela cheia sem o menu, e sem ela a
          pessoa perde a referência de onde está. */}
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <BrandMark size="sm" />
        {/* SAIR SEM PERDER é o que separa abandono de desistência. O rascunho
            fica no navegador e a conta ganha uma linha de retorno nas outras
            telas, então esta porta não custa nada. */}
        <Button
          variant="ghost"
          size="chrome"
          onClick={() => router.push("/inbox")}
        >
          Sair e continuar depois
        </Button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Indicador por PASSO, e não por porcentagem. Os passos levam tempos
            muito diferentes (escanear um QR contra digitar um nome), e barra de
            porcentagem que parece travada logo no começo é medidamente PIOR do
            que não ter indicador nenhum: em experimento controlado com 3.179
            pessoas (Yan, Conrad, Tourangeau e Couper, 2010), o indicador que
            parecia lento no início dobrou o abandono, de 11,3% para 21,8%, e
            ficou abaixo até do grupo sem indicador nenhum (12,7%). */}
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-1.5">
            {PASSOS_MONTAGEM.map((p, i) => (
              <span
                key={p.key}
                data-slot="montagem-trilho"
                data-estado={
                  i < indice ? "feito" : i === indice ? "atual" : "futuro"
                }
                className={`h-1.5 flex-1 rounded-full ${
                  i <= indice ? "bg-primary" : "bg-[var(--chip-bg)]"
                }`}
              />
            ))}
          </div>
          <p className="text-legenda tabular-nums text-ink-3">
            Passo {indice + 1} de {PASSOS_MONTAGEM.length}
          </p>
        </div>

        <h1 className="text-titulo">{atual.titulo}</h1>
        <p className="mt-1.5 text-apoio text-ink-2">{atual.porque}</p>

        {rascunho && (
          <p className="mt-4 flex items-center gap-2 text-legenda text-ink-3">
            <RotateCcw size={13} aria-hidden />
            Retomamos de onde você parou. Nada foi ao ar ainda.
          </p>
        )}

        {form.error && (
          <div
            data-slot="erro-agente"
            role="alert"
            className="mt-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink"
          >
            {form.error}
          </div>
        )}

        <div className="mt-6 space-y-5">
          {passo === "conectar" && (
            <ConnectWhatsApp
              clientId={clientId}
              clientName={clientName}
              hasInstance={hasInstance}
              enquadramento="passo"
              onConectado={() => irPara("quem")}
            />
          )}

          {passo === "quem" && (
            <>
              <SeletorDePreset
                apresentacao="convite"
                escolhido={form.presetAplicado}
                onEscolher={form.choosePreset}
              />
              <CamposQuemAtende
                cfg={form.cfg}
                patch={patch}
                fields={form.fields}
                mostrarOpcionais={false}
              />
            </>
          )}

          {passo === "sabe" && (
            <>
              <CamposOQueSabe
                cfg={form.cfg}
                patch={patch}
                mostrarOpcionais={false}
                personaPreview={form.previewPersona}
                clientId={clientId}
                knowledgeDocs={knowledgeDocs}
                knowledgeKeyConfigured={knowledgeKeyConfigured}
                preview={preview}
              />
              <div className="flex items-start gap-3 rounded-xl border border-line bg-bloco p-4">
                <FileUp
                  size={18}
                  className="mt-0.5 shrink-0 text-brand-ink"
                  aria-hidden
                />
                <p className="text-legenda text-ink-3">
                  Nada aqui é obrigatório. Você pode escrever agora o que mais
                  repete no WhatsApp e completar o resto depois, a qualquer
                  momento, na tela do agente.
                </p>
              </div>
            </>
          )}

          {passo === "ativar" && (
            <>
              <div className="rounded-xl border border-brand-line bg-brand-surface p-5">
                <div className="flex items-start gap-3">
                  <FlaskConical
                    size={18}
                    className="mt-0.5 shrink-0 text-brand-ink"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-corpo font-semibold">Fale com ele antes</p>
                    <p className="mt-1 text-apoio text-ink-2">
                      Mande uma pergunta como se você fosse quem te chama no
                      WhatsApp. Nada disso sai daqui e ninguém recebe mensagem.
                    </p>
                    <div className="mt-3">
                      {/* Testar é OFERECIDO, nunca exigido (decisão do dono,
                          28/08/2026): virava um ritual antes de cada ativação, e
                          o gate saiu de `publishBlockers`. */}
                      <AgentTestDrawer
                        configuracao={form.configuracao}
                        stageNames={stageNames}
                        aberto={bancadaAberta}
                        onAbertoChange={setBancadaAberta}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-line bg-bloco p-5">
                <p className="text-corpo font-semibold">
                  Ao ativar, o que acontece
                </p>
                <ul className="mt-2 space-y-1.5 text-apoio text-ink-2">
                  <li className="flex items-start gap-2">
                    <Check
                      size={15}
                      className="mt-0.5 shrink-0 text-human-ink"
                      aria-hidden
                    />
                    Quem mandar mensagem no seu número recebe resposta do agente.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      size={15}
                      className="mt-0.5 shrink-0 text-human-ink"
                      aria-hidden
                    />
                    Quando ele não tiver certeza, ele avisa que vai verificar e
                    passa para você.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check
                      size={15}
                      className="mt-0.5 shrink-0 text-human-ink"
                      aria-hidden
                    />
                    Você desliga a qualquer momento, e assume qualquer conversa
                    na mão.
                  </li>
                </ul>
              </div>

              {erroAtivar && <Banner>{erroAtivar}</Banner>}

              <p className="text-legenda text-ink-3">
                Depois de ativar, esta montagem sai do caminho e os ajustes
                passam a morar na tela do agente.
              </p>
            </>
          )}
        </div>
      </main>

      {/* Rodapé grudado: no celular o conteúdo rola e o par voltar/continuar
          precisa continuar alcançável com o polegar. */}
      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-conteudo px-4 py-3 sm:px-6">
        <Button
          variant="outline"
          size="field"
          disabled={indice === 0}
          onClick={() => irPara(PASSOS_MONTAGEM[Math.max(0, indice - 1)].key)}
        >
          <ArrowLeft size={15} />
          Voltar
        </Button>

        <div className="flex items-center gap-2">
          {/* Pular existe só onde o passo é de fato opcional. Nos outros o passo
              não é adiável, e oferecer a saída ali seria mentir sobre o que
              acontece depois. */}
          {passo === "sabe" && (
            <Button
              variant="ghost"
              size="field"
              disabled={form.saving}
              onClick={() => avancar()}
            >
              Deixar para depois
            </Button>
          )}

          {/* No passo de conectar não existe Continuar: quem avança é a conexão,
              sozinha, quando o código é lido. Um botão ali levaria a pessoa para
              um agente que não tem de onde responder. */}
          {passo !== "conectar" && (
            <Button
              size="field"
              disabled={form.saving || ativando}
              onClick={() => (ultimo ? ativar() : avancar())}
            >
              {ultimo ? (
                <>
                  {ativando ? "Ativando…" : "Ativar o agente"}
                  <Power size={15} />
                </>
              ) : (
                <>
                  {form.saving ? "Salvando…" : "Continuar"}
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
