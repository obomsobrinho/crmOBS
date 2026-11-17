-- Plano Free (dono, 14/11/2026): `uqc_config` e `uqc_votos` sao de outro projeto (uma votacao),
-- foram criadas a mao neste banco, sem migracao e sem uso no codigo (2 linhas de config, 0 votos).
-- Qualquer usuario logado de qualquer empresa lia a config e inseria votos. Apagadas.

drop table if exists public.uqc_votos;
drop table if exists public.uqc_config;
