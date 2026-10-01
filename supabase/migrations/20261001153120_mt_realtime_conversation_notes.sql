-- ContactNotes escuta conversation_notes, que nunca esteve na publicacao: o
-- canal das notas era recusado em silencio (a nota de um colega so aparecia
-- recarregando). REPLICA FULL pelo mesmo motivo de pipeline_stages.
alter table public.conversation_notes replica identity full;
alter publication supabase_realtime add table public.conversation_notes;
