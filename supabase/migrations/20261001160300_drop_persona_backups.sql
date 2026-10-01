-- R-54, decisao do dono (2026-10-01): exportar os backups de persona para o
-- repositorio e apagar do banco. Eles guardam prompt de tenant em public, a um
-- grant esquecido de vazar (foi o que aconteceu com o de 20/08).
--
-- O export, conferido por md5 contra o banco, esta em
--   supabase/backups/_persona_backup_20260820.sql  (1 linha, OBM)
--   supabase/backups/_persona_backup_20260822.sql  (2 linhas, Loja Teste e OBM)
-- e cada arquivo recria a tabela se for preciso restaurar.
--
-- APLICAR SO DEPOIS de os dois arquivos estarem commitados.
drop table if exists public._persona_backup_20260820;
drop table if exists public._persona_backup_20260822;
