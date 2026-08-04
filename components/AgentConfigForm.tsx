"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Sparkles, Code2, AlertTriangle, LayoutTemplate } from "lucide-react";
import {
  buildPersona,
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
import AgentPromptPreview from "./AgentPromptPreview";

type Mode = "guiado" | "avancado";

export default function AgentConfigForm({
  clientId,
  instance,
  initialMode,
  initialConfig,
  initialPersona,
  prefillCompanyName,
  hasManualPersona,
  notifyGroupConfigured,
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
  notifyGroupConfigured: boolean;
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
  const [rawPersona, setRawPersona] = useState<string>(initialPersona ?? "");
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
  const previewPersona = mode === "guiado" ? guidedPersona : rawPersona;

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
      // Nada se perde: leva o prompt compilado para a textarea.
      setRawPersona((r) => r || guidedPersona);
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

  const agendarSemGrupo = cfg.goals.includes("agendar") && !notifyGroupConfigured;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-accent" />
            <h1 className="font-display text-xl font-bold">Agente de IA</h1>
          </div>
          <p className="text-sm text-ink-muted">
            Configure como o agente atende no WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-ink-dim">Salvo às {savedAt}</span>
          )}
          <button
            type="button"
            onClick={() => save()}
            disabled={saving}
            className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60"
          >
            <Save size={15} />
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {/* Alternador de modo */}
      <div className="flex w-fit gap-1 rounded-lg border border-line bg-[var(--input-bg)] p-1">
        <ModeButton
          active={mode === "guiado"}
          onClick={() => switchMode("guiado")}
          icon={<Sparkles size={14} />}
          label="Guiado"
        />
        <ModeButton
          active={mode === "avancado"}
          onClick={() => switchMode("avancado")}
          icon={<Code2 size={14} />}
          label="Avançado"
        />
      </div>

      {/* Banners */}
      {error && (
        <div className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-danger">
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
      <div className="flex min-h-0 flex-1 gap-4">
        {mode === "guiado" ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
            <section className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-1 flex items-center gap-2">
                <LayoutTemplate size={15} className="text-accent" />
                <h2 className="font-display text-sm font-bold">
                  Começar de um modelo
                </h2>
              </div>
              <p className="mb-3 text-xs text-ink-dim">
                Escolha o segmento mais próximo do seu negócio para preencher tom,
                objetivos e regras. Depois é só ajustar. O nome da empresa e do
                agente que você já digitou são mantidos.
              </p>
              <div className="flex flex-wrap gap-2">
                {AGENT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.description}
                    onClick={() => choosePreset(p)}
                    className="rounded-full border border-line px-3 py-1.5 text-[13px] font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-[var(--active-bg)] hover:text-ink"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </section>

            <Card title="Empresa">
              <Field label="Nome da empresa" error={fields.companyName} required>
                <input
                  value={cfg.companyName}
                  onChange={(e) => patch({ companyName: e.target.value })}
                  className={inputCls}
                />
                <Hint>Esse é o nome que o agente usa nas conversas; não muda o nome da sua conta.</Hint>
              </Field>
              <Field label="O que a empresa faz" error={fields.companyWhat} required>
                <textarea
                  value={cfg.companyWhat}
                  onChange={(e) => patch({ companyWhat: e.target.value })}
                  rows={2}
                  placeholder="Ex.: é uma clínica odontológica no centro de..."
                  className={textareaCls}
                />
              </Field>
              <Field label="Endereço">
                <input
                  value={cfg.companyAddress}
                  onChange={(e) => patch({ companyAddress: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Site">
                <input
                  value={cfg.companySite}
                  onChange={(e) => patch({ companySite: e.target.value })}
                  placeholder="https://…"
                  className={inputCls}
                />
              </Field>
            </Card>

            <Card title="Horário de atendimento">
              <p className="-mt-1 mb-3 text-xs text-ink-dim">
                O agente informa esse horário, mas não sabe a data e a hora atual,
                então ele nunca diz se está aberto ou fechado agora.
              </p>
              <AgentHoursEditor
                value={cfg.hours}
                onChange={(v) => patch({ hours: v })}
              />
              <div className="mt-3">
                <Field label="Observação de horário">
                  <input
                    value={cfg.hoursNote}
                    onChange={(e) => patch({ hoursNote: e.target.value })}
                    placeholder="Ex.: fechado em feriados"
                    className={inputCls}
                  />
                </Field>
              </div>
            </Card>

            <Card title="Agente">
              <Field label="Nome do agente" error={fields.agentName} required>
                <input
                  value={cfg.agentName}
                  onChange={(e) => patch({ agentName: e.target.value })}
                  placeholder="Ex.: Alê"
                  className={inputCls}
                />
              </Field>
              <Field label="Função (opcional)">
                <input
                  value={cfg.agentRole}
                  onChange={(e) => patch({ agentRole: e.target.value })}
                  placeholder="Ex.: atendente, consultora"
                  className={inputCls}
                />
              </Field>
              <Field label="Tom de voz">
                <div className="flex flex-wrap gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => patch({ tone: t.value as Tone })}
                      aria-pressed={cfg.tone === t.value}
                      className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        cfg.tone === t.value
                          ? "border-[var(--accent-border)] bg-[var(--accent-bg)] text-accent"
                          : "border-line text-ink-muted hover:bg-[var(--active-bg)] hover:text-ink"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Objetivos" error={fields.goals} required>
                <div className="space-y-1.5">
                  {GOALS.map((g) => {
                    const active = cfg.goals.includes(g.value as Goal);
                    return (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() =>
                          patch({
                            goals: active
                              ? cfg.goals.filter((x) => x !== g.value)
                              : [...cfg.goals, g.value as Goal],
                          })
                        }
                        aria-pressed={active}
                        className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-[var(--accent-border)] bg-[var(--accent-bg)]"
                            : "border-line hover:bg-[var(--active-bg)]"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            active
                              ? "border-accent bg-accent text-white"
                              : "border-line-strong"
                          }`}
                        >
                          {active && <Check12 />}
                        </span>
                        <span>
                          <span className="block text-sm font-medium">{g.label}</span>
                          <span className="block text-xs text-ink-dim">{g.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cfg.neverAdmitAi}
                  onChange={(e) => patch({ neverAdmitAi: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Nunca admitir que é uma IA
              </label>
            </Card>

            <Card title="Regras">
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
            </Card>

            <Card title="Detalhes do negócio">
              <p className="-mt-1 mb-2 text-xs text-ink-dim">
                Produtos, serviços, perguntas frequentes, promoções: tudo que o
                agente precisa saber para responder. Escreva livremente.
              </p>
              <textarea
                value={cfg.details}
                onChange={(e) =>
                  patch({ details: e.target.value.slice(0, LIMITS.details) })
                }
                rows={8}
                className={textareaCls}
              />
              <div className="mt-1 text-right text-[11px] text-ink-dim">
                {cfg.details.length}/{LIMITS.details}
              </div>
            </Card>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Card title="Prompt (modo avançado)">
              <p className="-mt-1 mb-2 text-xs text-ink-dim">
                Este é o texto exato usado pelo agente. Edite com cuidado, pois
                precisa manter o contrato de saída (messages/action) que o sistema
                espera.
              </p>
              <textarea
                value={rawPersona}
                onChange={(e) => setRawPersona(e.target.value)}
                rows={22}
                className={`${textareaCls} font-mono text-[12.5px] leading-[19px]`}
              />
              <div className="mt-1 text-right text-[11px] text-ink-dim">
                {rawPersona.length.toLocaleString("pt-BR")} caracteres
              </div>
            </Card>
          </div>
        )}

        {/* Preview */}
        <div className="hidden min-h-0 w-96 shrink-0 flex-col lg:flex">
          <AgentPromptPreview persona={previewPersona} />
        </div>
      </div>

      {confirmOpen && (
        <ConfirmModal
          title="Substituir o prompt?"
          body="Este agente tem um prompt escrito à mão. Salvar pelo formulário guiado vai substituí-lo. Essa ação não pode ser desfeita."
          confirmLabel="Substituir"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            save(true);
          }}
        />
      )}

      {pendingPreset && (
        <ConfirmModal
          title={`Aplicar o modelo ${pendingPreset.label}?`}
          body="Isso substitui tom, objetivos, regras e detalhes pelo esqueleto do segmento. O nome da empresa e do agente são mantidos."
          confirmLabel="Aplicar modelo"
          onCancel={() => setPendingPreset(null)}
          onConfirm={() => {
            applyPreset(pendingPreset);
            setPendingPreset(null);
          }}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-[var(--panel-shadow)]"
      >
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={18} className="text-warn" />
          <h3 className="font-display text-base font-bold">{title}</h3>
        </div>
        <p className="mb-5 text-sm text-ink-muted">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// —————————————————— helpers de UI ——————————————————

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong";
const textareaCls =
  "w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong";

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "brand-grad shadow-[var(--panel-shadow)]"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 font-display text-sm font-bold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
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
      <label className="flex items-center gap-1 text-sm font-medium">
        {label}
        {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-dim">{children}</p>;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Check12() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6.5l2.5 2.5 4.5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
