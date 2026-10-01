-- O CRM nunca escreve em clients pelo browser (writes vão por service_role).
-- Remove os grants de escrita frouxos de authenticated (defesa em profundidade).
revoke insert, update, delete, truncate on public.clients from authenticated;
