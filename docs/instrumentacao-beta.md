# Instrumentação do beta

Consultas para acompanhar os testadores do beta gratuito. **Não existe tela para
isso, e é decisão:** são cinco a dez contas e um leitor só (o dono). Uma página
interna para dez linhas seria mais uma tela para o passo de redesenho repintar,
e mais uma superfície para manter.

**Como rodar:** no SQL Editor do Supabase, ou pelo MCP do Supabase. Todas as
consultas rodam como `postgres`/`service_role`; nenhuma delas passa pela RLS.

**Quem entra:** só quem tem `clients.account_type = 'beta'`. Marcar é manual, e
também é decisão (com cinco a dez contas, uma tela de administração custaria mais
do que resolve):

```sql
update public.clients set account_type = 'beta' where name = 'Nome da Empresa';
```

Os valores possíveis são `interno`, `beta` e `pago`, com CHECK no banco.
**`null` quer dizer "não classificado"**, e a coluna nasceu sem default de
propósito: uma conta que entrou sozinha pelo `/cadastro` não é beta nem interna
até alguém dizer que é. ⚠️ **`account_type` IDENTIFICA, NÃO AUTORIZA.** Quem
decide acesso é `accessState` (`lib/billing.ts`), por `subscription_status` e
`trial_ends_at`, e continua assim.

---

## ⚠️ A regra de "resposta da IA" é uma só, e mora no código

`lib/mensagem.ts` define, e o SQL daqui **copia essa regra à risca**:

```ts
// resposta da IA
!!m.bot_message && m.message_type !== "manual" && m.message_type !== "imported"
// resposta de gente
!!m.bot_message && (m.message_type === "manual" || m.message_type === "imported")
```

**Não é "message_type <> 'manual'".** `imported` também passa nesse teste, e foi
exatamente esse erro que fez 84 das 94 linhas da OBM contarem como trabalho da
IA, quando eram respostas que o dono digitou à mão no WhatsApp antes de a IA
existir. Duas definições do mesmo número é como um produto começa a mentir.

Duas traduções para SQL que não são opcionais:

- **`is distinct from` e não `<>`.** Em SQL, `message_type <> 'manual'` é NULL
  quando a coluna é NULL, e a linha some da contagem. No JavaScript,
  `message_type !== "manual"` é `true` nesse caso. `is distinct from` é o
  operador que dá a mesma resposta que o módulo. Hoje não há `message_type` nulo
  em nenhum tenant (verificado em 28/08/2026), mas a consulta não pode depender
  disso.
- **Dia é em `America/Sao_Paulo`**, nunca em UTC. Em UTC a mensagem da noite cai
  no dia seguinte e o testador ganha um dia de uso que não teve.

---

## 1. Publicaram o agente? E onde pararam?

Responde "quem chegou até o fim da montagem" e, para quem não chegou, em que
passo travou. Os sinais são os mesmos que `lib/onboarding.ts` usa.

```sql
select
  c.name,
  c.evolution_instance is not null      as conectou,
  c.agent_config_updated_at is not null as configurou,
  c.onboarding_tested_at is not null    as testou,
  c.agent_published_at is not null      as publicou,
  c.agent_enabled,
  case
    when c.agent_published_at is not null and c.agent_enabled then 'no ar'
    when c.agent_published_at is not null then 'publicou e desligou'
    when c.agent_config_updated_at is not null and c.evolution_instance is not null
      then 'parou em: conectar e ativar (instância criada)'
    when c.agent_config_updated_at is not null then 'parou em: testar ou conectar'
    else 'parou em: quem atende'
  end as onde_parou,
  c.agent_published_at
from public.clients c
where c.account_type = 'beta'
order by c.agent_published_at nulls first, c.name;
```

**Como ler.** ⚠️ A ordem da montagem foi invertida em 24/09/2026 (quem atende, o
que ele sabe, testar, conectar e ativar), e o `case` acima segue a ordem nova.
"quem atende" é a conta que nunca saiu do zero. "conectar e ativar (instância
criada)" é quem pediu o QR ou o código e não terminou: ou a conexão não
funcionou, ou conectou e não ativou. `conectou` diz só que a instância foi
criada, não que o número foi lido. Conta de antes da inversão pode ter conectado
sem configurar, e cai em "quem atende".
`publicou e desligou` é o sinal mais grave da lista: alguém foi ao ar, viu algo
de que não gostou e desligou a IA. Vale a ligação no mesmo dia.

⚠️ `testou` é dado, **não é pré-requisito**: desde 28/08/2026 testar não trava
mais a ativação.

## 2. Quantos dias eles de fato usaram?

Dias distintos com pelo menos uma mensagem, nas últimas 2 e 4 semanas.

