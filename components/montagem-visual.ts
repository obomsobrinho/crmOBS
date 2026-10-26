import { Bell, Bot, FileText, MessagesSquare, QrCode, type LucideIcon } from "lucide-react";
import { coresDoRotulo, type CoresDoRotulo } from "@/lib/rotulos";
import type { PassoMontagem } from "@/lib/onboarding";

/**
 * Um ícone e uma cor por passo da montagem (23/10/2026, dono: "mais cor e um
 * ícone por passo"; depois "essas cores poderiam continuar durante a montagem,
 * para se conversarem"). A abertura, o trilho de progresso e o título de cada
 * passo leem DAQUI, para o passo ter a mesma cara no mapa e na própria tela.
 *
 * As cores são da paleta única de rótulos (`lib/rotulos.ts`), que já vira por
 * tema e nunca usa verde, âmbar nem vermelho (estado). Os ícones são os da
 * própria montagem.
 */
export const VISUAL_DO_PASSO: Record<PassoMontagem, { icone: LucideIcon; cor: string }> = {
  quem: { icone: Bot, cor: "violet" },
  sabe: { icone: FileText, cor: "blue" },
  testar: { icone: MessagesSquare, cor: "cyan" },
  conectar: { icone: QrCode, cor: "indigo" },
  avisos: { icone: Bell, cor: "fuchsia" },
};

/** Os papéis de cor (`fill`, `on`, `ink`, `surface`) do passo. */
export function coresDoPasso(passo: PassoMontagem): CoresDoRotulo {
  return coresDoRotulo(VISUAL_DO_PASSO[passo].cor);
}
