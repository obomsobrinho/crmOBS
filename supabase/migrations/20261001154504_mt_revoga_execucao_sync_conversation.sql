-- sync_conversation e funcao de GATILHO (security definer): so o banco dispara.
-- Pela API ela ficava chamavel por anon e authenticated.
revoke execute on function public.sync_conversation() from anon, authenticated, public;
