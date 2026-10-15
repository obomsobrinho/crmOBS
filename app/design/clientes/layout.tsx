import { notFound } from "next/navigation";

// Os previews da central do dono (`/design/clientes` e `/design/clientes/detalhe`)
// somem em produção. O resto do /design é liberado pelo proxy só fora de
// produção, mas estes dois também não podem revelar que a central existe: uma
// checagem só, aqui, vale para os dois.
export default function DesignClientesLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
