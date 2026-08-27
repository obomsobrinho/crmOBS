"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Sparkles,
  Code2,
  AlertTriangle,
  TriangleAlert,
  LayoutTemplate,
  Bell,
  Lock,
  ChevronRight,
  ChevronDown,
  FlaskConical,
} from "lucide-react";
import {
  buildAdvancedPersona,
  buildBaseTail,
  buildPersona,
  estimarTokens,
  foraDoCache,
  renderHours,
  stripBaseTail,
  CACHE_SAFE_TOKENS,
  DEFAULT_HANDOFF_NOTICE,
  EMPTY_CONFIG,
  TONES,
  GOALS,
  LIMITS,
  type AgentConfig,
  type Tone,
  type Goal,
} from "@/lib/agent-prompt";
import { AGENT_PRESETS, type AgentPreset } from "@/lib/agent-presets";
import AgentHoursEditor from "./AgentHoursEditor";
import AgentBulletList from "./AgentBulletList";
import KnowledgeManager from "./KnowledgeManager";
import { type KnowledgeDoc } from "@/lib/crm";
import AgentPromptDrawer from "./AgentPromptDrawer";
import AgentPowerToggle from "./AgentPowerToggle";
import AgentTestDrawer from "./AgentTestDrawer";
import type { ConfiguracaoEmEdicao } from "./Playground";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Mode = "guiado" | "avancado";

