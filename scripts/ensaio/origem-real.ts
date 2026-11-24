import { createServiceClient } from "@/lib/supabase/service";
import { origemDaCampanha } from "@/features/campanhas/server/origem";

// `scripts/conferir-origem.mjs`: o envio de campanha mais recente (qualquer empresa)
// e a origem que o turno do agente leria para aquele telefone. Só leitura.

export interface ConferenciaDaOrigem {
  ok: boolean;
  /** Havia um envio para conferir (sem nenhum, não há o que provar). */
  temEnvio: boolean;
  /** A origem veio, com a mesma hora do envio. */
  origem: boolean;
  mesmoEnvio: boolean;
  deOnde: string | null;
  erro?: string;
}

export async function conferirOrigem(): Promise<ConferenciaDaOrigem> {
  const svc = createServiceClient();
  const { data: envio, error } = await svc
    .from("prospeccao_campanha_leads")
    .select("enviado_em, prospeccao_leads!inner(telefone), prospeccao_campanhas!inner(client_id)")
    .not("enviado_em", "is", null)
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, temEnvio: false, origem: false, mesmoEnvio: false, deOnde: null, erro: error.message };
  if (!envio?.enviado_em || !envio.prospeccao_campanhas.client_id || !envio.prospeccao_leads.telefone) return { ok: false, temEnvio: false, origem: false, mesmoEnvio: false, deOnde: null, erro: "nenhum envio de campanha" };
  try {
    const o = await origemDaCampanha(svc, envio.prospeccao_campanhas.client_id, envio.prospeccao_leads.telefone);
    // O mesmo telefone pode ter recebido um envio mais novo de outra empresa: a hora
    // só precisa bater quando a origem veio da mesma empresa, que é o caso aqui.
    const mesmoEnvio = !!o && Date.parse(o.enviadoEm) === Date.parse(envio.enviado_em);
    return { ok: !!o && mesmoEnvio, temEnvio: true, origem: !!o, mesmoEnvio, deOnde: o?.deOnde ?? null };
  } catch (e) {
    const erro = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
    return { ok: false, temEnvio: true, origem: false, mesmoEnvio: false, deOnde: null, erro };
  }
}
