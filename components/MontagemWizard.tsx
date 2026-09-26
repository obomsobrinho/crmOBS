"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileUp,
  Power,
  RotateCcw,
} from "lucide-react";
import BrandMark from "./BrandMark";
import ConnectWhatsApp from "./ConnectWhatsApp";
import Playground from "./Playground";
import {
  CamposOQueSabe,
  CamposQuemAtende,
  SeletorDePreset,
} from "./agente/campos";
import { Banner, ConfirmModal } from "./agente/ui";
import { useAgentConfig } from "./agente/useAgentConfig";
import { gravarRascunho, lerRascunho, limparRascunho } from "./agente/rascunho";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  conectadoInicial,
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
   * ninguém passa isto, porque escolher o passo à mão pularia a gravação.
   */
  passoInicial?: PassoMontagem;
  /**
   * Só `/design` e e2e: abre o último passo já no estado conectado. Em produção
   * quem diz que conectou é o polling do `ConnectWhatsApp`, nunca uma prop.
   */
  conectadoInicial?: boolean;
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

  // Onde começar. O rascunho manda, porque ele é por definição mais novo que o
  // servidor e sabe em qual passo a pessoa parou de digitar.
  // ⚠️ Até 24/09/2026 conectar era piso duro (sem instância, o assistente
  // forçava o passo 1). A ordem foi invertida e conectar virou o ÚLTIMO passo,
  // então a instância não decide mais onde a montagem abre.
  const [passo, setPasso] = useState<PassoMontagem>(
    () => passoInicial ?? rascunho?.passo ?? passoDoServidor
  );

  const [ativando, setAtivando] = useState(false);
  const [erroAtivar, setErroAtivar] = useState<string | null>(null);
  // Conectado NESTA tela, visto pelo polling do `ConnectWhatsApp`. É estado de
  // tela, e não de banco: `evolution_instance` preenchida só diz que a
  // instância foi criada. Quem já chega com ela aberta vê o estado conectado
  // assim que o primeiro polling responde `open`.
  const [conectado, setConectado] = useState(!!conectadoInicial);

  // Recomeçar a conversa de teste = remontar a bancada (a `key` muda), o mesmo
  // truque do "Resetar" do `AgentTestDrawer`.
  const [conversaTeste, setConversaTeste] = useState(0);
  // O passo de conversa ocupa a tela inteira, SEM ROLAGEM (pedido do dono): o
  // chat estica até o rodapé, como na tela de Conversas, e quem rola é só a
  // conversa por dentro.
  const telaCheia = passo === "testar";

  // A saída diz O QUE fica para depois, e acompanha o progresso (26/09/2026,
  // dono): "Sair e continuar depois" soava como sair de tudo. Em nenhum passo
  // ela perde nada: antes de "o que ele sabe" o rascunho fica no navegador, e
  // dali em diante a configuração já está salva no servidor.
  const rotuloSaida =
    passo === "conectar"
      ? conectado
        ? "Ativar depois"
        : "Conectar depois"
      : passo === "testar"
        ? "Testar depois"
        : "Terminar depois";
  const sair = () => router.push("/inbox");

  const indice = PASSOS_MONTAGEM.findIndex((p) => p.key === passo);
  const atual = PASSOS_MONTAGEM[indice];
  const ultimo = passo === "conectar";

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
   * passagem de "o que ele sabe" para "testar": a bancada testa a configuração
   * em edição e não precisaria disso, mas conectar e ativar precisam de um
   * agente configurado no banco.
   *
   * ⚠️ Sem validação no browser, de propósito. Quem diz o que é uma configuração
   * válida é `validateConfig`, no servidor; repetir a regra aqui criaria uma
   * segunda opinião que só divergiria em produção. Se o `PUT` reprovar, o
   * assistente volta para o passo dono do campo e mostra o erro onde ele é
   * resolvido.
   */
  async function avancar() {
    if (passo === "quem") return irPara("sabe");
    // Testar é OFERECIDO, nunca exigido (decisão do dono, 28/08/2026): o
    // Continuar funciona sem ninguém ter aberto a bancada.
    if (passo === "testar") return irPara("conectar");
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
      setPasso("testar");
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
    <div
      className={cn(
        "flex flex-col bg-canvas",
        telaCheia ? "h-dvh overflow-hidden" : "min-h-screen"
      )}
    >
      {/* A marca fica porque o assistente é tela cheia sem o menu, e sem ela a
          pessoa perde a referência de onde está. */}
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <BrandMark size="sm" />
        {/* SAIR SEM PERDER é o que separa abandono de desistência. O rascunho
            fica no navegador e a conta ganha uma linha de retorno nas outras
            telas, então esta porta não custa nada.
            ⚠️ No computador ela mora no RODAPÉ, ao lado da ação principal
            (26/09/2026, dono: "são vários lugares para clicar"). Aqui em cima
            fica só no celular, onde o rodapé não tem espaço para três botões. */}
        <Button
          variant="ghost"
          size="chrome"
          onClick={sair}
          className="sm:hidden"
        >
          {rotuloSaida}
        </Button>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6",
          telaCheia ? "flex min-h-0 flex-col py-4 sm:py-6" : "py-6 sm:py-8"
        )}
      >
        {/* Indicador por PASSO, e não por porcentagem. Os passos levam tempos
            muito diferentes (escanear um QR contra digitar um nome), e barra de
            porcentagem que parece travada logo no começo é medidamente PIOR do
            que não ter indicador nenhum: em experimento controlado com 3.179
            pessoas (Yan, Conrad, Tourangeau e Couper, 2010), o indicador que
            parecia lento no início dobrou o abandono, de 11,3% para 21,8%, e
            ficou abaixo até do grupo sem indicador nenhum (12,7%). */}
        <div className={telaCheia ? "mb-4" : "mb-6"}>
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

        {/* ⚠️ NÃO EXISTE MAIS o "Retomamos de onde você parou. Nada foi ao ar
            ainda." (26/09/2026, dono): voltar com o que já tinha escrito é o
            esperado e dispensa aviso, e a frase aparecia longe do que dizia, a
            ponto de o próprio dono não entender. O rascunho continua sendo lido
            do mesmo jeito; só o anúncio saiu. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-titulo">{atual.titulo}</h1>
            {/* No passo de conectar o subtítulo É a razão do Ativar desabilitado
                (`aria-describedby` do botão aponta para cá). */}
            <p
              id={passo === "conectar" ? "razao-ativar" : undefined}
              data-slot="montagem-porque"
              className="mt-1.5 text-apoio text-ink-2"
            >
              {atual.porque}
            </p>
          </div>
          {/* Sempre à vista, e não só depois da primeira mensagem (dono): é a
              saída para testar de novo do zero depois de voltar e ajustar. */}
          {passo === "testar" && (
            <Button
              variant="outline"
              size="field"
              onClick={() => setConversaTeste((n) => n + 1)}
              aria-label="Recomeçar conversa"
              // No celular só o ícone: com o rótulo o título quebrava em duas
              // linhas e empurrava a conversa para baixo.
              className="shrink-0 max-sm:w-10 max-sm:justify-center max-sm:px-0"
            >
              <RotateCcw size={14} />
              <span className="max-sm:hidden">Recomeçar conversa</span>
            </Button>
          )}
        </div>

        {form.error && (
          <div
            data-slot="erro-agente"
            role="alert"
            className="mt-4 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink"
          >
            {form.error}
          </div>
        )}

        <div
          className={
            telaCheia ? "mt-4 flex min-h-0 flex-1 flex-col" : "mt-6 space-y-5"
          }
        >
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

          {/* A CONVERSA MORA NO PASSO (26/09/2026, pedido do dono). Era um cartão
              repetindo o subtítulo com um botão que abria a bancada num painel
              lateral: um clique a mais num passo cuja razão de existir é testar.
              Sem o diagnóstico (`diagnostico={false}`), porque aqui quem testa
              quer ver o agente responder, não RAG e estágio.
              Testar continua OFERECIDO, nunca exigido (decisão de 28/08/2026):
              o Continuar deste passo funciona sem mensagem nenhuma. */}
          {passo === "testar" && (
            <div
              data-slot="montagem-bancada"
              className="flex min-h-0 flex-1 flex-col"
            >
              <Playground
                key={conversaTeste}
                stageNames={stageNames}
                configuracao={form.configuracao}
                diagnostico={false}
              />
            </div>
          )}

          {passo === "conectar" && (
            <>
              {/* ⚠️ A CAIXA "Conectar não liga o agente" SAIU (26/09/2026, dono):
                  ela repetia o subtítulo quase palavra por palavra. A frase que
                  a ordem nova existe para dizer mora agora no próprio subtítulo
                  do passo (`PASSOS_MONTAGEM`), uma vez só. */}
              {conectado ? (
                <div
                  data-slot="whatsapp-conectado"
                  className="flex items-center gap-3 rounded-xl border border-human-line bg-human-surface px-4 py-3"
                >
                  <Check
                    size={17}
                    className="shrink-0 text-human-ink"
                    aria-hidden
                  />
                  <p className="text-apoio font-medium text-human-ink">
                    WhatsApp conectado. Falta só ativar.
                  </p>
                </div>
              ) : (
                // O `onConectado` NÃO avança de passo: ele revela a ativação logo
                // abaixo, no mesmo passo. Conectar e ativar são dois gestos, e o
                // segundo é da pessoa.
                <ConnectWhatsApp
                  clientId={clientId}
                  clientName={clientName}
                  hasInstance={hasInstance}
                  enquadramento="passo"
                  onConectado={() => setConectado(true)}
                />
              )}
            </>
          )}

          {passo === "conectar" && conectado && (
            <>
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
      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-raised px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] max-sm:gap-1.5 max-sm:px-3 sm:px-6">
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
          {/* ⚠️ "Deixar para depois" SAIU de "o que ele sabe" (26/09/2026). Ele
              fazia exatamente o mesmo que o Continuar (os dois gravam e
              avançam, e nada ali é obrigatório, o que o passo já diz), e com a
              saída vindo para o rodapé seriam três botões com "depois" em dois.
              A saída fica ao lado da ação principal, com o nome do que fica
              para depois. */}
          <Button
            variant="ghost"
            size="field"
            onClick={sair}
            disabled={form.saving || ativando}
            className="max-sm:hidden"
          >
            {rotuloSaida}
          </Button>

          {/* No último passo o botão é "Ativar o agente", e ele fica DESABILITADO
              até a conexão ser vista nesta tela: ativar sem número ligado seria
              um agente sem de onde responder. A razão está escrita no passo
              (`razao-ativar`, o subtítulo do passo), porque botão desabilitado
              não mostra dica. */}
          <Button
            size="field"
            carregando={form.saving || ativando}
            disabled={ultimo && !conectado}
            aria-describedby={ultimo && !conectado ? "razao-ativar" : undefined}
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
        </div>
      </footer>

      {/* ⚠️ BUG DE 26/09/2026: trocar de modelo com o formulário preenchido
          não fazia nada. `choosePreset` guarda o modelo em `pendingPreset` e
          espera a confirmação, e só a tela `/agente` desenhava o diálogo: aqui
          o clique ficava pendurado para sempre. A confirmação fica, porque o
          modelo substitui o que a pessoa escreveu em "o que ele sabe". */}
      <ConfirmModal
        aberto={form.pendingPreset !== null}
        title={`Aplicar o modelo ${form.pendingPreset?.label ?? ""}?`}
        body="Isso substitui tom, objetivos, regras e detalhes pelo esqueleto do segmento. Nome, endereço, site e horário são mantidos."
        confirmLabel="Aplicar modelo"
        onCancel={() => form.setPendingPreset(null)}
        onConfirm={form.confirmarPreset}
      />
    </div>
  );
}
