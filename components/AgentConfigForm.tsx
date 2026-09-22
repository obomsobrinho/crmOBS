"use client";

import { useState } from "react";
import {
  Code2,
  FlaskConical,
  Lock,
  Save,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { estimarTokens, foraDoCache, type AgentConfig } from "@/lib/agent-prompt";
import type { KnowledgeDoc } from "@/lib/crm";
import AgentPromptDrawer from "./AgentPromptDrawer";
import AgentPowerToggle from "./AgentPowerToggle";
import AgentTestDrawer from "./AgentTestDrawer";
import {
  CamposOQuePodeFazer,
  CamposOQueSabe,
  CamposQuemAtende,
  SeletorDePreset,
} from "./agente/campos";
import { AvisoCache, Banner, ConfirmModal } from "./agente/ui";
import { useAgentConfig, type Mode } from "./agente/useAgentConfig";
import { Button } from "@/components/ui/button";
import { useDissolverRolagem } from "@/components/ui/dissolver-rolagem";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// A tela PERMANENTE do agente (`/agente`). Três abas de verdade, que trocam o
// conteúdo, mais o modo avançado.
//
// ⚠️ ELA NÃO É MAIS A TELA DE MONTAGEM. Quem nunca publicou vai para o
// assistente de `/montagem`, e é por isso que aqui sumiram os numerais de ordem
// nos grupos, os botões "Continuar", o bloco "Vamos montar seu atendente" e o
// "Já sei o que estou fazendo". Aquilo tudo era um wizard improvisado dentro de
// uma página de rolagem única, feito quando não existia um wizard de verdade.
//
// ⚠️ AS ABAS USAM `forceMount`. O Radix desmonta o painel inativo por padrão, e
// `AgentBulletList` guarda o rascunho ainda não adicionado num ref do pai: com
// desmontagem, trocar de aba faria o texto sumir da tela CONTINUANDO a ser
// salvo, que é pior do que perder. É o mesmo motivo do `manterMontado` do
// `Recolhivel`. O custo é que as três abas sempre existem no DOM; o ganho extra
// é que o erro de um campo continua alcançável mesmo com a aba fechada.

type Aba = "quem" | "sabe" | "pode";

const ABAS: { key: Aba; label: string }[] = [
  { key: "quem", label: "Quem atende" },
  { key: "sabe", label: "O que ele sabe" },
  { key: "pode", label: "O que ele pode fazer" },
];

/**
 * Qual aba mostra o erro de cada campo obrigatório.
 *
 * `validateConfig` reprova exatamente quatro campos, e três deles moram na
 * primeira aba. NENHUM campo obrigatório mora em "O que ele sabe", e isso não é
 * descuido: aquela aba inteira é opcional.
 *
 * A ordem da lista é a ordem das abas, então o primeiro achado é o primeiro
 * problema na leitura da tela.
 */
const CAMPO_PARA_ABA: [campo: string, aba: Aba][] = [
  ["companyName", "quem"],
  ["companyWhat", "quem"],
  ["agentName", "quem"],
  ["goals", "pode"],
];

function abasComErro(fields: Record<string, string>): Set<Aba> {
  const s = new Set<Aba>();
  for (const [campo, aba] of CAMPO_PARA_ABA) if (fields[campo]) s.add(aba);
  return s;
}

export default function AgentConfigForm({
  clientId,
  initialMode,
  initialConfig,
  initialPersona,
  prefillCompanyName,
  hasManualPersona,
  initialNotifyJid,
  stageNames,
  knowledgeDocs,
  knowledgeKeyConfigured,
  agentEnabled,
  jaPublicou,
  blockers,
  preview = false,
}: {
  clientId: string;
  initialMode: Mode;
  initialConfig: AgentConfig | null;
  initialPersona: string | null;
  /** Nome sugerido p/ o campo "empresa" na 1ª configuração (sem agent_config). */
  prefillCompanyName?: string | null;
  hasManualPersona: boolean;
  /**
   * Grupo de WhatsApp que recebe os avisos (clients.notify_group_jid). Era um
   * cartão separado com Salvar próprio; virou campo daqui porque o único caso em
   * que ele importa é o objetivo "Agendar", então o lugar dele é ao lado do
   * objetivo que o exige.
   */
  initialNotifyJid: string | null;
  /** key -> nome do estágio do funil, para a bancada rotular o card que moveria. */
  stageNames: Record<string, string>;
  /** Base de conhecimento do tenant, dentro do grupo "O que ele sabe". */
  knowledgeDocs: KnowledgeDoc[];
  /** OPENAI_API_KEY no servidor. Sem ela o upload responde 501. */
  knowledgeKeyConfigured: boolean;
  /** Agente atendendo agora (já foi ao ar E está ligado). */
  agentEnabled: boolean;
  /** `agent_published_at` preenchido, ou seja, o agente JÁ FOI AO AR alguma vez. */
  jaPublicou: boolean;
  /** O que falta para a primeira ativação (lib/onboarding.publishBlockers). */
  blockers: string[];
  /** /design: desativa o fetch de salvar. */
  preview?: boolean;
}) {
  const form = useAgentConfig({
    clientId,
    initialMode,
    initialConfig,
    initialPersona,
    prefillCompanyName,
    hasManualPersona,
    initialNotifyJid,
    preview,
  });

  const [aba, setAba] = useState<Aba>("quem");
  const [bancadaAberta, setBancadaAberta] = useState(false);
  // Regra da casa: área rolável dissolve nas bordas. Este é o bloco do rabo
  // invariante da base, texto corrido, então o degrau é o padrão.
  // ⚠️ Desestruturado: ler propriedade de um objeto que carrega ref durante o
  // render é erro de `react-hooks/refs`. Ver a nota em `AreaRolavel`.
  const {
    ref: raboRef,
    style: raboStyle,
    onScroll: raboOnScroll,
  } = useDissolverRolagem<HTMLPreElement>(undefined, [form.baseTail]);

  const comErro = abasComErro(form.fields);
  const semCacheAvancado =
    form.mode === "avancado" && foraDoCache(form.previewPersona);

  async function salvar(confirmOverwrite = false) {
    const { ok, campos } = await form.save(confirmOverwrite);
    if (ok || form.mode !== "guiado") return;
    // Troca para a primeira aba com erro ANTES de rolar: o painel inativo fica
    // com `hidden`, e `scrollIntoView` em elemento escondido não faz nada.
    const alvo = CAMPO_PARA_ABA.find(([campo]) => campos[campo]);
    if (alvo) setAba(alvo[1]);
  }

  return (
    // Quem rola é o cartão de `/agente`. O `min-h-full` existe porque o rodapé é
    // `sticky bottom-0`: com abas, o conteúdo visível de UMA aba pode ser mais
    // curto que o cartão, e aí um sticky não gruda em lugar nenhum, ele
    // simplesmente para onde o conteúdo acaba. O Salvar ficava boiando a 174px do
    // fim, com faixa branca embaixo.
    <div className="flex min-h-full flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-brand-ink" />
            <h1 className="text-titulo">Agente de IA</h1>
          </div>
          <p className="text-apoio text-ink-2">
            Configure como o agente atende no WhatsApp.
          </p>
        </div>

        {/* O cabeçalho fala só do que está no ar. Salvar mora no rodapé, junto do
            fim do formulário, que é onde a pessoa termina de mexer. */}
        <div className="flex items-center gap-2">
          {/* Testar vem antes de ver o prompt: é o que a pessoa quer fazer
              depois de mexer nos campos. O prompt é conferência. */}
          <AgentTestDrawer
            configuracao={form.configuracao}
            stageNames={stageNames}
            aberto={bancadaAberta}
            onAbertoChange={setBancadaAberta}
          />
          <AgentPromptDrawer
            persona={form.previewPersona}
            onRestore={form.restaurar}
          />
          <AgentPowerToggle
            clientId={clientId}
            enabled={agentEnabled}
            blocked={blockers.length > 0}
          />
        </div>
      </div>

      {blockers.length > 0 && !agentEnabled && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
          <TriangleAlert size={15} className="shrink-0" />
          <span>Antes de ativar o agente, falta: {blockers.join(", ")}.</span>
        </div>
      )}

      {form.error && (
        <div
          data-slot="erro-agente"
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink"
        >
          {form.error}
        </div>
      )}
      {form.hadManual && form.mode === "guiado" && (
        <Banner>
          Este agente tem um prompt escrito à mão. Salvar pelo formulário guiado
          vai substituí-lo (o sistema pede confirmação).
        </Banner>
      )}

      {/* Faixa de abas mais o interruptor de modo.
          ⚠️ O modo avançado NÃO é uma quarta aba, e isso não é preferência: as
          três abas são recortes do MESMO formulário, e o avançado é outro
          formulário. Misturar os dois sentidos numa faixa só faria "prompt à mão"
          parecer mais uma seção da configuração guiada. Ele também não é uma
          segunda faixa de abas empilhada, que era o desenho anterior. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line">
        {form.mode === "guiado" ? (
          <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
            <TabsList>
              {ABAS.map((a) => (
                <TabsTrigger key={a.key} value={a.key}>
                  {a.label}
                  {comErro.has(a.key) && (
                    // Ponto, e não aba pintada de vermelho: vermelho é cor de
                    // ESTADO neste sistema, e uma aba inteira em `danger`
                    // gritaria mais que o próprio erro. Só aparece DEPOIS de
                    // tentar salvar: marcar campo que a pessoa ainda não viu é
                    // cobrança, não ajuda.
                    <span
                      data-slot="aba-com-erro"
                      aria-label="esta aba tem um campo obrigatório em falta"
                      className="ml-1.5 inline-block size-1.5 rounded-full bg-[var(--danger-ink)] align-middle"
                    />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <p className="flex items-center gap-2 py-2 text-corpo font-semibold">
            <Code2 size={15} className="text-brand-ink" />
            Prompt escrito à mão
          </p>
        )}

        <div className="mb-1 flex shrink-0 items-center gap-1">
          {/* O modelo mexe nas três abas, então mora aqui e não dentro de uma
              delas. Só no guiado: o avançado não tem campo para ele preencher. */}
          {form.mode === "guiado" && (
            <SeletorDePreset apresentacao="menu" onEscolher={form.choosePreset} />
          )}
        <Button
          variant="ghost"
          size="chrome"
          onClick={() =>
            form.switchMode(form.mode === "guiado" ? "avancado" : "guiado")
          }
        >
          {form.mode === "guiado" ? (
            <>
              <Code2 size={14} />
              Escrever o prompt à mão
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Voltar ao formulário guiado
            </>
          )}
        </Button>
        </div>
      </div>

      {form.mode === "guiado" ? (
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="flex-1">
          <TabsContent
            value="quem"
            forceMount
            id="grupo-quem"
            className="space-y-4"
          >
            <CamposQuemAtende
              cfg={form.cfg}
              patch={form.patch}
              fields={form.fields}
            />
          </TabsContent>

          <TabsContent
            value="sabe"
            forceMount
            id="grupo-sabe"
            className="space-y-4"
          >
            <CamposOQueSabe
              cfg={form.cfg}
              patch={form.patch}
              personaPreview={form.previewPersona}
              clientId={clientId}
              knowledgeDocs={knowledgeDocs}
              knowledgeKeyConfigured={knowledgeKeyConfigured}
              preview={preview}
            />
          </TabsContent>

          <TabsContent
            value="pode"
            forceMount
            id="grupo-pode"
            className="space-y-4"
          >
            <CamposOQuePodeFazer
              cfg={form.cfg}
              patch={form.patch}
              fields={form.fields}
              notifyJid={form.notifyJid}
              setNotifyJid={form.setNotifyJid}
              onDraft={form.onDraft}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1 space-y-5">
          {/* Horário SAIU do avançado (22/08/2026, decisão do dono). O motivo é
              coerência: nome da empresa também é dado da empresa e nunca esteve
              aqui, então ter só o horário confundia mais do que ajudava. */}
          <p className="text-legenda text-ink-3">
            Escreva o prompt do jeito que quiser. As quatro seções do fim são
            fixas e vêm depois do seu texto, para o contrato de saída nunca
            quebrar e para você receber melhorias nossas sem reescrever nada.
          </p>

          {/* Aviso, e não apagamento silencioso: se a persona guardada tinha
              seções que agora são fixas, o texto delas sai no primeiro save. A
              pessoa precisa saber ANTES de clicar em Salvar. */}
          {form.tailRemovido.length > 0 && (
            <Banner>
              Seu prompt tinha estas seções escritas à mão, e elas passaram a ser
              fixas: <strong>{form.tailRemovido.join(", ")}</strong>. O conteúdo
              que você tinha nelas <strong>não será salvo</strong>. Se tiver algo
              ali que você quer manter, mova para o texto acima antes de salvar.
            </Banner>
          )}

          <Textarea
            value={form.rawPersona}
            onChange={(e) => form.setRawPersona(e.target.value)}
            rows={22}
            className="resize-none font-mono text-legenda leading-[19px]"
          />
          <div className="-mt-4 text-right text-legenda tabular-nums text-ink-3">
            {form.rawPersona.length.toLocaleString("pt-BR")} caracteres
          </div>

          {/* O aviso de cache vive junto do campo que o resolve, e no avançado
              esse campo é a própria textarea. Na prática é o único modo em que
              ele dispara: o esqueleto vazio do guiado já dá cerca de 2.146
              tokens. */}
          {semCacheAvancado && (
            <AvisoCache tokens={estimarTokens(form.previewPersona)}>
              Escrever mais contexto no prompt deixa o agente melhor e mais
              barato ao mesmo tempo.
            </AvisoCache>
          )}

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
              <Lock size={13} />
              Fixo, sempre no fim do seu prompt
            </div>
            {/* Hook e nao <AreaRolavel>: aquele renderiza <div>, e aqui o
                elemento precisa ser <pre> para preservar o texto do prompt. */}
            <pre
              ref={raboRef}
              style={raboStyle}
              onScroll={raboOnScroll}
              className="max-h-64 overflow-y-auto rounded-xl border border-line bg-[var(--input-bg)] p-3.5 font-sans text-legenda leading-[19px] break-words whitespace-pre-wrap text-ink-3"
            >
              {form.baseTail}
            </pre>
          </div>
        </div>
      )}

      {/* Rodapé GRUDADO no fim do cartão. Salvar mora aqui, e não no cabeçalho,
          porque é onde a pessoa termina de mexer.
          Salvar JÁ É publicar (o n8n lê clients.persona ao vivo), e a frase ao
          lado existe para isso não ser surpresa; cada save vira uma versão no
          histórico do drawer, que é de onde se volta atrás.
          ⚠️ O `-mx-6` sangra até a borda do cartão, mas o padding de BAIXO do
          cartão foi removido (`px-6 pt-6` nas páginas que montam esta tela) em
          vez de cancelado com `-mb-6`. O motivo é medido: `bottom: 0` cola no fim
          da CONTENT BOX do container de rolagem, então com `pb-6` no cartão a
          faixa parava 24px acima do fim e dava para ver conteúdo passando por
          baixo dela. Quem dá o respiro de baixo é o `py-3` daqui. */}
      <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line bg-raised px-6 py-3">
        {/* ⚠️ A frase depende de `jaPublicou`, e isso é CORREÇÃO, não estilo.
            "Salvar já publica no WhatsApp" era dito a todo mundo, mas
            `lib/agent-turn.ts` devolve turno silencioso quando
            `agent_published_at` é nulo: antes da primeira ativação, salvar NÃO
            publica nada. */}
        <span className="mr-auto text-legenda text-ink-3">
          {jaPublicou
            ? "Salvar já publica no WhatsApp."
            : "Ainda não vai ao ar: o agente só começa a responder quando você ativar."}
        </span>
        {form.savedAt && (
          <span className="text-legenda text-ink-3">Salvo às {form.savedAt}</span>
        )}
        {!jaPublicou && form.savedAt && (
          <Button
            variant="outline"
            size="field"
            onClick={() => setBancadaAberta(true)}
          >
            <FlaskConical size={15} />
            Agora teste a conversa
          </Button>
        )}
        <Button size="field" onClick={() => salvar()} disabled={form.saving}>
          <Save size={15} />
          {form.saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <ConfirmModal
        aberto={form.confirmOpen}
        title="Substituir o prompt?"
        body="Este agente tem um prompt escrito à mão. Salvar pelo formulário guiado vai substituí-lo. Essa ação não pode ser desfeita."
        confirmLabel="Substituir"
        onCancel={() => form.setConfirmOpen(false)}
        onConfirm={() => {
          form.setConfirmOpen(false);
          salvar(true);
        }}
      />

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
