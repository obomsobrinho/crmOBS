import "server-only";
import { grafiasDeDigitos } from "./avisos";
import { textoParaLead, type OrigemDaCampanha } from "./prospeccao";
import type { Supa } from "./supabase/tipos";

// A ORIGEM DE UM CONTATO para o turno do agente (03/11/2026): se a empresa mandou
// uma mensagem de campanha a este telefone, o envio mais recente, com o texto
// exato que saiu. O texto não é gravado no envio: é refeito pela mesma função do
// cron (`textoParaLead`, com a variante e o nome do lead), e as variantes só
// mudam enquanto a campanha é rascunho, então o refeito é o enviado.
// Só leitura; quem decide o que fazer com isso é a persona.
//
// Roda em TODO turno de toda empresa, e quase nenhum telefone é lead: começa pelo
// índice único do telefone e para ali quando não é (uma leitura).

/** O envio de campanha mais recente da empresa para este telefone, ou null. */
export async function origemDaCampanha(svc: Supa, clientId: string, phone: string): Promise<OrigemDaCampanha | null> {
  const { data: leads, error } = await svc
    .from("prospeccao_leads")
    .select("id, nome, parou_em")
    .in("telefone", grafiasDeDigitos(phone.replace(/\D/g, "")));
  if (error) throw error;
  if (!leads || leads.length === 0) return null;
  const { data: envio, error: eErr } = await svc
    .from("prospeccao_campanha_leads")
    .select("lead_id, variante, enviado_em, prospeccao_campanhas!inner(client_id, prospeccao_variantes(ordem, texto))")
    .in("lead_id", leads.map((l) => l.id))
    .eq("prospeccao_campanhas.client_id", clientId)
    .not("enviado_em", "is", null)
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eErr) throw eErr;
  const lead = leads.find((l) => l.id === envio?.lead_id);
  const variante = envio?.prospeccao_campanhas.prospeccao_variantes.find((v) => v.ordem === envio.variante);
  if (!envio?.enviado_em || !lead || !variante) return null;
  return {
    enviadoEm: envio.enviado_em,
    texto: textoParaLead(variante.texto, lead.nome),
    parouEm: lead.parou_em,
  };
}
