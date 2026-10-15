import { notFound, redirect } from "next/navigation";
import { adminDaSessao } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

// `/admin` virou `/clientes` (docs/plano-central-clientes.md, 14/10/2026): a
// central do dono mora no menu, dentro do app. Aqui só sobrou o endereço antigo:
// o dono do produto (`ADMIN_USER_IDS`) é levado a `/clientes`; para qualquer outro
// login é 404, como sempre (`proxy.ts` responde antes, esta é a segunda trava).
export default async function AdminPage() {
  const admin = await adminDaSessao();
  if (!admin) notFound();
  redirect("/clientes");
}
