"use client";

import { useEffect, useState } from "react";

// Alterna light/dark, persistindo em cookie. O tema inicial já vem do
// servidor (o layout lê o cookie e põe data-theme no <html>).
export default function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
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
  return (
    <button
      onClick={toggle}
      title={isDark ? "Tema claro" : "Tema escuro"}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--rail-fg-dim)] transition-colors hover:bg-[var(--rail-hover)] hover:text-[var(--rail-fg)] ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <span aria-hidden className="text-base leading-none">
        {isDark ? "☀" : "☾"}
      </span>
      {!collapsed && <span>{isDark ? "Tema claro" : "Tema escuro"}</span>}
    </button>
  );
}
