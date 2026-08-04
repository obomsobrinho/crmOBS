"use client";

import { MessageCircle, User, UserCheck } from "lucide-react";
import { prettyPhone, phoneDigits } from "@/lib/format";
import { initials, avatarColor } from "@/lib/inbox";
import { memberName, memberInitials, type Member } from "@/lib/team";
import ContactTags from "./ContactTags";
import ContactNotes from "./ContactNotes";
import ContactFields from "./ContactFields";
import AiSummary from "./AiSummary";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ContextPanel({
  name,
  phone,
  iaState,
  onToggleIa,
  firstMessageAt,
  messageCount,
  assignedUserId,
  members,
  myUserId,
  onAssign,
  conversationId,
  clientId,
  editableName,
  customFields,
  contactExists,
}: {
  name: string | null;
  phone: string;
  iaState: string | null;
  onToggleIa: () => void;
  firstMessageAt: string | null;
  messageCount: number;
  assignedUserId: string | null;
  members: Member[];
  myUserId: string;
  onAssign: (userId: string | null) => void;
  conversationId: number | null;
  clientId: string;
  editableName: string | null;
  customFields: Record<string, unknown> | null;
  contactExists: boolean;
}) {
  const displayName = name || prettyPhone(phone);
  const ini = initials(name);
  const paused = iaState === "pause";
  const number = prettyPhone(phone);
  const attendant = assignedUserId
    ? members.find((m) => m.userId === assignedUserId) ?? null
    : null;
  const mineAssigned = assignedUserId === myUserId;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: avatarColor(phone) }}
          >
            {ini ?? <User size={16} />}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{displayName}</div>
            <div className="text-[12px] text-ink-muted">Contato</div>
          </div>
        </div>
        <a
          href={`https://wa.me/${phoneDigits(phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-send mt-3 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition"
        >
          <MessageCircle size={14} />
          Abrir no WhatsApp
        </a>
      </div>

      <ContactTags conversationId={conversationId} clientId={clientId} />

      <Section title="Status da IA">
        <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2.5 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${paused ? "bg-warn" : "bg-accent"}`}
          />
          <span className={paused ? "text-warn" : "text-accent"}>
            {paused ? "Pausada · você atende" : "Ativa · IA respondendo"}
          </span>
        </div>
        <button
          onClick={onToggleIa}
          className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink"
        >
          {paused ? "Reativar IA" : "Assumir (pausar IA)"}
        </button>
      </Section>

      <AiSummary phone={phone} clientId={clientId} />

      <Section title="Atendimento">
        <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2.5 text-sm">
          {attendant ? (
            <>
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: avatarColor(attendant.email) }}
              >
                {memberInitials(attendant.email).slice(0, 1)}
              </div>
              <span className="min-w-0 truncate">
                {mineAssigned ? "Você está atendendo" : memberName(attendant.email)}
              </span>
            </>
          ) : (
            <>
              <UserCheck size={15} className="shrink-0 text-ink-dim" />
              <span className="text-ink-muted">Ninguém assumiu ainda</span>
            </>
          )}
        </div>

        {mineAssigned ? (
          <button
            onClick={() => onAssign(null)}
            className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--active-bg)] hover:text-ink"
          >
            Soltar conversa
          </button>
        ) : (
          <button
            onClick={() => onAssign(myUserId)}
            className="btn-primary mt-2 w-full rounded-lg px-3 py-2 text-sm font-medium transition"
          >
            Assumir conversa
          </button>
        )}

        {members.length > 1 && (
          <label className="mt-2 block">
            <span className="sr-only">Transferir atendimento</span>
            <select
              value={assignedUserId ?? ""}
              onChange={(e) => onAssign(e.target.value || null)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-line-strong"
            >
              <option value="">Sem atendente</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {memberName(m.email)}
                  {m.userId === myUserId ? " (você)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </Section>

      <ContactNotes
        conversationId={conversationId}
        clientId={clientId}
        myUserId={myUserId}
        members={members}
      />

      <ContactFields
        phone={phone}
        initialDisplayName={editableName}
        initialCustomFields={customFields}
        editable={contactExists}
      />

      <Section title="Dados">
        <Row label="Telefone" value={number} />
        <Row label="Primeira mensagem" value={fmtDate(firstMessageAt)} />
        <Row label="Mensagens" value={String(messageCount)} />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-dim">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="text-[11px] uppercase tracking-wide text-ink-dim">
        {label}
      </div>
      <div className="text-[13.5px] font-medium">{value}</div>
    </div>
  );
}
