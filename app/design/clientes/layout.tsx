import { notFound } from "next/navigation";

// Os previews da central do dono (`/design/clientes` e `/design/clientes/detalhe`)
// somem em produção. O resto do /design é liberado pelo proxy só fora de
// produção, mas estes dois também não podem revelar que a central existe: uma
// checagem só, aqui, vale para os dois.
export default function DesignClientesLayout({ children }: { children: React.ReactNode }) {
  // eslint-disable-next-line no-restricted-properties -- NODE_ENV stays literal: the bundler folds it and drops dev-only code (B8, lib/env.ts)
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
