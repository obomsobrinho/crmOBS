# Workflows do n8n versionados

Cópia dos dois workflows que o CRM depende, exportados pela API do n8n em **11/09/2026**.
Servem para **diff** (o que mudou no canal entre duas datas) e **rollback** (restaurar um
workflow que alguém quebrou). Não são fonte de verdade: quem atende é o workflow **ativo** no n8n.

| Arquivo | Workflow | ID no n8n | Nós |
|---|---|---|---|
| `obs-atendimento.json` | OBS Atendimento (o cano do WhatsApp até `POST /api/agent`) | `sWzQUqqrTLcf6F45` | 45 |
| `crm-envio-manual.json` | CRM Envio Manual (envio manual disparado pelo CRM) | `MkDoUMLyZZzZBrjQ` | 11 |

## O que foi tirado antes de gravar

1. **O segredo `x-lookup-secret`.** Ele está em texto puro em **dois** nós HTTP Request do
   OBS Atendimento, `Atendente` e `Sobe mídia recebida` (o plano da demo dizia um só). Nos dois
   o valor virou o marcador **`{{N8N_LOOKUP_SECRET}}`**. É o mesmo valor da variável
   `N8N_LOOKUP_SECRET` do app (Vercel e `.env.local`).
2. **`pinData`** (dado de teste fixado no `Webhook EVO`). Carregava a apikey da Evolution e um
   telefone real dentro do payload de exemplo.
3. **Metadados que mudam a cada save** e só sujam o diff: `versionId`, `activeVersionId`,
   `versionCounter`, `updatedAt`, `shared` (traz o e-mail do dono do projeto), `tags` vazias, etc.
   Ficaram `id`, `name`, `active`, `nodes`, `connections`, `settings` e `meta`.
4. Um telefone pessoal escrito no texto do `Sticky README` (nota de comentário dentro do
   workflow, sem efeito na execução) foi substituído por `[telefone pessoal removido]`.

**Credenciais não vão no export** por construção: o JSON guarda só `id` e `name` da credencial
(`Evo Global`, `Supabase account`, `postgresn8n`, `redisn8n`, `OpenAI account`). Quem importa
precisa selecioná-las de novo se os IDs não existirem na instância de destino.

## Como restaurar

1. No n8n, abra o workflow, menu `...` no canto superior direito, **Import from File**, e escolha
   o JSON. Isso substitui o desenho do workflow aberto (para criar um novo, importe a partir da
   lista de workflows).
2. Abra os nós `Atendente` e `Sobe mídia recebida`, header `x-lookup-secret`, e troque
   `{{N8N_LOOKUP_SECRET}}` pelo valor real. Nunca cole o valor no repositório nem no chat.
3. Confira as credenciais dos nós Evolution, Supabase, Postgres, Redis e OpenAI.
4. **Só então** ative. Regra do projeto: nunca ativar workflow no n8n sem confirmação explícita do
   dono. O `active: true` no JSON é registro do estado exportado, não instrução.

Dois nós do OBS Atendimento estão **desativados de propósito** desde 20/08/2026 e devem
continuar assim ao restaurar: `Pausa IA (handoff)` e `Pausa IA (agendado)` (motivo no
`CLAUDE.md`, seção n8n). O `disabled: true` deles vem no export.

## Como reexportar

Só leitura, pela API REST do n8n (`GET /api/v1/workflows/{id}` com o header `X-N8N-API-KEY`),
mantendo só as chaves listadas acima e trocando o segredo pelo marcador. Antes de commitar,
`git grep` do valor real de `N8N_LOOKUP_SECRET` e de `EVOLUTION_API_KEY` tem que devolver zero.

⚠️ A nota `Sticky README` dentro do workflow está **desatualizada** (fala em número fixo no nó
`Rotas` e em "v2"). É comentário do n8n, exportado como está; o que vale é o `CLAUDE.md`.
