"use client";

import { useState } from "react";
import { Bell, Save, AlertTriangle, Check } from "lucide-react";

// Configura o grupo de WhatsApp que recebe os avisos do agente (quando ele
// marca uma conversa com o time ou qualifica um lead). Só o dono vê e edita
// (a página /agente já é dono-only). O valor vai para clients.notify_group_jid.
export default function NotifyTargetCard({
  clientId,
  initialJid,
  preview = false,
}: {
  clientId: string;
  initialJid: string | null;
  /** /design: desativa o fetch de salvar. */
  preview?: boolean;
}) {
  const [jid, setJid] = useState(initialJid ?? "");
  const [saved, setSaved] = useState(initialJid ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const configured = saved.trim() !== "";
  const dirty = jid.trim() !== saved.trim();

  async function save() {
    if (preview) return;
    setSaving(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch(`/api/clients/${clientId}/notify-target`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid }),
      });
      const data = (await res.json()) as { error?: string; jid?: string | null };
      if (!res.ok) {
        setError(data.error ?? "Falha ao salvar.");
        setSaving(false);
        return;
      }
      const next = data.jid ?? "";
      setSaved(next);
      setJid(next);
      setOk(true);
      setSaving(false);
    } catch {
      setError("Não foi possível contatar o servidor.");
      setSaving(false);
    }
  }

  return (
    <section className="shrink-0 rounded-xl border border-line bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <Bell size={15} className="text-accent" />
        <h2 className="font-display text-sm font-bold">Notificações no WhatsApp</h2>
      </div>
      <p className="mb-3 text-xs text-ink-dim">
        Quando o agente marca uma conversa com o time ou qualifica um lead, ele
        avisa neste grupo de WhatsApp. Peça a quem cuida da automação o JID do
        grupo (algo como 120363000000000000@g.us).
      </p>

      {!configured && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Sem um grupo configurado, o encaminhamento de marcar conversa não avisa
            ninguém.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={jid}
          onChange={(e) => {
            setJid(e.target.value);
            setOk(false);
            setError(null);
          }}
          placeholder="120363000000000000@g.us"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[13px] outline-none transition-colors focus:border-line-strong"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="btn-primary flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60"
        >
          <Save size={15} />
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {ok && !error && (
        <p className="mt-2 flex items-center gap-1 text-xs text-ia">
          <Check size={13} />
          {configured ? "Grupo salvo." : "Destino removido."}
        </p>
      )}
    </section>
  );
}