export default function AgentConfigForm({
  clientId,
  instance,
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
  instance: string | null;
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
  /**
   * Base de conhecimento do tenant. Mora aqui desde 26/08/2026: o prompt já
   * tratava "detalhes do negócio" e os trechos da base como a MESMA fonte
   * autorizada, e só o menu separava as duas.
   */
  knowledgeDocs: KnowledgeDoc[];
  /** OPENAI_API_KEY no servidor. Sem ela o upload responde 501. */
  knowledgeKeyConfigured: boolean;
  /** Agente atendendo agora (já foi ao ar E está ligado). */
  agentEnabled: boolean;
  /**
   * `agent_published_at` preenchido, ou seja, o agente JÁ FOI AO AR alguma vez.
   *
   * É o sinal que separa MONTAGEM de EDIÇÃO nesta tela, e foi escolhido por
   * eliminação: `agent_config_updated_at` é preenchido no PRIMEIRO save, e como a
   * pessoa salva várias vezes enquanto monta, o guia sumiria no meio da
   * montagem. `agent_published_at` é a primeira ativação e nunca é limpo, então
   * significa literalmente "esta pessoa já conectou, configurou, testou e ligou".
   * É o MESMO sinal que faz a barra de onboarding sumir, e é essa coincidência
   * que evita dois contadores de progresso na mesma página.
   */
  jaPublicou: boolean;
  /** O que falta para a primeira ativação (lib/onboarding.publishBlockers). */
  blockers: string[];
  /** /design: desativa o fetch de salvar. */
  preview?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [cfg, setCfg] = useState<AgentConfig>(
    initialConfig ??
      (prefillCompanyName
        ? { ...EMPTY_CONFIG, companyName: prefillCompanyName }
        : EMPTY_CONFIG)
  );
  // No modo avançado a textarea guarda SÓ a parte editável. O rabo da base
  // (precedência, quando chamar humano, anti-manipulação, OUTPUT) é recolado
  // pelo servidor a cada save, então mostrar ele como texto editável faria a
  // pessoa achar que pode mudar o contrato de saída.
  const inicial = stripBaseTail(initialPersona ?? "");
  const [rawPersona, setRawPersona] = useState<string>(inicial.head);
  // Seções da base que estavam escritas à mão na persona guardada. Se existirem,
  // a pessoa precisa saber que elas passaram a ser fixas ANTES de salvar, senão
  // o texto dela sumiria em silêncio no primeiro save.
  const [tailRemovido] = useState<string[]>(inicial.removed);
  // Grupo de notificação. Fica aqui, e não em cartão próprio, para existir um
  // único Salvar na tela; o save dispara os dois PUT.
  const [notifyJid, setNotifyJid] = useState<string>(initialNotifyJid ?? "");
  const [savedJid, setSavedJid] = useState<string>(initialNotifyJid ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Deixa de ter persona manual assim que o guiado salva com sucesso.
  const [hadManual, setHadManual] = useState(hasManualPersona);
  // Modal de confirmação de substituição do prompt manual.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Modelo por segmento escolhido, aguardando confirmação (substitui os campos).
  const [pendingPreset, setPendingPreset] = useState<AgentPreset | null>(null);

  // Dois sub-blocos recolhem: são os mais altos da tela E são "configura uma vez
  // e esquece". Recolhidos, mostram o VALOR na própria linha do cabeçalho, então
  // quem volta para conferir o horário lê sem abrir, o que é melhor que antes,
  // quando precisava rolar até o bloco.
  //
  // Regra que os torna seguros: **vazio começa aberto**, senão a primeira
  // configuração nunca acharia o campo.
  //
  // Não existe regra de "abre com erro de validação" porque não existe erro que
  // caia neles: `validateConfig` só reprova companyName, companyWhat, agentName e
  // goals, e os quatro estão em bloco sempre aberto. Escrever a regra aqui seria
  // código morto fingindo proteção.
  // Guia da primeira montagem. Ele muda a VOZ da tela, nunca a estrutura: nada é
  // escondido, nada trava, nada desmonta, a rolagem continua sendo uma só.
  //
  // Por que não virou wizard nem abas, com número: os três grupos medem 517, 1008
  // e 733px numa área visível de 874px. Um wizard de três passos entregaria um
  // passo de 0,6 tela, um de 1,2 e um de 0,85, então o passo do meio continuaria
  // rolando: cobraria o preço sem resolver o problema. E trocar de grupo hoje
  // custa ZERO, porque tudo vive em dois `useState` e ninguém desmonta; passo de
  // verdade torna isso maior que zero e reintroduz o bug do rascunho de lista.
  const [guiaDispensado, setGuiaDispensado] = useState(false);
  const montando = mode === "guiado" && !jaPublicou && !guiaDispensado;
  // A bancada de teste é oferecida duas vezes na montagem: no cabeçalho e no
  // rodapé, depois do primeiro save. Uma instância só, controlada daqui.
  const [bancadaAberta, setBancadaAberta] = useState(false);

  const [horarioAberto, setHorarioAberto] = useState(
    () => renderHours(cfg.hours) === ""
  );
  const [limitesAberto, setLimitesAberto] = useState(
    () => cfg.dontDo.length === 0 && cfg.escalateWhen.length === 0
  );

  // Rascunhos ainda não adicionados nas listas (regras). Ficam num ref para
  // serem incorporados ao salvar, mesmo que o cliente esqueça de clicar "Adicionar".
  const draftsRef = useRef<{ dontDo: string; escalateWhen: string }>({
    dontDo: "",
    escalateWhen: "",
  });

  // O Salvar virou rodapé grudado, então quem aperta ele pode estar a duas telas
  // do topo, onde o erro aparece. Sem trazer o aviso para a vista, a pessoa
  // clicaria em Salvar e nada pareceria acontecer.
  const errorRef = useRef<HTMLDivElement>(null);

  const guidedPersona = useMemo(() => buildPersona(cfg), [cfg]);
  // No avançado o preview mostra o resultado REAL (texto dele mais o rabo da
  // base), que é o que o n8n vai ler. Mostrar só o texto dele esconderia
  // metade do prompt.
  const advancedPersona = useMemo(
    () => buildAdvancedPersona(rawPersona, { handoffNotice: cfg.handoffNotice }),
    [rawPersona, cfg.handoffNotice]
  );
  const previewPersona = mode === "guiado" ? guidedPersona : advancedPersona;
  const baseTail = useMemo(
    () => buildBaseTail({ handoffNotice: cfg.handoffNotice }),
    [cfg.handoffNotice]
  );

  function patch(p: Partial<AgentConfig>) {
    setCfg((c) => ({ ...c, ...p }));
  }

  // Incorpora rascunhos pendentes das listas de regras à config.
  function withPendingDrafts(base: AgentConfig): AgentConfig {
    const commit = (arr: string[], draft: string) => {
      const v = draft.trim();
      return v && !arr.includes(v) ? [...arr, v.slice(0, LIMITS.bullet)] : arr;
    };
    return {
      ...base,
      dontDo: commit(base.dontDo, draftsRef.current.dontDo),
      escalateWhen: commit(base.escalateWhen, draftsRef.current.escalateWhen),
    };
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "avancado") {
      // Nada se perde: leva o prompt compilado para a textarea. SEM o rabo da
      // base, senão ele apareceria duas vezes (uma editável e uma no bloco fixo)
      // e o save o removeria de volta, dando impressão de perda.
      setRawPersona((r) => r || stripBaseTail(guidedPersona).head);
    }
    setError(null);
    setMode(next);
  }

  // O formulário já tem conteúdo relevante? (para confirmar antes de aplicar um
  // modelo, que substitui os campos).
  //
  // Inclui endereço, site e observação de horário de propósito: quem ajustava
  // esses campos antes de escrever "o que a empresa faz" recebia o modelo SEM
  // confirmação nenhuma, e perdia aquilo em silêncio.
  function formHasContent(): boolean {
    return (
      cfg.companyWhat.trim() !== "" ||
      cfg.details.trim() !== "" ||
      cfg.dontDo.length > 0 ||
      cfg.escalateWhen.length > 0 ||
      cfg.companyAddress.trim() !== "" ||
      cfg.companySite.trim() !== "" ||
      cfg.hoursNote.trim() !== ""
    );
  }

  // Aplica um modelo por segmento: substitui o COMPORTAMENTO (tom, objetivos,
  // regras, detalhes) pelo esqueleto do segmento.
  //
  // Dado do cliente NÃO entra nisso: nome, endereço, site e horário são dele, e
  // não do segmento. Antes o spread de `p.config` (que é EMPTY_CONFIG mais seis
  // campos) zerava horário, endereço, site e o aviso de handoff, e devolvia
  // `neverAdmitAi` ao default. Um preset não tem opinião sobre o horário de
  // ninguém.
  function applyPreset(p: AgentPreset) {
    setCfg((c) => ({
      ...p.config,
      companyName: c.companyName,
      agentName: c.agentName,
      agentRole: c.agentRole,
      companyAddress: c.companyAddress,
      companySite: c.companySite,
      hours: c.hours,
      hoursNote: c.hoursNote,
      handoffNotice: c.handoffNotice,
      neverAdmitAi: c.neverAdmitAi,
    }));
    draftsRef.current = { dontDo: "", escalateWhen: "" };
    setFields({});
    setError(null);
  }

  function choosePreset(p: AgentPreset) {
    if (formHasContent()) setPendingPreset(p);
    else applyPreset(p);
  }

  // Mostra o erro E leva ele para a vista. O `setTimeout(0)` espera o React
  // pintar o banner: no momento da chamada `errorRef` ainda é nulo, porque o
  // banner só existe quando `error` deixa de ser nulo.
  function falhar(msg: string, campos?: Record<string, string>) {
    setError(msg);
    if (campos) setFields(campos);
    setSaving(false);
    setTimeout(
      () => errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }),
      0
    );
  }

  async function save(confirmOverwrite = false) {
    if (preview) return;
    setSaving(true);
    setError(null);
    setFields({});

    // Incorpora rascunhos pendentes antes de montar o payload (e reflete na UI).
    let cfgToSave = cfg;
    if (mode === "guiado") {
      cfgToSave = withPendingDrafts(cfg);
      if (cfgToSave !== cfg) setCfg(cfgToSave);
      draftsRef.current = { dontDo: "", escalateWhen: "" };
    }

    try {
      const payload =
        mode === "guiado"
          ? { mode, config: cfgToSave, confirmOverwrite }
          : { mode, persona: rawPersona };
      const res = await fetch(`/api/clients/${clientId}/agent-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        fields?: Record<string, string>;
      };
      if (res.status === 409) {
        // Prompt manual existente → confirma via modal (não window.confirm).
        setSaving(false);
        setConfirmOpen(true);
        return;
      }
      if (!res.ok) {
        falhar(data.error ?? "Falha ao salvar.", data.fields);
        return;
      }
      // O save do horário à parte (mode "horario") saiu junto com a seção de
      // Horário do modo avançado. O endpoint continua existindo e funcionando,
      // só não tem mais chamador na interface.

      // Grupo de notificação, só quando mudou. Vai DEPOIS do prompt porque é o
      // menos importante dos dois: se falhar, a configuração do agente já está
      // salva e a tela mantém o que a pessoa digitou, com o erro explicando o
      // que não foi.
      if (notifyJid.trim() !== savedJid.trim()) {
        const resJid = await fetch(`/api/clients/${clientId}/notify-target`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jid: notifyJid }),
        });
        const dataJid = (await resJid.json()) as {
          error?: string;
          jid?: string | null;
        };
        if (!resJid.ok) {
          falhar(dataJid.error ?? "O agente foi salvo, mas o grupo de avisos não.");
          return;
        }
        const proximo = dataJid.jid ?? "";
        setSavedJid(proximo);
        setNotifyJid(proximo);
      }

      setSavedAt(
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
      if (mode === "guiado") setHadManual(false);
      setSaving(false);
      // Sem router.refresh(): a persona já vale no n8n na hora, e a tela mantém
      // o que o cliente preencheu (recarregar poderia dar impressão de perda).
    } catch {
      falhar("Não foi possível contatar o servidor.");
    }
  }

  const agendarSemGrupo =
    cfg.goals.includes("agendar") && notifyJid.trim() === "";

  // Estado de cada grupo na montagem. Só existe onde há campo OBRIGATÓRIO, e
  // `validateConfig` reprova exatamente quatro: companyName, companyWhat e
  // agentName (grupo 1) e goals (grupo 3).
  //
  // ⚠️ O grupo 2 NÃO tem estado, e essa assimetria é o motivo de isto não ser um
  // stepper com bolinha de completude: ele não tem um único campo obrigatório,
  // então a bolinha dele nunca ficaria verde e o desenho quebraria. O rótulo dele
  // diz a verdade em vez de fingir progresso: "opcional, e é o que mais melhora
  // as respostas".
  const faltamNoQuem = [cfg.companyName, cfg.companyWhat, cfg.agentName].filter(
    (v) => v.trim() === ""
  ).length;
  const estadoQuem = !montando
    ? undefined
    : faltamNoQuem === 0
      ? "pronto"
      : faltamNoQuem === 1
        ? "falta 1"
        : `faltam ${faltamNoQuem}`;
  const estadoPode = !montando
    ? undefined
    : cfg.goals.length === 0
      ? "falta escolher um objetivo"
      : "pronto";

  // Persona curta demais para o cache de prompt da OpenAI pegar. Interessa ao
  // dono porque é custo: a persona vai inteira em TODA mensagem, e sem cache cada
  // turno paga o preço cheio de entrada. Só aparece quando o risco existe.
  //
  // Saiu do topo da tela e virou aviso DEBAIXO de "Detalhes do negócio", que é o
  // único campo que o resolve. Como banner de topo, ele passou a ficar a 200px da
  // caixa de enviar documento, e a inferência natural (errada) era que mandar um
  // arquivo consertaria: documento entra por retrieval, DEPOIS da persona, então
  // não faz parte do prefixo que o cache reaproveita.
  const semCache = foraDoCache(previewPersona);

  // Valor resumido dos blocos recolhidos. Só a primeira parte do horário: a linha
  // "Não atende" é ruído numa linha de cabeçalho.
  const resumoHorario = useMemo(() => {
    const linhas = renderHours(cfg.hours)
      .split("\n")
      .filter((l) => l !== "" && !l.startsWith("- Não atende"));
    if (linhas.length === 0) return "Nenhum horário definido";
    return linhas.map((l) => l.replace(/^- /, "")).join("; ");
  }, [cfg.hours]);

  const resumoLimites = useMemo(() => {
    const a = cfg.dontDo.length;
    const b = cfg.escalateWhen.length;
    if (a === 0 && b === 0) return "Nada definido";
    const partes: string[] = [];
    if (a > 0) partes.push(`${a} limite${a === 1 ? "" : "s"}`);
    if (b > 0) partes.push(`${b} caso${b === 1 ? "" : "s"} de chamar o time`);
    return partes.join(", ");
  }, [cfg.dontDo.length, cfg.escalateWhen.length]);

  // O que a bancada vai testar: o estado do formulário, CRU. Compilar aqui e
  // mandar a persona pronta deixaria o browser decidir o prompt final, e o rabo
  // invariante da base é justamente o que não pode depender do browser.
  const configuracao: ConfiguracaoEmEdicao =
    mode === "guiado"
      ? { mode: "guiado", config: cfg }
      : { mode: "avancado", persona: rawPersona, handoffNotice: cfg.handoffNotice };

  // Carrega uma versão antiga do drawer no formulário. NÃO salva: a pessoa
  // confere e aperta Salvar. O spread sobre EMPTY_CONFIG completa campos que não
  // existiam quando aquela versão foi gravada (handoffNotice, por exemplo).
  function restaurar(v: {
    config: AgentConfig | null;
    persona: string;
    mode: Mode;
  }) {
    setError(null);
    setFields({});
    if (v.mode === "guiado" && v.config) {
      setCfg({ ...EMPTY_CONFIG, ...v.config });
      setMode("guiado");
    } else {
      setRawPersona(v.persona);
      setMode("avancado");
    }
  }

  return (
    // Sem altura travada: quem rola é a página (o cartão de /agente). Este
    // componente só cresce com o conteúdo.
    <div className="flex flex-col gap-4">
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

        {/* O cabeçalho fala só do que está no ar. Salvar desceu para o rodapé,
            junto do fim do formulário, que é onde a pessoa termina de mexer. */}
        <div className="flex items-center gap-2">
          {/* Testar vem antes de ver o prompt: é o que a pessoa quer fazer
              depois de mexer nos campos. O prompt é conferência. */}
          <AgentTestDrawer
            configuracao={configuracao}
            stageNames={stageNames}
            aberto={bancadaAberta}
            onAbertoChange={setBancadaAberta}
          />
          <AgentPromptDrawer persona={previewPersona} onRestore={restaurar} />
          <AgentPowerToggle
            clientId={clientId}
            enabled={agentEnabled}
            blocked={blockers.length > 0}
          />
        </div>
      </div>

      {/* Falta passo para a primeira ativação. Era um cartão inteiro; virou uma
          linha, porque a informação é curta e o lugar de resolver é outra tela. */}
      {blockers.length > 0 && !agentEnabled && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
          <TriangleAlert size={15} className="shrink-0" />
          <span>Antes de ativar o agente, falta: {blockers.join(", ")}.</span>
          {/* Sem link para "testar": a bancada é o botão logo acima, nesta
              mesma tela. Mandar a pessoa para outra rota era o que existia
              quando o playground era tela própria. */}
        </div>
      )}

      {/* Alternador de modo. Era um par de <button> sem role nenhum; virou uma
          lista de abas de verdade, com navegação por seta. */}
      <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
        <TabsList variant="segmentado">
          <TabsTrigger variant="segmentado" value="guiado">
            <Sparkles size={14} /> Guiado
          </TabsTrigger>
          <TabsTrigger variant="segmentado" value="avancado">
            <Code2 size={14} /> Avançado
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Banners. O aviso do grupo de avisos NÃO mora mais aqui: ele descreve um
          problema cuja solução é um campo desta mesma tela, e no topo ficava a
          600px do campo, sem apontar para ele. Agora é uma linha embaixo do
          próprio campo. */}
      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink"
        >
          {error}
        </div>
      )}
      {hadManual && mode === "guiado" && (
        <Banner>
          Este agente tem um prompt escrito à mão. Salvar pelo formulário guiado
          vai substituí-lo (o sistema pede confirmação).
        </Banner>
      )}
      {/* O aviso de cache saiu daqui: ver o comentário em `semCache`. Ele agora
          mora embaixo de "Detalhes do negócio", o campo que o resolve. */}

      {/* UMA coluna de seções, com colunas DENTRO delas.
          As duas colunas anteriores eram no nível da SEÇÃO, e isso quebrava em
          1024px: `Par` usa `sm:`, que é breakpoint de viewport e não de
          container, então dentro de uma coluna de 348px o campo de regra caía
          para 34px de largura e as 7 linhas de horário perdiam 26px. O vazio à
          direita que motivou aquela mudança não vinha de "uma coluna": vinha de
          campo de 40px esticado em 972px, e o remédio para isso é três campos
          por linha, não partir a página no meio. */}
      <div className="flex">
        {mode === "guiado" ? (
          <div className="min-w-0 flex-1 space-y-6">
            {/* Três grupos com NOME, na ordem em que se pensa sobre um
                funcionário novo (quem é você, o que você sabe, o que você pode
                fazer). É o nível de hierarquia que faltava: as seis seções
                antigas tinham peso tipográfico idêntico, então nada mandava em
                nada.
                Teve um índice de âncoras aqui, e SAIU (decisão do dono, 26/08):
                com três grupos de nome curto, ele repetia na horizontal o que os
                títulos já dizem 40px abaixo. Os `id` das seções ficam, porque
                custam nada e servem para link direto. */}
            {/* ACOMPANHANTE: só na primeira montagem, e só no modo guiado.
                Aparece por cima da tela e some para sempre quando o agente vai ao
                ar (`jaPublicou`). NÃO tem contador: "2 de 3" aqui viveria dentro
                do passo "2 de 4" da barra de onboarding, que é a mesma página.
                Os dois nascem e morrem pelo MESMO sinal, então existe um contador
                só na conta inteira. */}
            {montando && (
              <div className="rounded-xl border border-brand-line bg-brand-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-titulo">Vamos montar seu atendente</h2>
                    <p className="mt-1 text-apoio text-ink-2">
                      São três partes, uns cinco minutos. Nada vai ao ar até você
                      ativar o agente lá em cima.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setGuiaDispensado(true)}
                    className="shrink-0"
                  >
                    Já sei o que estou fazendo
                  </Button>
                </div>
                {/* Os presets sobem para CÁ na montagem: é o único momento em que
                    "comece de um modelo" é a primeira coisa a fazer. No modo
                    edição eles seguem no pé do grupo 1, onde foram parar em
                    26/08, porque lá são ação destrutiva e não convite. */}
                <div className="mt-4 border-t border-brand-line pt-4">
                  <p className="mb-2 flex items-center gap-2 text-apoio font-medium">
                    <LayoutTemplate size={15} className="shrink-0 text-brand-ink" />
                    Comece de um modelo do seu segmento
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {AGENT_PRESETS.map((p) => (
                      <Button
                        key={p.id}
                        variant="outline"
                        title={p.description}
                        onClick={() => choosePreset(p)}
                        className="rounded-full"
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Secao
              id="grupo-quem"
              title="Quem atende"
              numero={montando ? 1 : undefined}
              estado={estadoQuem}
              continuarPara={montando ? "grupo-sabe" : undefined}
            >
              <Trio>
                <Field label="Nome da empresa" error={fields.companyName} required>
                  <Input
                    value={cfg.companyName}
                    onChange={(e) => patch({ companyName: e.target.value })}
                  />
                  <Hint>
                    Esse é o nome que o agente usa nas conversas; não muda o nome
                    da sua conta.
                  </Hint>
                </Field>
                <Field label="Site">
                  <Input
                    value={cfg.companySite}
                    onChange={(e) => patch({ companySite: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Endereço">
                  <Input
                    value={cfg.companyAddress}
                    onChange={(e) => patch({ companyAddress: e.target.value })}
                  />
                </Field>
              </Trio>
              <Field label="O que a empresa faz" error={fields.companyWhat} required>
                <Textarea
                  value={cfg.companyWhat}
                  onChange={(e) => patch({ companyWhat: e.target.value })}
                  rows={2}
                  placeholder="Ex.: é uma clínica odontológica no centro de..."
                  className="resize-none"
                />
              </Field>
              <Par>
                <Field label="Nome do agente" error={fields.agentName} required>
                  <Input
                    value={cfg.agentName}
                    onChange={(e) => patch({ agentName: e.target.value })}
                    placeholder="Ex.: Alê"
                  />
                </Field>
                <Field label="Função (opcional)">
                  <Input
                    value={cfg.agentRole}
                    onChange={(e) => patch({ agentRole: e.target.value })}
                    placeholder="Ex.: atendente, consultora"
                  />
                </Field>
              </Par>
              <Field label="Tom de voz">
                <div className="flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <Button
                      key={t.value}
                      variant="outline"
                      onClick={() => patch({ tone: t.value as Tone })}
                      aria-pressed={cfg.tone === t.value}
                      className={`rounded-full ${
                        cfg.tone === t.value
                          ? "border-brand-line bg-brand-surface text-brand-ink"
                          : ""
                      }`}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </Field>

              {/* O modelo desceu do topo para o pé deste grupo. Ele importa por
                  30 segundos na vida da conta, e como faixa permanente de
                  largura cheia ocupava o lugar mais clicável da tela oferecendo
                  uma ação que SUBSTITUI campos. Continua sendo pílula, mas agora
                  depois de uma linha, e não antes de tudo.
                  Na MONTAGEM ele não aparece aqui: subiu para o bloco de
                  abertura, onde é convite em vez de risco. */}
              <div
                className={`flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 ${
                  montando ? "hidden" : "flex"
                }`}
              >
                <div className="flex items-center gap-2 text-legenda text-ink-3">
                  <LayoutTemplate size={15} className="shrink-0 text-brand-ink" />
                  <span>
                    Não sabe o que escrever? Comece de um modelo do seu segmento e
                    ajuste depois.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {AGENT_PRESETS.map((p) => (
                    <Button
                      key={p.id}
                      variant="outline"
                      title={p.description}
                      onClick={() => choosePreset(p)}
                      className="rounded-full"
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            </Secao>

            <Secao
              id="grupo-sabe"
              title="O que ele sabe"
              numero={montando ? 2 : undefined}
              estado={
                montando ? "opcional, e é o que mais melhora as respostas" : undefined
              }
              continuarPara={montando ? "grupo-pode" : undefined}
            >
              {/* Subiu para o começo do grupo, e é o bloco mais alto da tela:
                  é o campo que mais muda a qualidade da resposta e o único que
                  resolve o aviso de cache de prompt. Antes era o ÚLTIMO bloco da
                  página, e nunca aparecia na primeira tela. */}
              <Field label="Detalhes do negócio">
                <Hint>
                  O agente sabe isto de cor, e vale em toda conversa. Produtos,
                  serviços, perguntas frequentes, promoções: escreva livremente.
                </Hint>
                <Textarea
                  value={cfg.details}
                  onChange={(e) =>
                    patch({ details: e.target.value.slice(0, LIMITS.details) })
                  }
                  rows={8}
                  className="resize-none"
                />
                <div className="text-right text-legenda tabular-nums text-ink-3">
                  {cfg.details.length}/{LIMITS.details}
                </div>
                {semCache && (
                  <AvisoCache tokens={estimarTokens(previewPersona)}>
                    Detalhar mais aqui deixa o agente melhor e mais barato ao mesmo
                    tempo. Documento enviado abaixo não resolve isto: ele entra por
                    consulta, depois do prompt.
                  </AvisoCache>
                )}
              </Field>

              {/* A base de conhecimento passou a morar AQUI (26/08/2026), e o
                  argumento é o código, não navegação: a seção FONTES E HONESTIDADE
                  do prompt lista "detalhes do negócio" e os trechos da base na
                  MESMA frase, como o que o agente pode afirmar. O dono tinha que
                  descobrir sozinho que metade dessa lista se configura aqui e a
                  outra metade em outra tela do menu.
                  Versão compacta de propósito: a área de arraste do
                  KnowledgeManager tem `py-8` e sozinha somaria uns 400px a uma
                  tela que já é longa. Ela vive no painel lateral. */}
              <div className="border-t border-line pt-4">
                <KnowledgeManager
                  clientId={clientId}
                  initialDocs={knowledgeDocs}
                  keyConfigured={knowledgeKeyConfigured}
                  apresentacao="bloco"
                  preview={preview}
                />
              </div>

              {/* Horário em largura cheia: as 7 linhas cabem, e a observação vai
                  ao lado em vez de embaixo. Em meia coluna o rótulo do dia
                  (`w-32`) mais os dois campos de hora somavam 347px num espaço
                  de 314, e a linha era cortada. */}
              <Recolhivel
                titulo="Horário de atendimento"
                resumo={resumoHorario}
                aberto={horarioAberto}
                onToggle={() => setHorarioAberto((v) => !v)}
              >
                <p className="mb-3 text-legenda text-ink-3">
                  O agente informa esse horário, mas não sabe a data e a hora
                  atual, então ele nunca diz se está aberto ou fechado agora.
                </p>
                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
                  <AgentHoursEditor
                    value={cfg.hours}
                    onChange={(v) => patch({ hours: v })}
                  />
                  <Field label="Observação de horário">
                    <Input
                      value={cfg.hoursNote}
                      onChange={(e) => patch({ hoursNote: e.target.value })}
                      placeholder="Ex.: fechado em feriados"
                    />
                  </Field>
                </div>
              </Recolhivel>
            </Secao>

            <Secao
              id="grupo-pode"
              title="O que ele pode fazer"
              numero={montando ? 3 : undefined}
              estado={estadoPode}
            >
              {/* Objetivos SEM pintura. Eram três cartões em `bg-brand-surface`,
                  cerca de 204px do elemento de maior contraste do corpo da tela,
                  para a escolha menos disputada do formulário: ela já vem com
                  default e quase ninguém mexe. Linha quieta de caixa de marcar
                  diz a mesma coisa sem roubar a atenção do que importa. */}
              <Field label="Objetivos" error={fields.goals} required>
                <div className="grid gap-1 sm:grid-cols-3">
                  {GOALS.map((g) => {
                    const active = cfg.goals.includes(g.value as Goal);
                    return (
                      // <label> com Checkbox de verdade, e não um <button> com
                      // um quadrado desenhado dentro: a caixa aqui é caixa de
                      // marcar, e o leitor de tela precisa saber disso.
                      <label
                        key={g.value}
                        className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--active-bg)]"
                      >
                        <Checkbox
                          checked={active}
                          onCheckedChange={(v) =>
                            patch({
                              goals:
                                v === true
                                  ? [...cfg.goals, g.value as Goal]
                                  : cfg.goals.filter((x) => x !== g.value),
                            })
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-apoio font-medium">
                            {g.label}
                          </span>
                          <span className="block text-legenda text-ink-3">
                            {g.hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </Field>

              {/* O grupo de avisos aparece só com "Agendar" marcado: é o único
                  objetivo que depende dele. Fora daí seria um campo técnico
                  (um JID) pedido sem motivo na primeira configuração. E o aviso
                  de que ele está vazio mora AQUI, embaixo do campo que resolve,
                  em vez de no topo da tela. */}
              {cfg.goals.includes("agendar") && (
                <Field label="Grupo de WhatsApp para avisar">
                  <div className="flex items-center gap-2">
                    <Bell size={15} className="shrink-0 text-brand-ink" />
                    <Input
                      value={notifyJid}
                      onChange={(e) => setNotifyJid(e.target.value)}
                      placeholder="120363000000000000@g.us"
                      className="flex-1 font-mono"
                    />
                  </div>
                  {agendarSemGrupo ? (
                    <p className="flex items-start gap-1.5 text-legenda text-warn-ink">
                      <AlertTriangle size={14} className="mt-px shrink-0" />
                      <span>
                        Sem este grupo o agente não consegue avisar o time, e
                        marcar uma conversa não vai funcionar. Peça o JID do grupo
                        a quem cuida da automação.
                      </span>
                    </p>
                  ) : (
                    <Hint>
                      Quando o agente marca uma conversa com o time, ele avisa
                      neste grupo.
                    </Hint>
                  )}
                </Field>
              )}

              {/* Listas em largura cheia. Estavam num `Par` dentro de uma coluna
                  de 348px, e o campo ficava com 34px para um placeholder de 41
                  caracteres. O próprio comentário do `Par` já dizia a regra: só
                  para campo CURTO.
                  ⚠️ `manterMontado` NÃO é preferência: `AgentBulletList` guarda o
                  rascunho não adicionado num ref do pai (`onDraftChange`), e
                  `withPendingDrafts` o incorpora no Salvar. Se o bloco
                  desmontasse ao recolher, o texto visível sumiria da tela mas
                  continuaria sendo salvo, que é pior que perder. */}
              <Recolhivel
                titulo="Limites e quando chamar o time"
                resumo={resumoLimites}
                aberto={limitesAberto}
                onToggle={() => setLimitesAberto((v) => !v)}
                manterMontado
              >
                <div className="space-y-4">
                <Field label="O que o agente NÃO deve fazer">
                  <AgentBulletList
                    value={cfg.dontDo}
                    onChange={(v) => patch({ dontDo: v })}
                    onDraftChange={(v) => (draftsRef.current.dontDo = v)}
                    placeholder="Ex.: nunca dar desconto por conta própria"
                    maxLen={LIMITS.bullet}
                  />
                </Field>
                <Field label="Quando chamar um humano">
                  <AgentBulletList
                    value={cfg.escalateWhen}
                    onChange={(v) => patch({ escalateWhen: v })}
                    onDraftChange={(v) => (draftsRef.current.escalateWhen = v)}
                    placeholder="Ex.: quando pedirem orçamento fechado"
                    maxLen={LIMITS.bullet}
                  />
                </Field>
                <Field label="O que avisar ao passar para o time">
                  <Input
                    value={cfg.handoffNotice}
                    onChange={(e) =>
                      patch({
                        handoffNotice: e.target.value.slice(0, LIMITS.handoffNotice),
                      })
                    }
                    placeholder={DEFAULT_HANDOFF_NOTICE}
                  />
                  <Hint>
                    É a base da frase, não a frase pronta: o agente adapta ao que
                    a pessoa acabou de pedir (por exemplo &quot;vou verificar se
                    tem horário pra hoje&quot;). Em branco, ele usa a frase acima.
                  </Hint>
                </Field>
                  <label className="flex cursor-pointer items-center gap-2 text-apoio">
                    <Checkbox
                      checked={cfg.neverAdmitAi}
                      onCheckedChange={(v) => patch({ neverAdmitAi: v === true })}
                    />
                    Nunca admitir que é uma IA
                  </label>
                </div>
              </Recolhivel>
            </Secao>
          </div>
        ) : (
          <div className="min-w-0 flex-1 space-y-5">
            {/* Horário SAIU do avançado (22/08/2026, decisão do dono). O motivo é
                coerência: nome da empresa também é dado da empresa e nunca esteve
                aqui, então ter só o horário confundia mais do que ajudava. No
                avançado o tenant escreve o horário no próprio prompt se quiser, e
                deixar sem nada é aceitável.
                Consequência assumida: tenant avançado não alimenta o número de
                "fora do horário" do /painel. O custo hoje é zero, porque o único
                tenant avançado (OBM) tem agent_config nulo e nunca teve horário. */}
            <Secao title="Prompt (modo avançado)">
              <p className="-mt-1 mb-2 text-legenda text-ink-3">
                Escreva o prompt do jeito que quiser. As quatro seções do fim são
                fixas e vêm depois do seu texto, para o contrato de saída nunca
                quebrar e para você receber melhorias nossas sem reescrever nada.
              </p>

              {/* Aviso, e não apagamento silencioso: se a persona guardada tinha
                  seções que agora são fixas, o texto delas sai no primeiro save.
                  A pessoa precisa saber ANTES de clicar em Salvar. */}
              {tailRemovido.length > 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>
                    Seu prompt tinha estas seções escritas à mão, e elas passaram
                    a ser fixas: <strong>{tailRemovido.join(", ")}</strong>. O
                    conteúdo que você tinha nelas <strong>não será salvo</strong>.
                    Se tiver algo ali que você quer manter, mova para o texto
                    acima antes de salvar.
                  </span>
                </div>
              )}

              <Textarea
                value={rawPersona}
                onChange={(e) => setRawPersona(e.target.value)}
                rows={22}
                className="resize-none font-mono text-legenda leading-[19px]"
              />
              <div className="mt-1 text-right text-legenda tabular-nums text-ink-3">
                {rawPersona.length.toLocaleString("pt-BR")} caracteres
              </div>

              {/* O aviso de cache também vive AQUI, e não só no guiado. Ele saiu
                  do topo da tela para ficar junto do campo que o resolve, e no
                  avançado esse campo é a própria textarea. Na prática é o único
                  modo em que o aviso dispara: o esqueleto vazio do guiado já dá
                  cerca de 2.146 tokens. Deixar só no guiado teria matado o aviso
                  exatamente onde ele serve. */}
              {semCache && (
                <div className="mt-2">
                  <AvisoCache tokens={estimarTokens(previewPersona)}>
                    Escrever mais contexto no prompt deixa o agente melhor e mais
                    barato ao mesmo tempo.
                  </AvisoCache>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-rotulo uppercase text-ink-3">
                  <Lock size={13} />
                  Fixo, sempre no fim do seu prompt
                </div>
                <pre className="max-h-64 overflow-y-auto rounded-xl border border-line bg-[var(--input-bg)] p-3.5 font-sans text-legenda leading-[19px] break-words whitespace-pre-wrap text-ink-3">
                  {baseTail}
                </pre>
              </div>
            </Secao>
          </div>
        )}

      </div>

      {/* Rodapé GRUDADO no fim do cartão. Salvar mora aqui, e não no cabeçalho,
          porque é onde a pessoa termina de mexer; mas o formulário tem 2,6 telas
          de altura, e um Salvar estático ficava a 1.862px de rolagem: voltar para
          trocar um campo custava rolar até o fim para confirmar.
          Salvar JÁ É publicar (o n8n lê clients.persona ao vivo), e a frase ao
          lado existe para isso não ser surpresa; cada save vira uma versão no
          histórico do drawer, que é de onde se volta atrás.
          ⚠️ O `-mx-6` sangra até a borda do cartão, mas o padding de BAIXO do
          cartão foi removido (`px-6 pt-6` nas duas páginas que montam esta tela)
          em vez de cancelado com `-mb-6`. O motivo é medido: `bottom: 0` cola no
          fim da CONTENT BOX do container de rolagem, então com `pb-6` no cartão a
          faixa parava 24px acima do fim e dava para ver conteúdo passando por
          baixo dela. Quem dá o respiro de baixo agora é o `py-3` daqui. */}
      <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line bg-conteudo px-6 py-3">
        {/* ⚠️ A frase depende de `jaPublicou`, e isso é CORREÇÃO, não estilo.
            "Salvar já publica no WhatsApp" era dito a todo mundo, mas
            `lib/agent-turn.ts` devolve turno silencioso quando
            `agent_published_at` é nulo: antes da primeira ativação, salvar NÃO
            publica nada. A tela assustava o cliente final exatamente no momento
            em que ele está mais inseguro, escrevendo o nome da empresa. */}
        <span className="mr-auto text-legenda text-ink-3">
          {jaPublicou
            ? "Salvar já publica no WhatsApp."
            : "Ainda não vai ao ar: o agente só começa a responder quando você ativar."}
        </span>
        {savedAt && (
          <span className="text-legenda text-ink-3">Salvo às {savedAt}</span>
        )}
        {/* Depois do primeiro save da montagem, o rodapé entrega a pessoa ao
            passo seguinte do onboarding (testar), que é um botão desta mesma
            tela. É a barra de onboarding continuando aqui dentro, em vez de
            largar a pessoa em quase três telas de formulário. */}
        {!jaPublicou && savedAt && (
          <Button variant="outline" size="field" onClick={() => setBancadaAberta(true)}>
            <FlaskConical size={15} />
            Agora teste a conversa
          </Button>
        )}
        <Button size="field" onClick={() => save()} disabled={saving}>
          <Save size={15} />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <ConfirmModal
        aberto={confirmOpen}
        title="Substituir o prompt?"
        body="Este agente tem um prompt escrito à mão. Salvar pelo formulário guiado vai substituí-lo. Essa ação não pode ser desfeita."
        confirmLabel="Substituir"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          save(true);
        }}
      />

      <ConfirmModal
        aberto={pendingPreset !== null}
        title={`Aplicar o modelo ${pendingPreset?.label ?? ""}?`}
        body="Isso substitui tom, objetivos, regras e detalhes pelo esqueleto do segmento. Nome, endereço, site e horário são mantidos."
        confirmLabel="Aplicar modelo"
        onCancel={() => setPendingPreset(null)}
        onConfirm={() => {
          if (pendingPreset) applyPreset(pendingPreset);
          setPendingPreset(null);
        }}
      />
    </div>
  );
}

function ConfirmModal({
  aberto,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  aberto: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent tamanho="confirmacao">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={18} className="text-warn-ink" />
          <DialogTitle>{title}</DialogTitle>
        </div>
        <DialogDescription className="mb-5">{body}</DialogDescription>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="field" className="px-4">
              Cancelar
            </Button>
          </DialogClose>
          <Button size="field" className="px-4" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// —————————————————— helpers de UI ——————————————————
//
// `inputCls`, `textareaCls`, `ModeButton` e `Check12` moravam aqui. Os dois
// primeiros viraram `Input`/`Textarea` da base, o terceiro virou a variante
// `segmentado` do `Tabs` e o quarto sumiu junto com a caixa de marcar
// desenhada à mão, que agora é `Checkbox`.

/**
 * Bloco com título. Chamava-se `Card`, e o nome foi trocado quando a base
 * ganhou o seu: são coisas diferentes. `Card` é a moldura da PÁGINA; este é um
 * bloco DENTRO dela, e por isso usa `bg-bloco`, a superfície de quem mora
 * dentro. Com `bg-surface` ele tinha a mesma cor do pai no tema escuro.
 */
function Secao({
  id,
  title,
  numero,
  estado,
  continuarPara,
  children,
}: {
  id?: string;
  title: string;
  /**
   * Ordem de leitura na primeira montagem. É NUMERAL de ordem, não de progresso:
   * a palavra "passo" não aparece de propósito, porque neste produto "passo" já
   * significa "travado até o anterior terminar" (é assim que a barra de
   * onboarding funciona), e estes grupos não travam nem devem.
   * Fica dentro do próprio `h2`, e não numa trilha à esquerda: trilha repetiria
   * na horizontal o que o título diz.
   */
  numero?: number;
  /** "faltam 2", "pronto", "opcional". Ausente = não diz nada. */
  estado?: string;
  /** `id` do próximo grupo. Só rola até lá; não avança nada, não trava nada. */
  continuarPara?: string;
  children: React.ReactNode;
}) {
  return (
    // `scroll-mt-2` para o título não encostar na borda de cima do cartão, que é
    // o container de rolagem.
    <section
      id={id}
      className="scroll-mt-2 rounded-xl border border-line bg-bloco p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-baseline gap-2 text-corpo font-semibold">
          {numero != null && (
            <span className="text-legenda tabular-nums text-ink-3">{numero}</span>
          )}
          {title}
        </h2>
        {estado && <span className="text-legenda text-ink-3">{estado}</span>}
      </div>
      <div className="space-y-4">{children}</div>
      {continuarPara && (
        <div className="mt-4 flex justify-end border-t border-line pt-3">
          <Button
            variant="outline"
            onClick={() =>
              document
                .getElementById(continuarPara)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            Continuar
            <ChevronDown size={14} />
          </Button>
        </div>
      )}
    </section>
  );
}

// O helper `SubTitulo` existiu por uma versão e saiu quando os dois sub-blocos
// que ele rotulava passaram a recolher: o `Recolhivel` abaixo já desenha o
// próprio `<h3>`. Ele usava `text-rotulo`, que é o degrau que dá os três níveis
// da tela (título da página, título do grupo, rótulo do sub-bloco) sem inventar
// um sétimo papel tipográfico.

/**
 * Sub-bloco que recolhe, mostrando o VALOR na linha do cabeçalho quando fechado.
 * É a regra que torna o recolhimento um ganho e não uma escondida: quem volta
 * para conferir o horário lê "Segunda a sexta: 08:00 às 18:00" sem abrir nada.
 *
 * Sem `<details>` e sem accordion novo na base: `<button aria-expanded>` mais
 * render condicional é o padrão que a casa já usa no `OnboardingBar`. Sem
 * transição no ícone, porque animação aqui é CSS da casa e um `rotate` em
 * transição é exatamente a armadilha do Tailwind v4 documentada no CLAUDE.md.
 */
function Recolhivel({
  titulo,
  resumo,
  aberto,
  onToggle,
  manterMontado = false,
  children,
}: {
  titulo: string;
  resumo: string;
  aberto: boolean;
  onToggle: () => void;
  /**
   * Esconde por CSS em vez de desmontar. Existe para bloco que tem estado
   * interno não salvo (ver o aviso no bloco de limites).
   */
  manterMontado?: boolean;
  children: React.ReactNode;
}) {
  const Icone = aberto ? ChevronDown : ChevronRight;
  return (
    <div className="border-t border-line pt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 text-left"
      >
        <Icone size={14} className="shrink-0 text-ink-faint" />
        <h3 className="shrink-0 text-rotulo uppercase text-ink-3">{titulo}</h3>
        {!aberto && (
          <span className="min-w-0 truncate text-legenda text-ink-2">{resumo}</span>
        )}
        <span className="ml-auto shrink-0 text-legenda text-ink-3">
          {aberto ? "fechar" : "abrir"}
        </span>
      </button>
      {manterMontado ? (
        <div className={aberto ? "mt-3" : "hidden"}>{children}</div>
      ) : (
        aberto && <div className="mt-3">{children}</div>
      )}
    </div>
  );
}

/**
 * Dois campos lado a lado, empilhando em tela estreita. Só para campo CURTO:
 * textarea e lista continuam inteiros.
 *
 * ⚠️ O prefixo é breakpoint de VIEWPORT, não de container. Este helper só é
 * seguro dentro de uma seção de largura cheia; foi por estar dentro de uma
 * coluna de 348px que o campo das regras colapsou para 34px em 1024px.
 *
 * Divide a partir de `lg` (1024px), e não de `sm`: medido em 768px, duas colunas
 * dão 210px por campo, que é estreito demais para um nome de empresa.
 */
function Par({ children }: { children: React.ReactNode }) {
  return <div className="grid items-start gap-4 lg:grid-cols-2">{children}</div>;
}

/**
 * Três campos curtos por linha, mas só a partir de `xl` (1280px). Em 1024px três
 * colunas dão 217px cada, então ali ele vira duas de 336px. Mesma ressalva do
 * `Par` sobre o prefixo ser de viewport.
 */
function Trio({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-apoio font-medium">
        {label}
        {required && <span className="text-danger-ink">*</span>}
      </label>
      {children}
      {error && <p className="text-legenda text-danger-ink">{error}</p>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-legenda text-ink-3">{children}</p>;
}

/**
 * Aviso de que a persona é curta demais para o cache de prompt pegar. Fica
 * colado no campo que o resolve, e por isso existe nos dois modos: no guiado é
 * "Detalhes do negócio", no avançado é a própria textarea.
 *
 * O limiar é `CACHE_SAFE_TOKENS` (2.048) e não o piso de 1.024 de propósito:
 * `gpt-5.4-mini` cai na faixa em que a OpenAI diz que o mínimo varia de 1.024 a
 * 2.048 e o cache é inconsistente pouco acima do piso. Prometer economia que não
 * vem é pior que avisar de um risco que não se concretizou.
 */
function AvisoCache({
  tokens,
  children,
}: {
  tokens: number;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-1.5 text-legenda text-warn-ink">
      <AlertTriangle size={14} className="mt-px shrink-0" />
      <span>
        O prompt tem cerca de {tokens.toLocaleString("pt-BR")} tokens, abaixo dos{" "}
        {CACHE_SAFE_TOKENS.toLocaleString("pt-BR")} que a OpenAI pede para
        reaproveitar o prompt entre mensagens, então cada resposta paga o preço
        cheio de entrada. {children}
      </span>
    </p>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
