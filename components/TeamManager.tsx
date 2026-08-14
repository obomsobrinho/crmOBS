"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Trash2,
  ShieldCheck,
  User,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMembers,
  memberName,
  memberInitials,
  roleLabel,
  type Member,
} from "@/lib/team";
import { avatarPair } from "@/lib/inbox";

// Gestão de equipe: dono convida por e-mail, define papel e remove membros.
// Atendente vê a lista mas não age. Writes vão por /api/team/* (service_role);
// aqui só o gate visual, o servidor reforça o papel.
export default function TeamManager({
  initialMembers,
  myRole,
  myUserId,
  preview = false,
}: {
  initialMembers: Member[];
  myRole: string | null;
  myUserId: string;
  /** No /design (sem login) simula as ações em memória. */
  preview?: boolean;
}) {
  const router = useRouter();
  const isOwner = myRole === "dono";
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"atendente" | "dono">("atendente");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const [toRemove, setToRemove] = useState<Member | null>(null);

  async function refresh() {
    if (preview) return;
    const next = await fetchMembers(createClient());
    if (next.length) setMembers(next);
    router.refresh();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const mail = email.trim().toLowerCase();
    if (!mail) return;
    if (preview) {
      setMembers((m) => [...m, { userId: crypto.randomUUID(), email: mail, role }]);
      setMsg({ kind: "ok", text: `Convite simulado para ${mail}.` });
      setEmail("");
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail, role }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ kind: "err", text: data.error ?? "falha ao enviar o convite" });
        return;
      }
      setMsg({ kind: "ok", text: `Convite enviado para ${mail}.` });
      setEmail("");
      await refresh();
    } finally {
      setInviting(false);
    }
  }

  async function remove(m: Member) {
    setToRemove(null);
    setMsg(null);
    if (preview) {
      setMembers((list) => list.filter((x) => x.userId !== m.userId));
      return;
    }
    const res = await fetch("/api/team/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: m.userId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setMsg({ kind: "err", text: data.error ?? "falha ao remover o membro" });
      return;
    }
    await refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      {isOwner && (
        <form
          onSubmit={invite}
          className="rounded-xl border border-line bg-surface p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserPlus size={16} className="text-accent" />
            Convidar por e-mail
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@empresa.com"
              aria-label="E-mail do convidado"
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "atendente" | "dono")}
              aria-label="Papel do convidado"
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
            >
              <option value="atendente">Atendente</option>
              <option value="dono">Dono</option>
            </select>
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              className="btn-primary shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60"
            >
              {inviting ? "Enviando…" : "Convidar"}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-dim">
            A pessoa recebe um link por e-mail para definir a própria senha e entrar.
          </p>
          {msg && (
            <p
              className={`mt-2 text-sm ${
                msg.kind === "ok" ? "text-ia" : "text-danger"
              }`}
            >
              {msg.text}
            </p>
          )}
        </form>
      )}

      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Membros
          </span>
          <span className="text-[11px] text-ink-dim">{members.length}</span>
        </div>
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {members.map((m, i) => {
            const isSelf = m.userId === myUserId;
            const owner = m.role === "dono";
            return (
              <li
                key={m.userId}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={avatarPair(m.email)}
                >
                  {memberInitials(m.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium capitalize">
                      {memberName(m.email)}
                    </span>
                    {isSelf && (
                      <span className="shrink-0 rounded-full bg-[var(--active-bg)] px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                        você
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-ink-dim">{m.email}</div>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    owner
                      ? "bg-[var(--selected-bg)] text-accent"
                      : "bg-[var(--active-bg)] text-ink-muted"
                  }`}
                >
                  {owner && <ShieldCheck size={12} />}
                  {roleLabel(m.role)}
                </span>
                {isOwner && !isSelf && (
                  <button
                    type="button"
                    onClick={() => setToRemove(m)}
                    aria-label={`Remover ${memberName(m.email)}`}
                    title="Remover do time"
                    className="shrink-0 rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-[var(--danger-bg)] hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!isOwner && (
          <p className="mt-2 text-xs text-ink-dim">
            <User size={12} className="mr-1 inline" />
            Só o dono da conta pode convidar ou remover membros.
          </p>
        )}
      </div>

      {toRemove && (
        <ConfirmRemove
          member={toRemove}
          onCancel={() => setToRemove(null)}
          onConfirm={() => remove(toRemove)}
        />
      )}
    </div>
  );
}

function ConfirmRemove({
  member,
  onCancel,
  onConfirm,
}: {
  member: Member;
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
          <h3 className="font-display text-base font-bold">Remover do time?</h3>
        </div>
        <p className="mb-5 text-sm text-ink-muted">
          {memberName(member.email)} ({member.email}) perde o acesso a esta conta.
          O login continua existindo, mas sem ver as conversas deste tenant.
        </p>
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
            className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}
