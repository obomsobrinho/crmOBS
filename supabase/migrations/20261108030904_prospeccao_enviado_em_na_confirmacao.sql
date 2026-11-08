-- Campanhas: `enviado_em` passa a ser a hora em que a Evolution CONFIRMOU o envio (07/11/2026,
-- docs/adr/2026-11-07-campaign-auto-reply-lock.md). Antes ficava a hora do inicio do tick
-- (`p_agora` de `prospeccao_vez_da_campanha`, gravada ao reservar o lead), e o envio de verdade saia
-- segundos depois: respostas e buscas do tick e os envios das outras campanhas vem antes. A trava do
-- robo de menu (lib/resposta-automatica.ts) mede "respondeu ate 5 s depois da nossa mensagem" a
-- partir desta hora, e com a hora do inicio do tick o primeiro menu depois da campanha passava
-- como pessoa. So muda o ramo 'enviado'; a reserva continua gravando `p_agora` (a cota do dia e a
-- protecao contra envio duplo seguem iguais).

create or replace function public.prospeccao_registrar_envio(
  p_campanha uuid,
  p_lead uuid,
  p_resultado text,
  p_variante int,
  p_erro text,
  p_proximo timestamptz
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_resultado = 'enviado' then
    update public.prospeccao_campanha_leads set variante = p_variante, enviado_em = now()
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado = 'falhou' then
    update public.prospeccao_campanha_leads
       set status = 'falhou', enviado_em = null, variante = null, erro = p_erro
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado = 'devolver' then
    update public.prospeccao_campanha_leads
       set status = 'na_fila', enviado_em = null, tentado_em = null, variante = null
     where campanha_id = p_campanha and lead_id = p_lead;
  elsif p_resultado <> 'adiar' then
    raise exception 'resultado desconhecido: %', p_resultado using errcode = '22023';
  end if;
  update public.prospeccao_campanhas set proximo_envio_em = p_proximo
   where id = p_campanha and status = 'rodando';
end;
$$;
revoke execute on function public.prospeccao_registrar_envio(uuid, uuid, text, int, text, timestamptz) from public, anon, authenticated;
grant execute on function public.prospeccao_registrar_envio(uuid, uuid, text, int, text, timestamptz) to service_role;
