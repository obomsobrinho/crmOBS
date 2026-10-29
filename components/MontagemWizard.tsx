"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  FileText,
  Power,
  RotateCcw,
  X,
} from "lucide-react";
import BrandMark from "./BrandMark";
import ConnectWhatsApp from "./ConnectWhatsApp";
import Playground from "./Playground";
import MontagemAbertura from "./MontagemAbertura";
import { coresDoPasso, VISUAL_DO_PASSO } from "./montagem-visual";
import MontagemParada from "./MontagemParada";
import MontagemRevisao, { type PainelDaRevisao } from "./MontagemRevisao";
import {
  BlocoLimites,
  CampoHorario,
  CamposOQueSabe,
  CamposQuemAtende,
  SeletorDePreset,
  GRUPOS_PREVIEW,
} from "./agente/campos";
import { Banner, ConfirmModal, Destaque } from "./agente/ui";
import AvisosCampo from "./agente/AvisosCampo";
import { useAgentConfig } from "./agente/useAgentConfig";
import { gravarRascunho, lerRascunho, limparRascunho } from "./agente/rascunho";
import { Aviso } from "@/components/ui/aviso";
import { AreaRolavel } from "@/components/ui/dissolver-rolagem";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useCelular } from "@/lib/useCelular";
import {
  EXEMPLO_DO_PEDIDO_DE_AJUDA,
  ITENS_DA_REVISAO,
  PASSOS_MONTAGEM,
  type PassoMontagem,
} from "@/lib/onboarding";
import type { AgentConfig } from "@/lib/agent-prompt";
import type { KnowledgeDoc } from "@/lib/crm";
import { problemaDosServicos, type AgendaConfig, type ServicoDaAgenda } from "@/lib/agenda";
import { fonteDoBancoAgenda } from "@/lib/agenda-fonte";
import { createClient } from "@/lib/supabase/client";
import { ItemAgenda, ListaDeServicos, paraEditar, paraSalvar, type ServicoEditavel } from "./agenda/CamposDaAgenda";

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
  agendaInicial,
  passoInicial,
  aberturaInicial,
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
   * A agenda gravada (config e serviços ativos). null = agenda indisponível
   * (sem a tabela, por exemplo): o item não aparece.
   */
  agendaInicial: { config: AgendaConfig; servicos: ServicoDaAgenda[] } | null;
  /**
   * Força o passo de abertura, ignorando servidor e rascunho. Existe para o
   * `/design` e para o e2e conseguirem abrir um passo direto; em produção
   * ninguém passa isto, porque escolher o passo à mão pularia a gravação.
   */
  passoInicial?: PassoMontagem;
  /**
   * Só `/design` e e2e: força (ou tira) a abertura. Em produção ela aparece
   * sozinha para quem ainda não começou.
   */
  aberturaInicial?: boolean;
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
    preview,
  });

  // Onde começar. O rascunho manda, porque ele é por definição mais novo que o
  // servidor e sabe em qual passo a pessoa parou de digitar.
  // ⚠️ Até 24/09/2026 conectar era piso duro (sem instância, o assistente
  // forçava o passo 1). A ordem foi invertida e conectar virou o ÚLTIMO passo,
  // então a instância não decide mais onde a montagem abre.
  // ⚠️ O passo 5 (avisos) só serve conectado: o grupo e o teste saem do
  // WhatsApp, e ativar exige a conexão vista nesta tela. Quem volta direto nele
  // (rascunho) recomeça no 4, que vê a conexão sozinho e libera o Continuar.
  const [passo, setPasso] = useState<PassoMontagem>(() => {
    const p = passoInicial ?? rascunho?.passo ?? passoDoServidor;
    return p === "avisos" && !conectadoInicial ? "conectar" : p;
  });

  // A ABERTURA (23/10/2026, dono): o mapa dos cinco passos e a frase do
  // computador, antes do passo 1. Só para quem ainda não começou: sem rascunho
  // no navegador e sem agente configurado no servidor (que é o que manda
  // `passoDoServidor` para "quem").
  const [abertura, setAbertura] = useState(
    () => aberturaInicial ?? (!passoInicial && !rascunho && passoDoServidor === "quem")
  );
  const celular = useCelular();
  // Passo 4 no celular: a parada "Continue no computador" vem no lugar do QR,
  // que continua a um toque para quem tem o WhatsApp em outro aparelho.
  const [qrNoCelular, setQrNoCelular] = useState(false);
  // Painel da revisão antes de ativar: regras e mensagem, ou horário.
  const [painel, setPainel] = useState<PainelDaRevisao | null>(null);

  const [ativando, setAtivando] = useState(false);
  const [erroAtivar, setErroAtivar] = useState<string | null>(null);
  // Conectado NESTA tela, visto pelo polling do `ConnectWhatsApp`. É estado de
  // tela, e não de banco: `evolution_instance` preenchida só diz que a
  // instância foi criada. Quem já chega com ela aberta vê o estado conectado
  // assim que o primeiro polling responde `open`.
  const [conectado, setConectado] = useState(!!conectadoInicial);
  // Destino dos avisos SALVO (29/09/2026). Obrigatório na primeira ativação,
  // decisão do dono: quem não vive na tela não fica sabendo quando a IA pede
  // ajuda. O servidor confere de novo (`publishBlockers`); aqui é só para o
  // botão não oferecer o que vai ser recusado.
  const [destinoAvisos, setDestinoAvisos] = useState<string | null>(
    initialNotifyJid
  );
  const podeAtivar = conectado && !!destinoAvisos;

  // O ITEM "AGENDA" NO PASSO 2 (decisão do dono, 28/10/2026): o mesmo item das
  // Configurações da agenda, sem perguntar "trabalha com horário marcado?".
  // Marcado, pede só os serviços; o resto vem com os padrões (`AGENDA_PADRAO`)
  // e os dias e horários com a cópia do horário de atendimento (a rota copia).
  // Grava no Continuar do passo 2, logo depois do agente, que é quando o
  // horário de atendimento já está no banco para a cópia.
  const [agendaBase, setAgendaBase] = useState(agendaInicial?.config ?? null);
  const [agendaAtiva, setAgendaAtiva] = useState(!!agendaInicial?.config.ativa);
  const [servicosAgenda, setServicosAgenda] = useState<ServicoEditavel[]>(
    () => agendaInicial?.servicos.map(paraEditar) ?? []
  );
  const [erroAgenda, setErroAgenda] = useState<string | null>(null);
  const [gravandoAgenda, setGravandoAgenda] = useState(false);
  // Gravando o passo (agente e agenda) ou ativando: o botão principal gira e
  // "Terminar depois" espera (sair no meio da gravação perderia o passo).
  const ocupado = form.saving || gravandoAgenda || ativando;

  /** Grava a agenda quando há o que gravar. false = recusou (o erro fica no item). */
  async function gravarAgenda(): Promise<boolean> {
    // A lista já foi conferida no Continuar, antes de gravar o agente.
    if (!agendaBase || (!agendaAtiva && !agendaBase.ativa) || preview) return true;
    const lista = paraSalvar(servicosAgenda);
    setGravandoAgenda(true);
    const r = await fonteDoBancoAgenda(createClient(), clientId).salvarConfig({ ...agendaBase, ativa: agendaAtiva }, lista);
    setGravandoAgenda(false);
    if (!r.ok) {
      setErroAgenda(r.erro);
      return false;
    }
    // Com os ids devolvidos: voltar e continuar de novo não duplica serviço.
    setAgendaBase(r.config);
    setServicosAgenda(r.servicos.map(paraEditar));
    return true;
  }

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
    passo === "avisos"
      ? "Ativar depois"
      : passo === "conectar"
        ? conectado
          ? "Terminar depois"
          : "Conectar depois"
        : passo === "testar"
          ? "Testar depois"
          : "Terminar depois";
  const sair = () => router.push("/inbox");

  const indice = PASSOS_MONTAGEM.findIndex((p) => p.key === passo);
  const atual = PASSOS_MONTAGEM[indice];
  // A cor e o ícone do passo, os mesmos do mapa da abertura (26/10/2026, dono).
  const corDoPasso = coresDoPasso(passo);
  const IconeDoPasso = VISUAL_DO_PASSO[passo].icone;
  const ultimo = passo === "avisos";
  // O passo 4 só avança conectado: o 5 precisa do WhatsApp ligado.
  const esperandoConexao = passo === "conectar" && !conectado;

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
    if (passo === "conectar") return conectado ? irPara("avisos") : undefined;
    if (passo === "sabe") {
      // A lista de serviços é conferida antes de gravar o agente: recusada, a
      // pessoa corrige aqui mesmo, sem nada pela metade.
      setErroAgenda(null);
      const lista = paraSalvar(servicosAgenda);
      const problema = agendaBase ? problemaDosServicos(agendaAtiva, lista) : null;
      if (problema) return setErroAgenda(problema);
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
      if (!(await gravarAgenda())) return;
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
      // eslint-disable-next-line no-restricted-syntax -- ativar muda o estado do tenant (agent_published_at) lido nos Server Components do app
      router.refresh();
    } catch {
      setErroAtivar("Não foi possível contatar o servidor.");
      setAtivando(false);
    }
  }

  /**
   * Fechar o painel da revisão SALVA (pelo botão, pelo X ou pelo fundo): o que
   * se muda ali precisa estar no servidor antes de ativar, e ativar não salva o
   * formulário. O save incorpora também o rascunho de regra ainda não
   * adicionada, que sumiria quando o painel desmonta. Se o servidor recusar, o
   * painel fica aberto com o erro.
   */
  async function fecharPainel() {
    const { ok } = await form.save();
    if (!ok) return;
    if (!preview) limparRascunho(clientId);
    setPainel(null);
  }

  const marcarConectado = useCallback(() => setConectado(true), []);
  const docRevisao = ITENS_DA_REVISAO.find((i) => i.key === "documentos")!;
  const horarioRevisao = ITENS_DA_REVISAO.find((i) => i.key === "horario")!;

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
          // O passo 4 fica mais largo (dono, 26/10/2026): as instruções do
          // WhatsApp Web e o QR moram lado a lado e espremiam na coluna estreita.
          "mx-auto w-full flex-1 px-4 sm:px-6",
          passo === "conectar" && !abertura ? "max-w-2xl" : "max-w-lg",
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
        {abertura ? (
          <MontagemAbertura celular={celular} />
        ) : (
          <>
            <div className={telaCheia ? "mb-4" : "mb-6"}>
              <div className="mb-2 flex items-center gap-1.5">
                {PASSOS_MONTAGEM.map((p, i) => (
                  <span
                    key={p.key}
                    data-slot="montagem-trilho"
                    data-estado={
                      i < indice ? "feito" : i === indice ? "atual" : "futuro"
                    }
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      i <= indice ? "bg-primary" : "bg-[var(--chip-bg)]"
                    )}
                  />
                ))}
              </div>
              <p
                className="text-legenda font-semibold tabular-nums"
                style={{ color: corDoPasso.ink }}
              >
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
                {/* O ícone e a cor do passo, os mesmos do mapa da abertura. */}
                <h1 className="flex items-center gap-3 text-titulo">
                  <span
                    data-slot="montagem-passo-icone"
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: corDoPasso.fill, color: corDoPasso.on }}
                  >
                    <IconeDoPasso size={18} aria-hidden />
                  </span>
                  {atual.titulo}
                </h1>
                {/* ⚠️ EM DESTAQUE no passo 4 (23/10/2026, dono): "conectar não liga
                o agente" é a frase que tira o medo de ler o QR. Continua UMA
                frase só, no lugar do subtítulo (a caixa repetida saiu em
                26/09/2026). Ativar mora no passo 5 desde o mesmo dia. */}
                <p
                  data-slot="montagem-porque"
                  data-destaque={passo === "conectar" ? "" : undefined}
                  className={
                    passo === "conectar"
                      ? "mt-3 flex items-start gap-2 rounded-lg border border-brand-line bg-brand-surface px-3 py-2 text-apoio font-medium text-brand-ink"
                      : "mt-1.5 text-apoio text-ink-2"
                  }
                >
                  {passo === "conectar" && (
                    <Power size={15} className="mt-0.5 shrink-0" aria-hidden />
                  )}
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
              <Aviso tom="danger" data-slot="erro-agente" role="alert" className="mt-4">
                {form.error}
              </Aviso>
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
                  {/* HORÁRIO NO PASSO 1 (23/10/2026, dono): era só da tela do
                  agente, e a conta ia ao ar com segunda a sexta, das 8h às 18h,
                  sem ninguém ver. O pronto é sugestão até alguém conferir
                  (`hoursConfirmed`). Os mesmos campos do /agente. */}
                  <Destaque
                    chave="horario"
                    icone={CalendarClock}
                    titulo={horarioRevisao.titulo}
                    porque={horarioRevisao.porque}
                  >
                    <CampoHorario cfg={form.cfg} patch={patch} semCabecalho />
                  </Destaque>
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
                  {/* Logo depois do bloco de documentos, que é onde eles se mandam
                  (23/10/2026, dono: documento é dos que passam batido). */}
                  <Destaque
                    chave="documentos"
                    icone={FileText}
                    titulo="Mande o que você já tem pronto"
                    porque={docRevisao.porque}
                  />
                  {agendaBase && (
                    <ItemAgenda
                      ativa={agendaAtiva}
                      onAtivar={(v) => {
                        setAgendaAtiva(v);
                        setErroAgenda(null);
                      }}
                    >
                      <div className="mt-4 border-t border-line pt-4" data-agenda="montagem-servicos">
                        <p className="mb-2 text-apoio text-ink-2">
                          Os serviços, cada um com quanto tempo ocupa. O resto vem pronto e muda depois, nas configurações da agenda.
                        </p>
                        <ListaDeServicos
                          servicos={servicosAgenda}
                          comErro={!!erroAgenda}
                          onChange={(l) => {
                            setServicosAgenda(l);
                            setErroAgenda(null);
                          }}
                        />
                      </div>
                    </ItemAgenda>
                  )}
                  {erroAgenda && (
                    <p className="text-apoio text-danger-ink" role="alert" data-agenda="montagem-erro">
                      {erroAgenda}
                    </p>
                  )}
                  <p className="text-legenda text-ink-3">
                    Nada aqui é obrigatório: dá para completar depois, na tela do
                    agente.
                  </p>
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
                        WhatsApp conectado. Continue para escolher quem a IA chama.
                      </p>
                    </div>
                  ) : celular && !qrNoCelular ? (
                    <MontagemParada
                      clientId={clientId}
                      hasInstance={hasInstance}
                      onMostrarQr={() => setQrNoCelular(true)}
                      onConectado={marcarConectado}
                    />
                  ) : (
                    // O `onConectado` NÃO avança de passo: ele libera o Continuar.
                    // Conectar e seguir são dois gestos, e o segundo é da pessoa.
                    <ConnectWhatsApp
                      clientId={clientId}
                      clientName={clientName}
                      hasInstance={hasInstance}
                      enquadramento="passo"
                      onConectado={marcarConectado}
                    />
                  )}
                  {!conectado && (
                    <p
                      id="razao-continuar"
                      data-slot="montagem-razao-continuar"
                      className="text-legenda text-ink-3"
                    >
                      O Continuar libera quando o WhatsApp conectar.
                    </p>
                  )}
                </>
              )}

              {passo === "avisos" && (
                <>
                  {/* PASSO 5 (23/10/2026, dono): o passo inteiro é do pedido de
                  ajuda, o diferencial. Vem depois de conectar porque a lista de
                  grupos e o "Mandar teste" saem do próprio WhatsApp. */}
                  <div data-slot="montagem-avisos" className="scroll-mt-4">
                    <Destaque
                      chave="avisos"
                      icone={Bell}
                      titulo="Para onde vão os avisos"
                      exemplo={EXEMPLO_DO_PEDIDO_DE_AJUDA}
                    >
                      <AvisosCampo
                        clientId={clientId}
                        initialJid={destinoAvisos}
                        onSalvo={setDestinoAvisos}
                        preview={preview}
                        gruposPreview={preview ? GRUPOS_PREVIEW : undefined}
                      />
                      {!destinoAvisos && (
                        <p
                          id="razao-avisos"
                          data-slot="montagem-razao-avisos"
                          className="mt-3 text-legenda text-warn-ink"
                        >
                          Salve um número ou um grupo para poder ativar o agente.
                        </p>
                      )}
                    </Destaque>
                  </div>

                  {/* A revisão mora ANTES do que acontece ao ativar e do botão: é
                  a última parada antes de ir ao ar. */}
                  <MontagemRevisao
                    clientId={clientId}
                    cfg={form.cfg}
                    documentosDoPreview={knowledgeDocs.length}
                    preview={preview}
                    onAbrirPainel={setPainel}
                    onIrParaDocumentos={() => irPara("sabe")}
                  />

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
                        Você desliga quando quiser e assume qualquer conversa.
                      </li>
                    </ul>
                  </div>

                  {erroAtivar && <Banner>{erroAtivar}</Banner>}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* Rodapé grudado: no celular o conteúdo rola e o par voltar/continuar
          precisa continuar alcançável com o polegar. */}
      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-raised px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] max-sm:gap-1.5 max-sm:px-3 sm:px-6">
        <Button
          variant="outline"
          size="field"
          disabled={abertura || indice === 0}
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
            disabled={ocupado}
            className="max-sm:hidden"
          >
            {rotuloSaida}
          </Button>

          {/* No passo 4 o Continuar fica DESABILITADO até a conexão ser vista
              nesta tela (o 5 precisa do WhatsApp ligado). No 5 o botão é
              "Ativar o agente", desabilitado sem destino salvo. As razões estão
              escritas na tela (`razao-continuar`, `razao-avisos`), porque botão
              desabilitado não mostra dica. */}
          {abertura ? (
            <Button
              size="field"
              onClick={() => {
                setAbertura(false);
                window.scrollTo({ top: 0 });
              }}
            >
              Começar
              <ArrowRight size={15} />
            </Button>
          ) : (
            <Button
              size="field"
              carregando={ocupado}
              disabled={esperandoConexao || (ultimo && !podeAtivar)}
              aria-describedby={
                esperandoConexao
                  ? "razao-continuar"
                  : ultimo && !destinoAvisos
                    ? "razao-avisos"
                    : undefined
              }
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

      {/* O PAINEL DA REVISÃO (23/10/2026, dono): regras, mensagem e horário
          abrem aqui, com os MESMOS campos do /agente, sem sair da montagem.
          Fechar por qualquer caminho salva (`fecharPainel`). */}
      <Sheet
        open={painel !== null}
        onOpenChange={(aberto) => {
          if (!aberto) void fecharPainel();
        }}
      >
        <SheetContent
          lado={celular ? "baixo" : "direita"}
          aria-describedby={undefined}
          data-painel={painel ?? undefined}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line p-5">
            <SheetTitle>Ajustar o agente</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-control" aria-label="Fechar">
                <X size={16} />
              </Button>
            </SheetClose>
          </div>
          <AreaRolavel className="min-h-0 flex-1 p-5">
            {painel === "horario" ? (
              <CampoHorario cfg={form.cfg} patch={patch} />
            ) : (
              <BlocoLimites
                cfg={form.cfg}
                patch={patch}
                onDraft={form.onDraft}
                primeiro
              />
            )}
            {form.error && (
              <Aviso tom="danger" role="alert" className="mt-4">
                {form.error}
              </Aviso>
            )}
          </AreaRolavel>
          <div className="flex justify-end border-t border-line p-4">
            <Button
              size="field"
              carregando={form.saving}
              onClick={() => void fecharPainel()}
            >
              {form.saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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
