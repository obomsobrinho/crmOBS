"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import BrandMark from "./BrandMark";
import { BRAND } from "@/lib/brand";
import {
  MessagesSquare,
  KanbanSquare,
  LayoutDashboard,
  Bot,
  BookOpen,
  FlaskConical,
  Users,
  User,
  Calendar,
  Megaphone,
  LogOut,
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
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/agente", label: "Agente", icon: Bot, donoOnly: true },
  { href: "/conhecimento", label: "Conhecimento", icon: BookOpen, donoOnly: true },
  { href: "/playground", label: "Playground", icon: FlaskConical, donoOnly: true },
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
  whatsappConnected = true,
}: {
  clientName: string;
  /** Só para o preview de design (/design): força o item ativo. */
  activeHref?: string;
  /** Papel do usuário: 'dono' | 'atendente'. Esconde itens só-do-dono. */
  role?: string;
  /** Estado do canal. Hoje chega sempre `true`: consultar a Evolution a cada
      navegação ficou para uma rodada própria, então a faixa existe e está no
      lugar certo, mas ainda não mede nada. */
  whatsappConnected?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadConvos, setUnreadConvos] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Restaura o menu recolhido depois de montar. Não dá para ler o localStorage
  // no estado inicial: o servidor não tem localStorage e o HTML sairia com um
  // menu e o cliente com outro. A regra do lint mira renderização em cascata;
  // aqui é leitura única de um sistema externo, que é o caso que o próprio
  // texto da regra permite.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      className={`flex shrink-0 flex-col gap-1 rounded-xl border border-line bg-menu p-2 shadow-[var(--panel-shadow)] transition-[width] duration-200 ease-[var(--ease-out)] ${
        collapsed ? "w-16 items-center" : "w-[212px]"
      }`}
    >
      {/* A própria marca recolhe e expande o menu. Antes havia um botão de seta
          só para isso, o que dava três alvos clicáveis num canto que trata de
          um assunto só. */}
      <button
        onClick={toggle}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        aria-expanded={!collapsed}
        className={`flex h-11 shrink-0 items-center rounded-lg text-left transition-colors hover:bg-[var(--rail-hover)] ${
          collapsed ? "w-11 justify-center" : "px-2"
        }`}
      >
        {collapsed ? <MarkOnly /> : <BrandMark size="sm" />}
      </button>

      {NAV.map(({ href, label, icon: Icon, donoOnly }) => {
        // Item só-do-dono some para atendente (role definido e diferente de dono).
        if (donoOnly && role && role !== "dono") return null;
        const active = activeHref
          ? activeHref === href
          : pathname === href || pathname.startsWith(href + "/");
        const unread = href === "/inbox" && unreadConvos > 0;
        return (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-current={active ? "page" : undefined}
            className={`relative flex h-10 shrink-0 items-center gap-3 rounded-lg text-corpo transition-colors ${
              collapsed ? "w-10 justify-center" : "px-3"
            } ${
              active
                ? "bg-[var(--rail-active-bg)] font-semibold text-ink shadow-[inset_2px_0_0_var(--sel-bar)]"
                : "text-ink-2 hover:bg-[var(--rail-hover)] hover:text-ink"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} className="shrink-0" />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
            {/* Expandido, pílula com o número; recolhido, só o ponto. A pílula
                encolhida virava um círculo escuro sem nada legível dentro. */}
            {unread && !collapsed && (
              <span className="ml-auto min-w-5 shrink-0 rounded-full bg-ink px-2 py-0.5 text-center text-legenda font-semibold tabular-nums text-[var(--s-menu)]">
                {unreadConvos > 99 ? "99+" : unreadConvos}
              </span>
            )}
            {unread && collapsed && (
              <span
                title={`${unreadConvos} conversas não lidas`}
                className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--s-menu)] bg-brand-ink"
              />
            )}
          </Link>
        );
      })}

      {SOON.map(({ label, icon: Icon }) => (
        <div
          key={label}
          title={`${label} (em breve)`}
          className={`flex h-10 shrink-0 cursor-not-allowed items-center gap-3 rounded-full text-corpo text-ink-3 opacity-60 ${
            collapsed ? "w-10 justify-center" : "px-3"
          }`}
        >
          <Icon size={18} strokeWidth={1.8} className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </div>
      ))}

      <div
        ref={menuRef}
        className="relative mt-auto flex w-full flex-col gap-2 pt-2"
      >
        {/* Estado do canal e tema. É o que decide se vale a pena escrever
            qualquer coisa agora, então fica sempre à vista, em vez de escondido
            atrás do avatar. Sem moldura e sem fundo: é um indicador, não um
            botão, e a caixa em volta prometia um clique que não existe. */}
        <div
          className={`flex h-9 items-center ${
            collapsed ? "w-full justify-center px-0" : "gap-2 px-1"
          }`}
          title={whatsappConnected ? "WhatsApp conectado" : "WhatsApp desconectado"}
        >
          <span
            aria-hidden
            className={`h-2 w-2 shrink-0 rounded-full ${
              whatsappConnected ? "bg-human" : "bg-danger"
            }`}
          />
          {collapsed ? (
            <span className="sr-only">
              {whatsappConnected ? "WhatsApp conectado" : "WhatsApp desconectado"}
            </span>
          ) : (
            <span
              className={`min-w-0 flex-1 truncate text-legenda ${
                whatsappConnected ? "text-human-ink" : "text-danger-ink"
              }`}
            >
              {whatsappConnected ? "WhatsApp conectado" : "WhatsApp desconectado"}
            </span>
          )}
        </div>

        {/* Tema entre o canal e o perfil. Recolhido, fica centralizado como os
            demais alvos da coluna; o perfil é sempre o último item. */}
        <div className={collapsed ? "flex justify-center" : ""}>
          <ThemeToggle collapsed={collapsed} />
        </div>

        {menuOpen && (
          <div
            role="menu"
            className={`absolute bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-line bg-menu p-1 shadow-lg ${
              collapsed ? "left-0 w-48" : "left-0 right-0"
            }`}
          >
            <Link
              href="/perfil"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="flex h-9 items-center gap-2 rounded-lg px-3 text-apoio text-ink-2 transition-colors hover:bg-[var(--rail-hover)] hover:text-ink"
            >
              <User size={16} /> Perfil
            </Link>
            <button
              onClick={logout}
              role="menuitem"
              className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-apoio text-ink-2 transition-colors hover:bg-[var(--danger-bg)] hover:text-danger"
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
          className={`flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-[var(--rail-hover)] ${
            collapsed ? "justify-center" : ""
          } ${perfilActive || menuOpen ? "bg-[var(--rail-hover)]" : ""}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bloco text-legenda font-semibold text-ink-2 ring-1 ring-line">
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-corpo font-semibold">
                  {clientName}
                </span>
                <span className="block text-legenda font-normal text-ink-3">
                  Ver perfil
                </span>
              </span>
              <ChevronUp size={15} className="shrink-0 text-ink-3" />
            </>
          )}
        </button>
      </div>
    </nav>
  );
}

// Só o selo, sem o nome: é o que sobra do BrandMark quando o menu recolhe.
function MarkOnly() {
  return (
    <span className="relative block h-8 w-8 shrink-0" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.markLight}
        alt=""
        width={32}
        height={32}
        className="mark-light h-full w-full object-contain"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BRAND.markDark}
        alt=""
        width={32}
        height={32}
        className="mark-dark h-full w-full object-contain"
      />
    </span>
  );
}
