"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  customFieldsToList,
  listToCustomFields,
  type CustomField,
} from "@/lib/crm";

// "Dados": nome de exibição (display_name, precede o pushName do WhatsApp) e
// campos personalizados (custom_fields jsonb). Escrita direta na dados_cliente
// (grant de coluna). Só quando a linha do contato existe.
//
// Edição NO LUGAR: cada linha é o próprio campo, e grava quando perde o foco.
// O modo anterior era um botão "Editar" que trocava a lista inteira por um
// formulário com Cancelar e Salvar, ou seja, três cliques para corrigir uma
// letra.
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
  const [name, setName] = useState(initialDisplayName ?? "");
  const [fields, setFields] = useState<CustomField[]>(
    customFieldsToList(initialCustomFields)
  );
  const [status, setStatus] = useState<"idle" | "salvando" | "salvo" | "erro">(
    "idle"
  );

  // O que já está no banco, para não gravar a cada foco perdido sem mudança.
  const gravado = useRef(
    marca(initialDisplayName ?? "", customFieldsToList(initialCustomFields))
  );

  if (!editable) return null;

  function setField(i: number, patch: Partial<CustomField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function salvar(nome: string, lista: CustomField[]) {
    const atual = marca(nome, lista);
    if (atual === gravado.current) return;
    setStatus("salvando");
    const { error } = await supabase
      .from("dados_cliente")
      .update({
        display_name: nome.trim() || null,
        custom_fields: listToCustomFields(lista),
      })
      .eq("telefone", phone);
    if (error) {
      setStatus("erro");
      return;
    }
    gravado.current = atual;
    setStatus("salvo");
    router.refresh(); // re-resolve o nome no cabeçalho e na lista
  }

  function remover(i: number) {
    const lista = fields.filter((_, idx) => idx !== i);
    setFields(lista);
    void salvar(name, lista);
  }

  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-legenda font-semibold uppercase tracking-[0.08em] text-ink-3">
          Dados
        </span>
        {status !== "idle" && (
          <span
            className={`ml-auto text-legenda ${
              status === "erro" ? "text-danger" : "text-ink-3"
            }`}
          >
            {status === "salvando"
              ? "salvando"
              : status === "salvo"
                ? "salvo"
                : "não deu para salvar"}
          </span>
        )}
      </div>

      <Linha
        rotulo="Nome"
        valor={name}
        placeholder="Como você chama este contato"
        onChange={setName}
        onCommit={() => void salvar(name, fields)}
      />

      {fields.map((f, i) => (
        <Linha
          key={i}
          rotulo={f.key}
          rotuloEditavel
          onRotulo={(v) => setField(i, { key: v })}
          valor={f.value}
          placeholder="Não informado"
          onChange={(v) => setField(i, { value: v })}
          onCommit={() => void salvar(name, fields)}
          onRemover={() => remover(i)}
        />
      ))}

      <button
        type="button"
        onClick={() => setFields((f) => [...f, { key: "", value: "" }])}
        className="mt-1 flex h-[var(--h-chrome)] shrink-0 items-center gap-1 self-start rounded-lg px-2 text-legenda font-semibold text-brand-ink transition-colors hover:bg-[var(--active-bg)]"
      >
        <Plus size={13} /> Adicionar campo
      </button>
    </div>
  );
}

// Assinatura do que de fato vai para o banco (chave vazia é descartada por
// listToCustomFields, então uma linha em branco recém-criada não conta).
function marca(nome: string, lista: CustomField[]): string {
  return JSON.stringify([nome.trim(), listToCustomFields(lista)]);
}

function Linha({
  rotulo,
  rotuloEditavel,
  onRotulo,
  valor,
  placeholder,
  onChange,
  onCommit,
  onRemover,
}: {
  rotulo: string;
  rotuloEditavel?: boolean;
  onRotulo?: (v: string) => void;
  valor: string;
  placeholder: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onRemover?: () => void;
}) {
  return (
    <div className="group -mx-1.5 flex items-baseline gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--active-bg)]">
      {rotuloEditavel ? (
        <input
          value={rotulo}
          onChange={(e) => onRotulo?.(e.target.value)}
          onBlur={onCommit}
          placeholder="Campo"
          aria-label="Nome do campo"
          className="w-[92px] shrink-0 rounded bg-transparent text-legenda text-ink-3 placeholder:text-ink-3 focus:bg-[var(--active-bg)]"
        />
      ) : (
        <span className="w-[92px] shrink-0 text-legenda text-ink-3">
          {rotulo}
        </span>
      )}
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder={placeholder}
        aria-label={rotulo || "Valor do campo"}
        className="min-w-0 flex-1 rounded bg-transparent text-apoio font-medium text-ink placeholder:font-normal placeholder:text-ink-3 focus:bg-[var(--active-bg)]"
      />
      {onRemover ? (
        <button
          type="button"
          onClick={onRemover}
          aria-label="Remover campo"
          className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
        >
          <X size={13} />
        </button>
      ) : (
        <Pencil
          size={13}
          aria-hidden
          className="shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </div>
  );
}
