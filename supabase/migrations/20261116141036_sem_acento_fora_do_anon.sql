-- `sem_acento` (a busca sem acento das listas) era executavel por `anon` e por PUBLIC, contra a
-- regra de nada para `anon`. As funcoes de lista sao SECURITY INVOKER, entao `authenticated` e
-- `service_role` continuam com o grant explicito.

revoke execute on function public.sem_acento(text) from public, anon;
grant execute on function public.sem_acento(text) to authenticated, service_role;
