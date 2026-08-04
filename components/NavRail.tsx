"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessagesSquare,
  Bot,
  BookOpen,
  Users,
  User,
  Calendar,
  Megaphone,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";

const NAV: {
  href: string;
  label: string;
  icon: LucideIcon;
  donoOnly?: boolean;
}[] = [
  { href: "/inbox", label: "Conversas", icon: MessagesSquare },
  { href: "/agente", label: "Agente", icon: Bot, donoOnly: true },
  { href: "/conhecimento", label: "Conhecimento", icon: BookOpen, donoOnly: true },
  { href: "/equipe", label: "Equipe", icon: Users },
];

const SOON = [
  { label: "Agenda", icon: Calendar },
  { label: "Campanhas", icon: Megaphone },
];

export default function NavRail({
  clientName,
  activeHref,
  role,
}: {
  clientName: string;
  /** Só para o preview de design (/design): força o item ativo. */
  activeHref?: string;
  /** Papel do usuário: 'dono' | 'atendente'. Esconde itens só-do-dono. */
  role?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadConvos, setUnreadConvos] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("nav-collapsed") === "1");
    } catch {
      // sem persistência
    }
  }, []);

  // Contador de conversas não lidas no rail (realtime). O trigger mantém
  // conversations.unread_count; aqui só contamos as conversas com pendência.
  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .gt("unread_count", 0);
      setUnreadConvos(count ?? 0);
    };
    void load();
    const channel = supabase
      .channel("rail-unread")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Fecha o menu do usuário ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("nav-collapsed", next ? "1" : "0");
      } catch {
        // ignora
      }
      return next;
    });
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials = clientName.slice(0, 2).toUpperCase();
  const perfilActive = pathname.startsWith("/perfil");

  return (
    <nav
      className={`flex shrink-0 flex-col gap-1 rounded-xl border border-[var(--rail-border)] bg-[var(--rail-bg)] p-2 text-[var(--rail-fg)] shadow-[var(--panel-shadow)] ${
        collapsed ? "w-14 items-center" : "w-60"
      }`}
    >
      <div
        className={`flex items-center gap-2 px-1 pb-2 pt-1 ${
          collapsed ? "justify-center" : "justify-between"
        }`}
      >
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="brand-grad flex h-7 w-7 items-center justify-center rounded-lg font-display text-sm font-bold">
              D
            </div>
            <span className="font-display text-base font-bold tracking-tight">
              DeskCRM
            </span>
          </div>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="rounded-lg p-1.5 text-[var(--rail-fg-dim)] transition-colors hover:bg-[var(--rail-hover)] hover:text-[var(--rail-fg)]"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {NAV.map(({ href, label, icon: Icon, donoOnly }) => {
        // Item só-do-dono some para atendente (role definido e diferente de dono).
        if (donoOnly && role && role !== "dono") return null;
        const active = activeHref
          ? activeHref === href
          : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors ${
              collapsed ? "justify-center" : ""
            } ${
              active
                ? "bg-[var(--rail-active-bg)] font-semibold text-[var(--rail-active-fg)] shadow-[inset_2px_0_0_var(--accent)]"
                : "text-[var(--rail-fg-dim)] hover:bg-[var(--rail-hover)] hover:text-[var(--rail-fg)]"
            }`}
          >
            <Icon size={18} strokeWidth={2} className="shrink-0" />
            {!collapsed && <span className="flex-1">{label}</span>}
            {href === "/inbox" && unreadConvos > 0 && !collapsed && (
              <span className="brand-grad flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
                {unreadConvos > 99 ? "99+" : unreadConvos}
              </span>
            )}
            {href === "/inbox" && unreadConvos > 0 && collapsed && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--rail-bg)]" />
            )}
          </Link>
        );
      })}

      <div className="my-2 h-px w-full bg-[var(--rail-border)]" />
      {!collapsed && (
        <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--rail-fg-dim)]">
          Em breve
        </div>
      )}
      {SOON.map(({ label, icon: Icon }) => (
        <div
          key={label}
          title={collapsed ? `${label} (em breve)` : undefined}
          className={`flex cursor-not-allowed items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm text-[var(--rail-fg-dim)] opacity-55 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Icon size={18} strokeWidth={2} className="shrink-0" />
          {!collapsed && label}
        </div>
      ))}

      <div
        ref={menuRef}
        className="relative mt-auto flex w-full flex-col gap-1 border-t border-[var(--rail-border)] pt-2"
      >
        {menuOpen && (
          <div
            role="menu"
            className={`absolute bottom-full z-20 mb-2 w-48 overflow-hidden rounded-xl border border-[var(--rail-border)] bg-[var(--rail-bg)] p-1 shadow-lg ${
              collapsed ? "left-0" : "left-1 right-1 w-auto"
            }`}
          >
            <Link
              href="/perfil"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--rail-fg-dim)] transition-colors hover:bg-[var(--rail-hover)] hover:text-[var(--rail-fg)]"
            >
              <User size={16} /> Perfil
            </Link>
            <div className="px-1 py-0.5">
              <ThemeToggle />
            </div>
            <button
              onClick={logout}
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--rail-fg-dim)] transition-colors hover:bg-[var(--danger-bg)] hover:text-danger"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          title={collapsed ? clientName : undefined}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={`flex items-center gap-2 rounded-lg px-1 py-1.5 transition-colors hover:bg-[var(--rail-hover)] ${
            collapsed ? "justify-center" : ""
          } ${perfilActive || menuOpen ? "bg-[var(--rail-active-bg)]" : ""}`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--rail-hover)] text-xs font-medium text-[var(--rail-fg)] ring-1 ring-[var(--rail-border)]">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium text-[var(--rail-fg)]">
                  {clientName}
                </div>
                <div className="text-[11px] text-[var(--rail-fg-dim)]">
                  Ver perfil
                </div>
              </div>
              <ChevronUp size={15} className="shrink-0 text-[var(--rail-fg-dim)]" />
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
