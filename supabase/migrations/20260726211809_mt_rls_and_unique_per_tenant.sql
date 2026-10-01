-- Unicidade de telefone passa a ser por tenant
alter table public.dados_cliente drop constraint if exists dados_cliente_telefone_key;
alter table public.dados_cliente add constraint dados_cliente_client_telefone_key unique (client_id, telefone);

-- Remove acesso anon (CRM passa a ser autenticado)
drop policy if exists "anon read chat_messages" on public.chat_messages;
drop policy if exists "anon read dados_cliente" on public.dados_cliente;
drop policy if exists "anon toggle atendimento_ia" on public.dados_cliente;
revoke update (atendimento_ia) on public.dados_cliente from anon;

-- chat_messages: leitura só do próprio tenant (authenticated)
drop policy if exists "tenant read chat_messages" on public.chat_messages;
create policy "tenant read chat_messages" on public.chat_messages
  for select to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()));

-- dados_cliente: leitura do próprio tenant
drop policy if exists "tenant read dados_cliente" on public.dados_cliente;
create policy "tenant read dados_cliente" on public.dados_cliente
  for select to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()));

-- dados_cliente: update só da coluna atendimento_ia e só no próprio tenant
revoke update on public.dados_cliente from authenticated;
grant update (atendimento_ia) on public.dados_cliente to authenticated;
drop policy if exists "tenant toggle atendimento_ia" on public.dados_cliente;
create policy "tenant toggle atendimento_ia" on public.dados_cliente
  for update to authenticated
  using (client_id in (select client_id from public.user_clients where user_id = auth.uid()))
  with check (client_id in (select client_id from public.user_clients where user_id = auth.uid()));
