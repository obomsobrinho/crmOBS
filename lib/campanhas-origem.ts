import "server-only";
import { ACTOR_APIFY } from "./apify-campos";
import { grafiasDeDigitos } from "./avisos";
import { FONTE_PLANILHA } from "./planilha-de-leads";
import { textoParaLead, type OrigemDaCampanha, type OrigemDoContato } from "./prospeccao";
import type { Supa } from "./supabase/tipos";

// A ORIGEM DE UM CONTATO para o turno do agente (03/11/2026): se a empresa mandou
// uma mensagem de campanha a este telefone, o envio mais recente, com o texto
// exato que saiu. Desde 11/11/2026 o texto é gravado no envio (o nome limpo e a
// saudação da hora mudam o texto, e a linha de saída mudou); os envios de antes
// foram gravados pela migração com o texto da época. Sem texto gravado, ele é
// refeito pela mesma função do cron (`textoParaLead`), na hora do envio.
// Desde 07/11/2026 também de onde veio o contato (a fonte da lista do lead): a IA
// responde "de onde tirou meu número?" pelo fato, não pelo texto enviado.
// Só leitura; quem decide o que fazer com isso é a persona.
//
// Roda em TODO turno de toda empresa, e quase nenhum telefone é lead: começa pelo
// índice único do telefone e para ali quando não é (uma leitura).

/** A fonte gravada na lista do lead, como a IA a conhece. Fonte desconhecida = null (nunca um palpite). */
export function origemDoContato(fonte: string | null | undefined): OrigemDoContato | null {
  if (fonte === ACTOR_APIFY) return "google";
  if (fonte === FONTE_PLANILHA) return "planilha";
  return null;
}

/** O envio de campanha mais recente da empresa para este telefone, ou null. */
export async function origemDaCampanha(svc: Supa, clientId: string, phone: string): Promise<OrigemDaCampanha | null> {
  const { data: leads, error } = await svc
    .from("prospeccao_leads")
    .select("id, nome, cidade, parou_em, prospeccao_buscas(fonte)")
    .in("telefone", grafiasDeDigitos(phone.replace(/\D/g, "")));
  if (error) throw error;
  if (!leads || leads.length === 0) return null;
  const { data: envio, error: eErr } = await svc
    .from("prospeccao_campanha_leads")
    .select("lead_id, variante, enviado_em, texto, prospeccao_campanhas!inner(client_id, prospeccao_variantes(ordem, texto))")
    .in("lead_id", leads.map((l) => l.id))
    .eq("prospeccao_campanhas.client_id", clientId)
    .not("enviado_em", "is", null)
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eErr) throw eErr;
  const lead = leads.find((l) => l.id === envio?.lead_id);
  const variante = envio?.prospeccao_campanhas.prospeccao_variantes.find((v) => v.ordem === envio.variante);
  if (!envio?.enviado_em || !lead) return null;
  const em = Date.parse(envio.enviado_em);
  const texto = envio.texto ?? (variante ? textoParaLead(variante.texto, lead.nome, { em, cidade: lead.cidade }) : null);
  if (!texto) return null;
  return {
    enviadoEm: envio.enviado_em,
    texto,
    parouEm: lead.parou_em,
    deOnde: origemDoContato(lead.prospeccao_buscas?.fonte),
  };
}
