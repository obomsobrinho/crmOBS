"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

// Alterna light/dark, persistindo em cookie. O tema inicial já vem do
// servidor (o layout lê o cookie e põe data-theme no <html>).
export default function ThemeToggle({
  collapsed,
  iconOnly,
}: {
  collapsed?: boolean;
  /** Botão quadrado no degrau `chrome`, sem rótulo. Usado na faixa do rail. */
  iconOnly?: boolean;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    // Sincroniza com o data-theme que o servidor já colocou no <html>.
    const current = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    // Cookie é a fonte de verdade: o layout (servidor) lê no refresh e já
    // renderiza o data-theme certo, sem flash. 1 ano, escopo do app.
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setTheme(next);
  }

  const isDark = theme === "dark";
  const label = isDark ? "Tema claro" : "Tema escuro";
  const glyph = isDark ? <Sun size={15} /> : <Moon size={15} />;

  if (iconOnly) {
    return (
      <button
        onClick={toggle}
        title={label}
        aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
        className="flex h-[var(--h-chrome)] w-[var(--h-chrome)] shrink-0 items-center justify-center rounded-lg border border-line-strong bg-menu text-ink-2 transition-colors hover:text-ink"
      >
        {glyph}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      className={`flex h-9 items-center gap-3 rounded-lg text-corpo text-ink-2 transition-colors hover:bg-[var(--rail-hover)] hover:text-ink ${
        collapsed ? "w-9 justify-center" : "px-2.5"
      }`}
    >
      <span className="flex w-[18px] shrink-0 justify-center">{glyph}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
