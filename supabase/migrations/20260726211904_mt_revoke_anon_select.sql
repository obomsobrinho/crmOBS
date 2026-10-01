-- CRM não usa mais a role anon; fecha a descoberta via GraphQL/anon.
-- n8n usa service_role (bypassa RLS), então não é afetado.
revoke select on public.chat_messages from anon;
revoke select on public.dados_cliente from anon;
revoke select on public.clients from anon;
revoke select on public.user_clients from anon;
revoke all on public.clients from anon;
revoke all on public.user_clients from anon;
