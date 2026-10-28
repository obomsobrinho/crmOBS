import { redirect } from "next/navigation";
import AgendaDoBanco from "@/components/agenda/AgendaDoBanco";
import { getMyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { agendaDoTenant } from "@/lib/agenda-servidor";
import { fonteDoBancoAgenda } from "@/lib/agenda-fonte";
import { AGENDA_PADRAO, horarioDaAgenda, segundaDaSemana } from "@/lib/agenda";
import { horarioCadastrado } from "@/lib/horarios";
import { diaIsoSP, inicioDoDiaSP } from "@/lib/fuso";
import { agoraMs } from "@/lib/periodo";

export const dynamic = "force-dynamic";

// AGENDA PRÓPRIA (28/10/2026, docs/plano-agenda.md). O servidor traz a semana
// atual (agendamentos e bloqueios); as outras o navegador lê pela MESMA fonte
// (`lib/agenda-fonte.ts`). Agenda desligada: a página não existe para o tenant
// (vai para as configurações, se dono, ou para as conversas). Sem a migration
// aplicada as tabelas não existem: a tela diz que a agenda não está disponível.
//
// ⚠️ `getMyClient` e não `requireActiveTenant`: conta bloqueada vê a agenda em
// leitura, como o `/inbox`; as rotas de escrita respondem 402.
export default async function AgendaPage() {
  const client = await getMyClient();
  if (!client) redirect("/login");
  const svc = createServiceClient();
  const agora = agoraMs();
  const semana = segundaDaSemana(diaIsoSP(agora));
  const de = inicioDoDiaSP(semana);

  const [agenda, { data: c }] = await Promise.all([
    agendaDoTenant(svc, client.id),
    svc.from("clients").select("agent_config").eq("id", client.id).maybeSingle(),
  ]);
  if (agenda && !agenda.config.ativa) redirect(client.role === "dono" ? "/agenda/configuracoes" : "/inbox");

  const fonte = fonteDoBancoAgenda(await createClient(), client.id);
  let itens: Awaited<ReturnType<typeof fonte.semana>> = [];
  let bloqueios: Awaited<ReturnType<typeof fonte.bloqueios>> = [];
  let disponivel = !!agenda;
  if (agenda) {
    try {
      [itens, bloqueios] = await Promise.all([
        fonte.semana(de, de + 7 * 86_400_000),
        fonte.bloqueios(de, de + 7 * 86_400_000),
      ]);
    } catch (e) {
      console.error("agenda indisponível:", e);
      disponivel = false;
    }
  }

  return (
    <AgendaDoBanco
      clientId={client.id}
      numeroAvisos={client.avisos}
      agora={agora}
      empresa={client.name}
      dono={client.role === "dono"}
      disponivel={disponivel}
      hours={horarioDaAgenda(agenda?.config ?? AGENDA_PADRAO, horarioCadastrado(c?.agent_config ?? null))}
      config={agenda?.config ?? AGENDA_PADRAO}
      servicos={agenda?.servicos ?? []}
      inicial={{ semana, itens, bloqueios }}
      hrefConfig="/agenda/configuracoes"
      readOnly={client.access.blocked}
    />
  );
}
