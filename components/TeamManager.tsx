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
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto">
      {isOwner && (
        // `bg-bloco` e não `bg-surface`: este formulário mora DENTRO do cartão
        // da página, e bloco é a superfície de quem mora dentro. Com a antiga,
        // no tema escuro ele tinha exatamente a cor do pai e só a borda o
        // separava do fundo.
        <form
          onSubmit={invite}
          className="rounded-xl border border-line bg-bloco p-4"
        >
          <div className="mb-3 flex items-center gap-2 text-apoio font-semibold">
            <UserPlus size={16} className="text-brand-ink" />
            Convidar por e-mail
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pessoa@empresa.com"
              aria-label="E-mail do convidado"
              className="flex-1"
            />
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "atendente" | "dono")}
            >
              <SelectTrigger size="field" aria-label="Papel do convidado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="atendente">Atendente</SelectItem>
                <SelectItem value="dono">Dono</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              size="field"
              disabled={inviting || !email.trim()}
              className="px-4"
            >
              {inviting ? "Enviando…" : "Convidar"}
            </Button>
          </div>
          <p className="mt-2 text-legenda text-ink-3">
            A pessoa recebe um link por e-mail para definir a própria senha e entrar.
          </p>
          {msg && (
            <p
              className={`mt-2 text-apoio ${
                msg.kind === "ok" ? "text-human-ink" : "text-danger-ink"
              }`}
            >
              {msg.text}
            </p>
          )}
        </form>
      )}

      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-rotulo uppercase text-ink-3">Membros</span>
          <span className="text-legenda tabular-nums text-ink-3">
            {members.length}
          </span>
        </div>
        <ul className="overflow-hidden rounded-xl border border-line bg-bloco">
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
                <Avatar size="md" style={avatarPair(m.email)}>
                  {memberInitials(m.email)}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-apoio font-medium capitalize">
                      {memberName(m.email)}
                    </span>
                    {isSelf && (
                      <span className="shrink-0 rounded-full bg-[var(--active-bg)] px-1.5 py-0.5 text-legenda text-ink-2">
                        você
                      </span>
                    )}
                  </div>
                  <div className="truncate text-legenda text-ink-3">{m.email}</div>
                </div>
                {/* Dono: par `surface`/`ink` da marca. Antes era um cinza neutro
                    de fundo com o `fill` roxo de tinta, que é exatamente o que a
                    regra dos quatro papéis proíbe. */}
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-legenda ${
                    owner
                      ? "bg-brand-surface text-brand-ink"
                      : "bg-[var(--active-bg)] text-ink-2"
                  }`}
                >
                  {owner && <ShieldCheck size={12} />}
                  {roleLabel(m.role)}
                </span>
                {isOwner && !isSelf && (
                  <Button
                    variant="danger-ghost"
                    size="icon-chrome"
                    onClick={() => setToRemove(m)}
                    aria-label={`Remover ${memberName(m.email)}`}
                    title="Remover do time"
                  >
                    <Trash2 size={15} />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {!isOwner && (
          <p className="mt-2 text-legenda text-ink-3">
            <User size={12} className="mr-1 inline" />
            Só o dono da conta pode convidar ou remover membros.
          </p>
        )}
      </div>

      <Dialog
        open={toRemove !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setToRemove(null);
        }}
      >
        {toRemove && (
          <DialogContent tamanho="confirmacao">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={18} className="text-warn-ink" />
              <DialogTitle>Remover do time?</DialogTitle>
            </div>
            <DialogDescription className="mb-5">
              {memberName(toRemove.email)} ({toRemove.email}) perde o acesso a esta
              conta. O login continua existindo, mas sem ver as conversas deste
              tenant.
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" size="field" className="px-4">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                variant="danger"
                size="field"
                className="px-4"
                onClick={() => remove(toRemove)}
              >
                Remover
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
