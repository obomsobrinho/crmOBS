import { redirect } from "next/navigation";
import { getMyClient } from "@/lib/auth";

export default async function Home() {
  const client = await getMyClient();
  // O proxy já redireciona quem não está logado; aqui tratamos o caso raro de
  // usuário autenticado sem tenant vinculado.
  if (!client) redirect("/login");
  // Dono que ainda não colocou o agente no ar cai no ASSISTENTE, mesmo já tendo
  // conectado: enquanto a montagem não termina, ela É o trabalho. O assistente
  // retoma no passo certo sozinho (`montagemState`).
  if (client.role === "dono" && !client.agentPublishedAt) redirect("/montagem");
  // Atendente sem instância conectada ainda vai para o QR: ele não tem acesso ao
  // assistente, que é do dono.
  if (!client.evolution_instance) redirect("/connect");
  // Fora isso a tela inicial depende do PAPEL: quem trabalha na operação abre em
  // Conversas, o dono abre no Painel. O Painel é o primeiro item do menu para os
  // dois; mandar um atendente para uma tela que não é o trabalho dele só
  // adicionaria um clique.
  redirect(client.role === "dono" ? "/painel" : "/inbox");
}