```sql
select
  c.name,
  count(distinct (m.created_at at time zone 'America/Sao_Paulo')::date)
    filter (where m.created_at >= now() - interval '14 days') as dias_ativos_14,
  count(distinct (m.created_at at time zone 'America/Sao_Paulo')::date)
    filter (where m.created_at >= now() - interval '30 days') as dias_ativos_30
from public.clients c
left join public.chat_messages m
       on m.client_id = c.id
      -- ⚠️ Fora o histórico importado. Ele entra no banco com a data ORIGINAL
      -- da mensagem (verificado: linhas `imported` de 2025 na OBM), então um
      -- tenant que importou conversa recente apareceria com dias de uso que
      -- nunca teve. Importado é o passado dele, não o uso do produto.
      and m.message_type is distinct from 'imported'
where c.account_type = 'beta'
group by c.id, c.name
order by dias_ativos_14 desc, c.name;
```

**Como ler.** `dias_ativos_14 = 0` com `dias_ativos_30 > 0` é a conta que parou
esta quinzena, e é a que precisa de contato. Zero nos dois é conta que nunca
começou, e aí a pergunta certa está na consulta 1, não aqui.

## 3. A IA está segurando, ou o time assumiu?

```sql
select
  c.name,
  count(*) filter (
    where m.bot_message is not null
      and m.message_type is distinct from 'manual'
      and m.message_type is distinct from 'imported'
  ) as respostas_ia,
  count(*) filter (
    where m.bot_message is not null and m.message_type = 'manual'
  ) as respostas_time,
  -- Mostrado à parte, e FORA da porcentagem: é gente respondendo, mas antes de
  -- a IA existir. Somar aqui inflaria o trabalho do time do mesmo jeito que
  -- somar em `respostas_ia` inflava o da IA.
  count(*) filter (
    where m.bot_message is not null and m.message_type = 'imported'
  ) as respostas_importadas,
  round(
    100.0 * count(*) filter (
      where m.bot_message is not null
        and m.message_type is distinct from 'manual'
        and m.message_type is distinct from 'imported')
    / nullif(count(*) filter (
        where m.bot_message is not null
          and m.message_type is distinct from 'imported'), 0)
  ) as pct_ia
from public.clients c
left join public.chat_messages m
       on m.client_id = c.id
      and m.created_at >= now() - interval '30 days'
where c.account_type = 'beta'
group by c.id, c.name
order by pct_ia nulls last;
```

**Como ler.** `pct_ia` baixo é o testador que está usando o produto como um
WhatsApp Web caro: a IA está no ar, mas quem responde é ele. Ou o agente está
mal configurado, ou não confiam nele. `pct_ia` nulo quer dizer que não houve
resposta nenhuma no período, o que é a consulta 2 falando de novo.

## 4. Sumiram?

```sql
select
  c.name,
  max(m.created_at) as ultima_mensagem,
  case when max(m.created_at) is null then null
       else floor(extract(epoch from now() - max(m.created_at)) / 86400)::int
  end as dias_em_silencio
from public.clients c
left join public.chat_messages m
       on m.client_id = c.id
      and m.message_type is distinct from 'imported'
where c.account_type = 'beta'
group by c.id, c.name
order by dias_em_silencio desc nulls first;
```

**Como ler.** `dias_em_silencio` nulo é conta que nunca teve mensagem nenhuma.
Acima de 7 dias, num negócio que atende no WhatsApp todo dia, é abandono e não
férias.

⚠️ Silêncio aqui é silêncio **no CRM**. Se a conexão caiu, o negócio segue
recebendo mensagem no WhatsApp e nós não vemos nada: os dois casos produzem o
mesmo número. Hoje não há como distinguir sem consultar a Evolution.

## 5. O que os testadores escreveram

Único jeito de ler a tabela `feedback`: ela não tem policy de SELECT e
`authenticated` não tem grant de leitura, então nem o próprio autor relê o que
mandou pelo browser.

```sql
select
  f.created_at,
  c.name as conta,
  c.account_type,
  u.email as quem,
  f.path,
  f.message
from public.feedback f
join public.clients c on c.id = f.client_id
left join auth.users u on u.id = f.user_id
order by f.created_at desc
limit 50;
```

**Como ler.** `path` é metade do relato: "não consigo responder" dito no
`/inbox` e dito no `/agente` são dois problemas diferentes.

⚠️ **NINGUÉM É AVISADO quando um relato chega.** Não há e-mail, não há
notificação, não há mensagem no WhatsApp. O feedback só existe quando alguém
roda esta consulta. É limitação assumida (notificar exigiria mexer no n8n, que é
produção), e o preço dela é real: um relato urgente pode ficar dias parado.
Rodar isto junto com as outras quatro, na mesma sessão, é o que substitui o
aviso.
