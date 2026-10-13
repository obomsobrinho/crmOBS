-- P1 item 5 (orientacao vira regra): marca no pedido que a orientacao dele foi
-- salva como regra do agente, para o detalhe mostrar "Salva como regra" depois.
-- Gravada so pela rota do servidor (service_role); o navegador so le.
-- Porque: docs/adr/2026-10-13-orientation-saved-as-agent-rule.md.

alter table public.handoffs add column if not exists regra_salva_em timestamptz;
comment on column public.handoffs.regra_salva_em is
  'Quando a orientacao deste pedido virou regra salva do agente (agent_config.regrasSalvas). Escrita so por service_role.';
grant select (regra_salva_em) on public.handoffs to authenticated;
revoke all (regra_salva_em) on public.handoffs from anon;
