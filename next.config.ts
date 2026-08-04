import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do workspace neste projeto (há outro lockfile em C:\Users\franck
  // que faria o Next inferir a raiz errada).
  turbopack: {
    root: __dirname,
  },
  // Parsers da base de conhecimento: libs Node só de servidor (route handlers).
  // Ficam fora do bundle para evitar problemas de empacotamento.
  serverExternalPackages: ["unpdf", "mammoth", "exceljs"],
};

export default nextConfig;
