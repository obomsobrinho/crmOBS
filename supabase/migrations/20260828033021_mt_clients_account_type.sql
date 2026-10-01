-- Marca QUE TIPO DE CONTA é cada tenant, para o beta gratuito.
--
-- Hoje nada no banco separa um testador de uma conta interna: OBM e Loja Teste
-- estão em `subscription_status = 'active'` com `trial_ends_at` nulo, que é
-- exatamente o estado em que um testador ficaria. Sem esta coluna não dá para
-- medir o uso do beta sem misturar o dado do próprio dono, não existe consulta
-- que responda "quem eu converto quando o beta acabar", e no dia em que a
-- cobrança ligar uma conta beta esquecida passa despercebida.
--
-- ⚠️ NULLABLE E SEM DEFAULT de propósito. Null quer dizer "não classificado".
-- Chutar um default para cadastro novo inventaria um fato: uma conta que entrou
-- sozinha pelo `/cadastro` não é beta nem interna até alguém dizer que é.
--
-- ⚠️ ISTO IDENTIFICA, NÃO AUTORIZA. `accessState` (lib/billing.ts) continua
-- decidindo acesso só por `subscription_status` e `trial_ends_at`. Misturar
-- identificação com autorização é como um cliente pagante acaba trancado fora.
alter table public.clients
  add column account_type text;

alter table public.clients
  add constraint clients_account_type_check
  check (account_type is null or account_type in ('interno', 'beta', 'pago'));

comment on column public.clients.account_type is
  'Tipo da conta: interno (nossa), beta (testador gratuito) ou pago. NULL = nao classificado. Identifica, nao autoriza: o acesso sai de subscription_status/trial_ends_at.';

-- Backfill das duas contas internas conhecidas. `testesnovo` fica NULL de
-- propósito: é conta de teste do cadastro público e ninguém decidiu o que ela é.
update public.clients set account_type = 'interno' where name in ('OBM', 'Loja Teste');

-- Escrita só por service_role, como o resto de `clients`: `authenticated` não
-- tem UPDATE na tabela (mt_clients_revoke_authenticated_writes), então não há
-- grant novo a revogar. A leitura já vem da policy de tenant que existe.
