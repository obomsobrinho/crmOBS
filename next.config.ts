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
};

export default nextConfig;
