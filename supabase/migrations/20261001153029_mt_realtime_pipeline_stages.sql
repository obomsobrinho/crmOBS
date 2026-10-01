-- O Pipeline escuta pipeline_stages, e a tabela nunca esteve na publicacao do
-- realtime: o Supabase recusava a assinatura e derrubava o CANAL INTEIRO do
-- quadro (conversas inclusive). REPLICA FULL para a RLS do realtime avaliar a
-- linha antiga em update/delete.
alter table public.pipeline_stages replica identity full;
alter publication supabase_realtime add table public.pipeline_stages;
