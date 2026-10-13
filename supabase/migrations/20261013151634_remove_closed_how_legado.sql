-- Remove o legado de closed_how (dono aprovou em 08/10/2026). O codigo publicado
-- (commit f250af2, no ar desde 13/10/2026) grava e le apenas handoffs.solucao;
-- o gatilho de transicao so servia ao app antigo entre a migracao e o deploy.
-- Porque: docs/adr/2026-10-08-help-request-resolution-is-stored.md.

drop trigger if exists handoffs_solucao_do_legado on public.handoffs;
drop function if exists public.handoffs_solucao_do_legado();
alter table public.handoffs drop constraint if exists handoffs_closed_how_check;
alter table public.handoffs drop column if exists closed_how;
