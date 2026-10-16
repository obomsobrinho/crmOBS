-- APPLIED on 16/10/2026 after the deploy of 5072414. Was: APPLY AFTER THE DEPLOY of the code from 15/10/2026 onward (any time after the same deploy as
-- the drop of clients.account_type). Nothing calls this function since the BETA_ABERTO switch
-- left (docs/adr/2026-10-15-vitalicio-replaces-the-beta-switch.md); it answered "how many
-- companies would be blocked if the beta were closed", a question that no longer exists.
-- The beta is over (owner decision of 16/10/2026), so the function goes away.

drop function if exists public.admin_bloqueados_sem_beta(timestamptz);
