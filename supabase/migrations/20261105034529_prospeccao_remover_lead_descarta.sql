-- Campanhas: o X antigo marcava o lead como descartado, e isso o tirava de toda campanha, mesmo com
-- "incluir quem ja participou". Tirar da lista um lead ja contatado (ou que pediu para parar) so desfazia o
-- vinculo, e ele voltava a poder receber uma segunda mensagem. Agora quem fica na base por causa do
-- historico fica como descartado (docs/adr/2026-11-05-campanhas-delete-triage-and-queue-forecast.md).
-- `p_busca` ganha padrao null: sem lista = a base inteira, como a rota ja chama.
create or replace function public.prospeccao_remover_lead(p_quem uuid, p_lead uuid, p_busca uuid default null)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  l public.prospeccao_leads%rowtype;
  v_guardado boolean;
  v_saiu_da_base boolean;
begin
  select * into l from public.prospeccao_leads where id = p_lead for update;
  if not found then
    return 'nao_encontrado';
  end if;
  if exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = p_lead and cl.status = 'na_fila') then
    return 'na_fila';
  end if;
  v_guardado := l.parou_em is not null
    or exists (select 1 from public.prospeccao_campanha_leads cl where cl.lead_id = p_lead);
  if p_busca is null and v_guardado then
    return 'contatado';
  end if;
  with sairam as (
    delete from public.prospeccao_busca_leads bl
     where bl.lead_id = p_lead and (p_busca is null or bl.busca_id = p_busca)
    returning bl.busca_id
  )
  update public.prospeccao_buscas b set total = greatest(b.total - 1, 0)
   where b.id in (select s.busca_id from sairam s);
  if not found and p_busca is not null then
    return 'nao_encontrado';
  end if;
  v_saiu_da_base := not v_guardado
    and not exists (select 1 from public.prospeccao_busca_leads o where o.lead_id = p_lead);
  if v_saiu_da_base then
    delete from public.prospeccao_leads where id = p_lead;
  elsif v_guardado then
    update public.prospeccao_leads set marcacao = 'descartado' where id = p_lead;
  end if;
  insert into public.admin_acoes (quem, acao, alvo, antes, depois)
  values (p_quem, 'prospeccao_remover_lead', p_lead::text,
    jsonb_build_object('nome', l.nome, 'busca', p_busca, 'marcacao', l.marcacao),
    jsonb_build_object('saiu_da_base', v_saiu_da_base, 'descartado', v_guardado));
  return 'ok';
end;
$$;
revoke execute on function public.prospeccao_remover_lead(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prospeccao_remover_lead(uuid, uuid, uuid) to service_role;
