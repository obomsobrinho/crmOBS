-- Plano Free (dono, 14/11/2026): o app le o banco so pelo PostgREST (supabase-js) e nunca pelo
-- GraphQL (nenhum uso em app, lib, components ou n8n). A extensao pg_graphql reconstroi o schema
-- dela a cada DDL (event triggers graphql_watch_ddl e graphql_watch_drop), somando CPU a cada
-- recarga do cache do PostgREST (1.754 recargas de 734 ms desde 26/06). Desligada; o endpoint
-- /graphql/v1 deixa de responder. Religar: `create extension pg_graphql;`.

drop extension if exists pg_graphql;
