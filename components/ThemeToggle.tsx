"use client";

import { useEffect, useState } from "react";

// Alterna light/dark, persistindo em localStorage. O tema inicial já é
// aplicado pelo script em app/layout.tsx (antes da hidratação).
export default function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // sem persistência se o storage estiver bloqueado
    }
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
