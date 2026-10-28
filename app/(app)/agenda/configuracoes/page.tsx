import { redirect } from "next/navigation";
import ConfiguracaoDoBanco from "@/components/agenda/ConfiguracaoDoBanco";
import { getMyClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { AGENDA_PADRAO } from "@/lib/agenda";
import { agendaDoTenant } from "@/lib/agenda-servidor";
import { horarioCadastrado } from "@/lib/horarios";

export const dynamic = "force-dynamic";

// CONFIGURAÇÕES DA AGENDA (revisão do dono, 28/10/2026). Só o dono: atendente
// vai para as conversas (a rota `PUT /api/agenda/config` também barra).
// PENDENTE: onde isto mora no menu; hoje se chega pela engrenagem da agenda e
// pelo bloco "Agenda" do agente.
export default async function ConfiguracoesDaAgendaPage() {
  const client = await getMyClient();
  if (!client) redirect("/login");
  if (client.role !== "dono") redirect("/inbox");
  const svc = createServiceClient();
  const [agenda, { data: c }] = await Promise.all([
    agendaDoTenant(svc, client.id),
    svc.from("clients").select("agent_config").eq("id", client.id).maybeSingle(),
  ]);
  return (
    <ConfiguracaoDoBanco
      clientId={client.id}
      configInicial={agenda?.config ?? AGENDA_PADRAO}
      servicosIniciais={agenda?.servicos ?? []}
      horarioAtendimento={horarioCadastrado(c?.agent_config ?? null)}
      hrefHorario="/agente"
      hrefAgenda="/agenda"
    />
  );
}
