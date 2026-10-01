-- PAINEL SEM TEXTO (docs/plano-carregamento.md, fase 6). As contas do painel
-- (lib/valor, lib/metrics, lib/painel) so olham SE a linha tem mensagem
-- recebida e SE tem resposta (verdade de `!!user_message` / `!!bot_message`),
-- nunca o texto. Antes a pagina baixava ate 20.000 linhas COM o texto.
create or replace function public.painel_linhas(p_client uuid, p_limite int default 20000)
returns table (phone text, created_at timestamptz, message_type text, tem_user boolean, tem_bot boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select m.phone, m.created_at, m.message_type,
         coalesce(m.user_message, '') <> '',
         coalesce(m.bot_message, '') <> ''
  from public.chat_messages m
  where m.client_id = p_client
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limite, 20000), 50000));
end;
$$;

-- AS LINHAS DE ONDE SAI A FRASE REAL DO AGENTE (escolherVerbatim): a resposta
-- da IA mais recente de uma conversa sem resposta humana, a mais recente com
-- pelo menos p_min caracteres, e as linhas anteriores de cada uma (a pergunta
-- e montada com elas). Mesmas regras de respostaDaIa/respostaHumana.
create or replace function public.painel_verbatim(p_client uuid, p_min int default 120, p_fora text[] default '{}')
returns table (phone text, nomewpp text, user_message text, bot_message text, message_type text, created_at timestamptz, conversa_com_humano boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with humano as (
    select distinct h.phone as fone from public.chat_messages h
    where h.client_id = p_client
      and coalesce(h.bot_message, '') <> ''
      and h.message_type in ('manual', 'imported')
  ),
  ia as (
    select m.* from public.chat_messages m
    where m.client_id = p_client
      and btrim(coalesce(m.bot_message, '')) <> ''
      and coalesce(m.message_type, '') not in ('manual', 'imported')
      and not (split_part(m.phone, '@', 1) = any (coalesce(p_fora, '{}')))
  ),
  cand as (
    (select i.* from ia i where i.phone not in (select fone from humano) order by i.created_at desc limit 1)
    union
    (select i.* from ia i where length(btrim(i.bot_message)) >= p_min order by i.created_at desc limit 1)
  ),
  linhas as (
    select c.* from cand c
    union
    select x.* from cand c
    cross join lateral (
      select m.* from public.chat_messages m
      where m.client_id = p_client and m.phone = c.phone and m.created_at < c.created_at
      order by m.created_at desc limit 30
    ) x
  )
  select l.phone, l.nomewpp, l.user_message, l.bot_message, l.message_type, l.created_at,
         l.phone in (select fone from humano)
  from linhas l;
end;
$$;

grant execute on function public.painel_linhas(uuid, int) to authenticated;
grant execute on function public.painel_verbatim(uuid, int, text[]) to authenticated;
revoke execute on function public.painel_linhas(uuid, int) from anon, public;
revoke execute on function public.painel_verbatim(uuid, int, text[]) from anon, public;
