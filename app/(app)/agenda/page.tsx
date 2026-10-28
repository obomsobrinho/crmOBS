import { redirect } from "next/navigation";
import AgendaDoBanco from "@/components/agenda/AgendaDoBanco";
import { getMyClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { AGENDA_PADRAO } from "@/lib/agenda";
import { agendaDoTenant, querAgendar } from "@/lib/agenda-servidor";
import { PAGINA_AGENDA, fonteDoBancoAgenda } from "@/lib/agenda-fonte";
import { horarioCadastrado } from "@/lib/horarios";
import { diaIsoSP, inicioDoDiaSP } from "@/lib/fuso";
import { agoraMs } from "@/lib/periodo";

export const dynamic = "force-dynamic";

// AGENDA PRÓPRIA (28/10/2026, docs/plano-agenda.md). O servidor traz a primeira
// página da semana (10) e os bloqueios dela; o resto o navegador pede pela
// MESMA fonte (`lib/agenda-fonte.ts`). Sem a migration aplicada as tabelas não
// existem: a tela diz que a agenda ainda não está disponível.
//
// ⚠️ `getMyClient` e não `requireActiveTenant`: conta bloqueada vê a agenda em
// leitura, como o `/inbox`; as rotas de escrita respondem 402.
export default async function AgendaPage() {
  const client = await getMyClient();
  if (!client) redirect("/login");
  const svc = createServiceClient();
  const supabase = await createClient();
  const agora = agoraMs();
  const de = inicioDoDiaSP(diaIsoSP(agora));
  const fonte = fonteDoBancoAgenda(supabase, client.id);

  const [agenda, { data: c }] = await Promise.all([
    agendaDoTenant(svc, client.id),
    svc.from("clients").select("agent_config, prompt_mode").eq("id", client.id).maybeSingle(),
  ]);
  let itens: Awaited<ReturnType<typeof fonte.listar>> = [];
  let bloqueios: Awaited<ReturnType<typeof fonte.bloqueios>> = [];
  let disponivel = !!agenda;
  if (agenda) {
    try {
      [itens, bloqueios] = await Promise.all([
        fonte.listar({ de, ate: de + 7 * 86_400_000, status: "confirmado" }, null, PAGINA_AGENDA),
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
      agora={agora}
      empresa={client.name}
      dono={client.role === "dono"}
      disponivel={disponivel}
      temHorario={!!horarioCadastrado(c?.agent_config ?? null)}
      querAgendar={querAgendar(c?.prompt_mode, c?.agent_config ?? null)}
      configInicial={agenda?.config ?? AGENDA_PADRAO}
      servicosIniciais={agenda?.servicos ?? []}
      inicial={{ itens, temMais: itens.length === PAGINA_AGENDA, bloqueios }}
      readOnly={client.access.blocked}
    />
  );
}
