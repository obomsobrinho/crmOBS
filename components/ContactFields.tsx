"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  customFieldsToList,
  listToCustomFields,
  type CustomField,
} from "@/lib/crm";

// Edita o contato: nome de exibição (display_name, precede o pushName do
// WhatsApp) e campos personalizados (custom_fields jsonb). Escrita direta na
// dados_cliente (grant de coluna). Só quando a linha do contato existe.
export default function ContactFields({
  phone,
  initialDisplayName,
  initialCustomFields,
  editable,
}: {
  phone: string;
  initialDisplayName: string | null;
  initialCustomFields: Record<string, unknown> | null;
  editable: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialDisplayName ?? "");
  const [fields, setFields] = useState<CustomField[]>(
    customFieldsToList(initialCustomFields)
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!editable) return null;

  function setField(i: number, patch: Partial<CustomField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("dados_cliente")
      .update({
        display_name: name.trim() || null,
        custom_fields: listToCustomFields(fields),
      })
      .eq("telefone", phone);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setOpen(false);
      router.refresh(); // re-resolve o nome no cabeçalho e na lista
    }
  }

  const savedFields = customFieldsToList(initialCustomFields);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-dim">
          Contato
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <Pencil size={12} /> Editar
        </button>
      </div>

      {!open ? (
        savedFields.length > 0 ? (
          <div className="space-y-1.5">
            {savedFields.map((f) => (
              <div key={f.key}>
                <div className="text-[11px] uppercase tracking-wide text-ink-dim">
                  {f.key}
                </div>
                <div className="text-[13px] font-medium">{f.value || "-"}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-dim">
            {saved ? "Salvo." : "Sem campos personalizados."}
          </p>
        )
      ) : (
        <div className="rounded-lg border border-line bg-surface p-2.5">
          <label className="block">
            <span className="text-[11px] text-ink-dim">Nome de exibição</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como você chama este contato"
              className="mt-0.5 w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-line-strong"
            />
          </label>

          <div className="mt-2.5 text-[11px] text-ink-dim">Campos personalizados</div>
          <div className="mt-1 space-y-1.5">
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={f.key}
                  onChange={(e) => setField(i, { key: e.target.value })}
                  placeholder="Campo"
                  className="w-2/5 min-w-0 rounded-lg border border-line bg-canvas px-2 py-1.5 text-[12px] outline-none transition-colors focus:border-line-strong"
                />
                <input
                  value={f.value}
                  onChange={(e) => setField(i, { value: e.target.value })}
                  placeholder="Valor"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2 py-1.5 text-[12px] outline-none transition-colors focus:border-line-strong"
                />
                <button
                  type="button"
                  onClick={() => setFields((list) => list.filter((_, idx) => idx !== i))}
                  aria-label="Remover campo"
                  className="shrink-0 rounded p-1 text-ink-dim transition-colors hover:text-danger"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFields((f) => [...f, { key: "", value: "" }])}
            className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <Plus size={13} /> Campo
          </button>

          <div className="mt-2.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setName(initialDisplayName ?? "");
                setFields(customFieldsToList(initialCustomFields));
              }}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
