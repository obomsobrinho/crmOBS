"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import {
  buildAdvancedPersona,
  buildBaseTail,
  buildPersona,
  stripBaseTail,
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
import AgentPromptDrawer from "./AgentPromptDrawer";
import AgentPowerToggle from "./AgentPowerToggle";
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
  agentEnabled,
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
  /** Agente atendendo agora (já foi ao ar E está ligado). */
  agentEnabled: boolean;
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
  // No modo avançado o horário é salvo à parte (mode "horario"), e só se a pessoa
  // encostou nele. Sem essa guarda, um save qualquer gravaria o DEFAULT_HOURS
  // como se fosse horário configurado, e o /painel passaria a contar
  // "atendimento fora do horário" em cima de um horário que ninguém escolheu.
  const [hoursTouched, setHoursTouched] = useState(false);
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

  // Rascunhos ainda não adicionados nas listas (regras). Ficam num ref para
  // serem incorporados ao salvar, mesmo que o cliente esqueça de clicar "Adicionar".
  const draftsRef = useRef<{ dontDo: string; escalateWhen: string }>({
    dontDo: "",
    escalateWhen: "",
  });

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
  function formHasContent(): boolean {
    return (
      cfg.companyWhat.trim() !== "" ||
      cfg.details.trim() !== "" ||
      cfg.dontDo.length > 0 ||
      cfg.escalateWhen.length > 0
    );
  }

  // Aplica um modelo por segmento. Preserva a identidade já digitada (nome da
  // empresa e do agente); substitui o resto pelo esqueleto do segmento.
  function applyPreset(p: AgentPreset) {
    setCfg((c) => ({
      ...p.config,
      companyName: c.companyName || p.config.companyName,
      agentName: c.agentName || p.config.agentName,
    }));
    draftsRef.current = { dontDo: "", escalateWhen: "" };
    setFields({});
    setError(null);
  }

  function choosePreset(p: AgentPreset) {
    if (formHasContent()) setPendingPreset(p);
    else applyPreset(p);
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
        setError(data.error ?? "Falha ao salvar.");
        if (data.fields) setFields(data.fields);
        setSaving(false);
        return;
      }
      // Horário no modo avançado: salvo à parte, porque o mode "avancado" só
      // grava a persona. Só quando a pessoa encostou no editor.
      if (mode === "avancado" && hoursTouched) {
        const resH = await fetch(`/api/clients/${clientId}/agent-config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "horario", hours: cfg.hours }),
        });
        if (!resH.ok) {
          setError("O prompt foi salvo, mas o horário não.");
          setSaving(false);
          return;
        }
        setHoursTouched(false);
      }

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
          setError(
            dataJid.error ?? "O agente foi salvo, mas o grupo de avisos não."
          );
          setSaving(false);
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
      setError("Não foi possível contatar o servidor.");
      setSaving(false);
    }
  }

  const agendarSemGrupo =
    cfg.goals.includes("agendar") && notifyJid.trim() === "";

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
          {!blockers.includes("testar a conversa na bancada") ? null : (
            <Link href="/playground" className="font-medium underline">
              Testar agora
            </Link>
          )}
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

      {/* Banners */}
      {error && (
        <div className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-apoio text-danger-ink">
          {error}
        </div>
      )}
      {agendarSemGrupo && (
        <Banner>
          Para o agente marcar conversas com o time é preciso um grupo de WhatsApp
          para notificar. Enquanto ele não estiver configurado, esse encaminhamento
          não vai funcionar.
        </Banner>
      )}
      {hadManual && mode === "guiado" && (
        <Banner>
          Este agente tem um prompt escrito à mão. Salvar pelo formulário guiado
          vai substituí-lo (o sistema pede confirmação).
        </Banner>
      )}

      {/* Colunas: form + preview */}
      {/* Uma coluna. O prompt gerado saiu daqui para o drawer, e o formulário
          ficou com a largura toda: campo curto em duas colunas, campo longo
          inteiro. Antes ele vivia numa faixa de ~400px ao lado do preview. */}
      <div className="flex">
        {mode === "guiado" ? (
          <div className="min-w-0 flex-1 space-y-5">
            <section className="rounded-xl border border-line bg-bloco p-4">
              <div className="mb-1 flex items-center gap-2">
                <LayoutTemplate size={15} className="text-brand-ink" />
                <h2 className="text-corpo font-semibold">Começar de um modelo</h2>
              </div>
              <p className="mb-3 text-legenda text-ink-3">
                Escolha o segmento mais próximo do seu negócio para preencher tom,
                objetivos e regras. Depois é só ajustar. O nome da empresa e do
                agente que você já digitou são mantidos.
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
            </section>

            <Secao title="Empresa">
              {/* Campo curto em duas colunas, campo longo inteiro. Antes era tudo
                  empilhado porque o formulário vivia numa faixa de ~400px ao
                  lado do preview; agora tem a largura da tela. */}
              <Par>
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
              </Par>
              <Field label="O que a empresa faz" error={fields.companyWhat} required>
                <Textarea
                  value={cfg.companyWhat}
                  onChange={(e) => patch({ companyWhat: e.target.value })}
                  rows={2}
                  placeholder="Ex.: é uma clínica odontológica no centro de..."
                  className="resize-none"
                />
              </Field>
              <Field label="Endereço">
                <Input
                  value={cfg.companyAddress}
                  onChange={(e) => patch({ companyAddress: e.target.value })}
                />
              </Field>
            </Secao>

            <Secao title="Horário de atendimento">
              <p className="-mt-1 mb-3 text-legenda text-ink-3">
                O agente informa esse horário, mas não sabe a data e a hora atual,
                então ele nunca diz se está aberto ou fechado agora.
              </p>
              <AgentHoursEditor
                value={cfg.hours}
                onChange={(v) => patch({ hours: v })}
              />
              <div className="mt-3">
                <Field label="Observação de horário">
                  <Input
                    value={cfg.hoursNote}
                    onChange={(e) => patch({ hoursNote: e.target.value })}
                    placeholder="Ex.: fechado em feriados"
                  />
                </Field>
              </div>
            </Secao>

            <Secao title="Agente">
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
              <Field label="Objetivos" error={fields.goals} required>
                <div className="space-y-1.5">
                  {GOALS.map((g) => {
                    const active = cfg.goals.includes(g.value as Goal);
                    return (
                      // <label> com Checkbox de verdade, e não um <button> com
                      // um quadrado desenhado dentro: a caixa aqui é caixa de
                      // marcar, e o leitor de tela precisa saber disso.
                      <label
                        key={g.value}
                        className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-brand-line bg-brand-surface"
                            : "border-line hover:bg-[var(--active-bg)]"
                        }`}
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
                  (um JID) pedido sem motivo na primeira configuração. */}
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
                  <Hint>
                    Quando o agente marca uma conversa com o time, ele avisa neste
                    grupo. Peça o JID do grupo a quem cuida da automação.
                  </Hint>
                </Field>
              )}

              <label className="flex cursor-pointer items-center gap-2 text-apoio">
                <Checkbox
                  checked={cfg.neverAdmitAi}
                  onCheckedChange={(v) => patch({ neverAdmitAi: v === true })}
                />
                Nunca admitir que é uma IA
              </label>
            </Secao>

            <Secao title="Regras">
              <Par>
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
              </Par>
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
                <p className="text-legenda text-ink-3">
                  É a base da frase, não a frase pronta: o agente adapta ao que a
                  pessoa acabou de pedir (por exemplo &quot;vou verificar se tem
                  horário pra hoje&quot;). Em branco, ele usa a frase acima.
                </p>
              </Field>
            </Secao>

            <Secao title="Detalhes do negócio">
              <p className="-mt-1 mb-2 text-legenda text-ink-3">
                Produtos, serviços, perguntas frequentes, promoções: tudo que o
                agente precisa saber para responder. Escreva livremente.
              </p>
              <Textarea
                value={cfg.details}
                onChange={(e) =>
                  patch({ details: e.target.value.slice(0, LIMITS.details) })
                }
                rows={8}
                className="resize-none"
              />
              <div className="mt-1 text-right text-legenda tabular-nums text-ink-3">
                {cfg.details.length}/{LIMITS.details}
              </div>
            </Secao>
          </div>
        ) : (
          <div className="min-w-0 flex-1 space-y-5">
            {/* Horário também no avançado. Antes era um cartão separado
                (AgentBusinessHours) que existia só porque a persona à mão não
                tem onde guardar horário, e sem horário o /painel não consegue
                contar atendimento fora do expediente. Aqui ele é seção como
                qualquer outra, e o save manda junto. */}
            <Secao title="Horário de atendimento">
              <p className="-mt-1 mb-3 text-legenda text-ink-3">
                É dado da empresa, não do prompt: fica salvo mesmo com o prompt
                escrito à mão, e alimenta os números do painel.
              </p>
              <AgentHoursEditor
                value={cfg.hours}
                onChange={(v) => {
                  setHoursTouched(true);
                  patch({ hours: v });
                }}
              />
            </Secao>

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

      {/* Rodapé. Salvar mora aqui, no fim do formulário, e não no cabeçalho:
          é onde a pessoa termina de mexer. Salvar JÁ É publicar (o n8n lê
          clients.persona ao vivo), então cada save vira uma versão no histórico
          do drawer, que é de onde se volta atrás. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {savedAt && (
          <span className="text-legenda text-ink-3">Salvo às {savedAt}</span>
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
        body="Isso substitui tom, objetivos, regras e detalhes pelo esqueleto do segmento. O nome da empresa e do agente são mantidos."
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
function Secao({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-bloco p-4">
      <h2 className="mb-3 text-corpo font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/**
 * Dois campos lado a lado, empilhando em tela estreita.
 *
 * Existe porque o prompt gerado saiu da coluna lateral e o formulário herdou a
 * largura toda. Antes, com ~400px, campo em duas colunas não caberia; agora
 * empilhar "Nome da empresa" e "Site" um debaixo do outro só faz a pessoa rolar
 * mais. Só para campo CURTO: textarea e lista continuam inteiros.
 */
function Par({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
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

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-apoio text-warn-ink">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
