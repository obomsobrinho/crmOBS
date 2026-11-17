import { notFound } from "next/navigation";

// O preview de Campanhas (a prospecção do dono do produto) some em produção,
// como os da central: não pode revelar que a tela existe.
export default function DesignCampanhasLayout({ children }: { children: React.ReactNode }) {
  // eslint-disable-next-line no-restricted-properties -- NODE_ENV stays literal: the bundler folds it and drops dev-only code (B8, lib/env.ts)
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
