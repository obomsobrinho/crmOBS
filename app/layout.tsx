import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Manrope, Space_Grotesk } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Tema definido no servidor a partir do cookie (escrito pelo ThemeToggle).
  // Assim o data-theme já vem no HTML e não há flash nem timing de script no
  // refresh. Sem cookie, cai no dark (obm2.0 é dark-native).
  const theme =
    (await cookies()).get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      suppressHydrationWarning
      className={`${manrope.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      {/* ⚠️ `suppressHydrationWarning` também no BODY, e não só no html.
          Extensão de navegador escreve atributo no `<body>` ANTES de o React
          carregar, e aí a hidratação acusa uma diferença que não é do nosso
          código. Medido em 28/08/2026: o diff do React apontava exatamente
          `cz-shortcut-listen="true"` (ColorZilla), e o mesmo erro aparecia no
          `/login`, uma tela sem nada de dinâmico.
          Isto silencia só o aviso do PRÓPRIO elemento, um nível, então uma
          diferença de verdade dentro da árvore continua sendo reportada. */}
      <body className="min-h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
