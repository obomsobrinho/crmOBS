"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch, SwitchThumb, SwitchTrack } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Alterna light/dark, persistindo em cookie. O tema inicial já vem do
// servidor (o layout lê o cookie e põe data-theme no <html>).
export default function ThemeToggle({
  collapsed,
  linha = false,
}: {
  collapsed?: boolean;
  /**
   * Linha de lista da folha "Mais" do celular (23/09/2026): mesma ação, alvo de
   * 48px na largura toda e sem tooltip, porque no toque não existe hover.
   */
  linha?: boolean;
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

  const aria = isDark ? "Ativar tema claro" : "Ativar tema escuro";

  if (linha) {
    return (
      // O Root do Radix, e não um Button com role="switch": o polegar
      // (`SwitchThumb`) lê o contexto do Root e derruba a página fora dele.
      <Switch
        checked={isDark}
        onCheckedChange={toggle}
        className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-corpo text-ink hover:bg-[var(--active-bg)]"
      >
        <Moon size={20} strokeWidth={1.8} className="shrink-0 text-ink-2" />
        <span className="flex-1 truncate text-left">Tema escuro</span>
        {/* Chave, e não botão de texto (desenho do mobile): na folha a linha diz
            o ESTADO ("Tema escuro" ligado ou desligado), como uma configuração. */}
        <SwitchTrack checked={isDark}>
          <SwitchThumb checked={isDark} />
        </SwitchTrack>
      </Switch>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="rail"
          size="none"
          onClick={toggle}
          aria-label={aria}
          className={cn(
            "h-9 gap-3 rounded-lg text-corpo",
            collapsed ? "w-9 justify-center" : "px-2.5",
          )}
        >
          <span className="flex w-[18px] shrink-0 justify-center">{glyph}</span>
          {!collapsed && <span className="truncate">{label}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
