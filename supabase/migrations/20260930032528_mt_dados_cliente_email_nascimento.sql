alter table public.dados_cliente
  add column if not exists email text,
  add column if not exists birth_date date;
comment on column public.dados_cliente.email is 'E-mail do contato, preenchido pelo time no CRM (tela de Clientes, 30/09/2026).';
comment on column public.dados_cliente.birth_date is 'Nascimento do contato, preenchido pelo time no CRM (tela de Clientes, 30/09/2026). CPF ficou de fora de proposito (LGPD).';
grant update (email, birth_date) on public.dados_cliente to authenticated;
