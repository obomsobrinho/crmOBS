import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do workspace neste projeto (há outro lockfile em C:\Users\franck
  // que faria o Next inferir a raiz errada).
  turbopack: {
    root: __dirname,
  },
  // Some o badge de dev ("Rendering..." no canto). É só do modo dev e não afeta
  // produção; tirar por preferência do usuário. A navegação instantânea vem dos
  // loading.tsx (esqueletos), não daqui.
  devIndicators: false,
  // Parsers da base de conhecimento: libs Node só de servidor (route handlers).
  // Ficam fora do bundle para evitar problemas de empacotamento.
  serverExternalPackages: ["unpdf", "mammoth", "exceljs"],
  // Cabeçalhos de segurança de base (R-35, 01/10/2026). ⚠️ Sem CSP de script
  // de propósito: ela precisa ser medida em modo report-only contra o que o
  // Next injeta e contra o WebSocket do Supabase, e uma CSP errada derruba o app
  // inteiro. `frame-ancestors` sozinha é segura e é a que fecha o clickjacking.
  // O microfone é do próprio app (gravação de áudio da bancada).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "microphone=(self), camera=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
