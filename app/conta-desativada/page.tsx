import { redirect } from "next/navigation";
import ContaDesativada from "@/components/ContaDesativada";
import { getMyClient } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conta desativada", robots: { index: false } };

// Para onde vai quem tem a conta DESATIVADA pelo dono do produto
// (`barrarContaDesativada`, lib/auth.ts). Fora do grupo `(app)` de propósito: o
// layout do app é justamente quem manda para cá. Quem não está desativado não fica
// aqui (volta à entrada), então o endereço não revela nada a ninguém.
export default async function ContaDesativadaPage() {
  const client = await getMyClient();
  if (!client) redirect("/login");
  if (!client.contaDesativada) redirect("/");
  return <ContaDesativada empresa={client.name} />;
}
