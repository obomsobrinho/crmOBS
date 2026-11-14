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

  const fonte = fonteDoBancoAgenda(await createClient(), client.id);
  // Configuração, agenda, semana e bloqueios saem JUNTOS (passo 0 de
  // docs/plano-dados-e-estado.md): eram duas viagens em série depois da sessão.
  // Com a agenda desligada (raro) a semana lida se perde no redirecionamento; sem
  // a migration, a semana falha e o resultado é o mesmo de antes (indisponível).
  const [agenda, { data: c }, semanaLida] = await Promise.all([
    agendaDoTenant(svc, client.id),
    svc.from("clients").select("agent_config").eq("id", client.id).maybeSingle(),
    Promise.all([
      fonte.semana(de, de + 7 * 86_400_000),
      fonte.bloqueios(de, de + 7 * 86_400_000),
    ]).catch((e: unknown) => ({ erro: e })),
  ]);
  if (agenda && !agenda.config.ativa) redirect(client.role === "dono" ? "/agenda/configuracoes" : "/inbox");

  let itens: Awaited<ReturnType<typeof fonte.semana>> = [];
  let bloqueios: Awaited<ReturnType<typeof fonte.bloqueios>> = [];
  let disponivel = !!agenda;
  if (agenda) {
    if ("erro" in semanaLida) {
      console.error("agenda indisponível:", semanaLida.erro);
      disponivel = false;
    } else {
      [itens, bloqueios] = semanaLida;
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
      horarioAtendimento={horarioCadastrado(c?.agent_config ?? null)}
      config={agenda?.config ?? AGENDA_PADRAO}
      servicos={agenda?.servicos ?? []}
      inicial={{ semana, itens, bloqueios }}
      hrefConfig="/agenda/configuracoes"
      readOnly={client.access.blocked}
    />
  );
}
