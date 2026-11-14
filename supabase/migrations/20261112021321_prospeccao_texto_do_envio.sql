-- Campanhas: o envio grava o TEXTO EXATO que saiu (dono, 11/11/2026). Ate aqui a origem do contato
-- (lib/campanhas-origem.ts) refazia o texto pela variante e pelo nome do lead; com o nome limpo
-- (`nomeParaMensagem`), a saudacao da hora (`{saudacao}`) e a linha de saida nova, o refeito deixaria
-- de ser o enviado, e o agente veria no historico um texto que o lead nunca recebeu.
--
-- 1. `prospeccao_campanha_leads.texto` (null para quem ainda nao recebeu).
-- 2. Os envios de antes ficam com o texto da epoca: a variante com o nome do lead como estava e a
--    linha de saida antiga (a regra de `textoParaLead` ate 11/11/2026). Roda ANTES de os 12 nomes da
--    fila serem limpos, e nenhum deles foi enviado.
-- 3. `prospeccao_registrar_envio` ganha `p_texto` (default null). Sem ele (o cron de antes do deploy),
--    o envio grava o texto pela regra antiga, que e o que esse cron mandou. A assinatura antiga sai
--    para a chamada por nome nao ficar ambigua.

alter table public.prospeccao_campanha_leads add column if not exists texto text;

-- O texto que o cron ate 11/11/2026 mandava (`textoParaLead` antigo).
create or replace function public.prospeccao_texto_antigo(p_campanha uuid, p_lead uuid, p_variante int)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select regexp_replace(replace(v.texto, '{empresa}', btrim(l.nome)), '\s+$', '')
         || E'\n\n' || 'Se não quiser receber mais mensagens, é só responder SAIR.'
    from public.prospeccao_variantes v
    join public.prospeccao_leads l on l.id = p_lead
   where v.campanha_id = p_campanha and v.ordem = p_variante;
$$;
revoke execute on function public.prospeccao_texto_antigo(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.prospeccao_texto_antigo(uuid, uuid, int) to service_role;

update public.prospeccao_campanha_leads cl
   set texto = public.prospeccao_texto_antigo(cl.campanha_id, cl.lead_id, cl.variante)
 where cl.enviado_em is not null and cl.texto is null and cl.variante is not null;

drop function if exists public.prospeccao_registrar_envio(uuid, uuid, text, int, text, timestamptz);

create or replace function public.prospeccao_registrar_envio(
  p_campanha uuid,
  p_lead uuid,
  p_resultado text,
  p_variante int,
  p_erro text,
  p_proximo timestamptz,
  p_texto text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_resultado = 'enviado' then
    update public.prospeccao_campanha_leads
       set variante = p_variante, enviado_em = now(),
           texto = coalesce(p_texto, public.prospeccao_texto_antigo(p_campanha, p_lead, p_variante))
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado = 'falhou' then
    update public.prospeccao_campanha_leads
       set status = 'falhou', enviado_em = null, variante = null, erro = p_erro, texto = null
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado = 'devolver' then
    update public.prospeccao_campanha_leads
       set status = 'na_fila', enviado_em = null, tentado_em = null, variante = null, texto = null
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado <> 'adiar' then
    raise exception 'resultado desconhecido: %', p_resultado using errcode = '22023';
  end if;
  update public.prospeccao_campanhas set proximo_envio_em = p_proximo
   where id = p_campanha and status = 'rodando';
end;
$$;
revoke execute on function public.prospeccao_registrar_envio(uuid, uuid, text, int, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.prospeccao_registrar_envio(uuid, uuid, text, int, text, timestamptz, text) to service_role;
