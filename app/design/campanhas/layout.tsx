import { notFound } from "next/navigation";

// O preview de Campanhas (a prospecção do dono do produto) some em produção,
// como os da central: não pode revelar que a tela existe.
export default function DesignCampanhasLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
