import { redirect } from "next/navigation";
import { getMyClient } from "@/lib/auth";

export default async function Home() {
  const client = await getMyClient();
  // O proxy já redireciona quem não está logado; aqui tratamos o caso raro de
  // usuário autenticado sem tenant vinculado.
  if (!client) redirect("/login");
  // Sem instância conectada → onboarding (conectar WhatsApp).
  if (!client.evolution_instance) redirect("/connect");
  redirect("/inbox");
}
