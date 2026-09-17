# Workflows do n8n versionados

Cópia dos dois workflows que o CRM depende, exportados pela API do n8n em **17/09/2026**.
Servem para **diff** (o que mudou no canal entre duas datas) e **rollback** (restaurar um
workflow que alguém quebrou). Não são fonte de verdade: quem atende é o workflow **ativo** no n8n.

| Arquivo | Workflow | ID no n8n | Nós |
|---|---|---|---|
| `obs-atendimento.json` | OBS Atendimento (o cano do WhatsApp até `POST /api/agent`) | `sWzQUqqrTLcf6F45` | 50 |
| `crm-envio-manual.json` | CRM Envio Manual (envio manual disparado pelo CRM) | `MkDoUMLyZZzZBrjQ` | 11 |

## O que foi tirado antes de gravar

1. **O segredo `x-lookup-secret`.** Ele está em texto puro em **dois** nós HTTP Request do
   OBS Atendimento, `Atendente` e `Sobe mídia recebida` (o plano da demo dizia um só). Nos dois
   o valor virou o marcador **`{{N8N_LOOKUP_SECRET}}`**. É o mesmo valor da variável
   `N8N_LOOKUP_SECRET` do app (Vercel e `.env.local`).
2. **`pinData`** (dado de teste fixado no `Webhook EVO`). Carregava a apikey da Evolution e um
   telefone real dentro do payload de exemplo. ✅ Em 17/09/2026 o dono já tinha limpado no n8n:
   a chave existe mas vem vazia (`{}`). O export continua descartando ela de propósito, porque
   basta alguém fixar um payload novo para o segredo voltar.
3. **Metadados que mudam a cada save** e só sujam o diff: `versionId`, `activeVersionId`,
   `versionCounter`, `updatedAt`, `shared` (traz o e-mail do dono do projeto), `tags` vazias, etc.
   Ficaram `id`, `name`, `active`, `nodes`, `connections`, `settings` e `meta`.
4. Um telefone pessoal escrito no texto do `Sticky README` (nota de comentário dentro do
   workflow, sem efeito na execução) foi substituído por `[telefone pessoal removido]`.

**Credenciais não vão no export** por construção: o JSON guarda só `id` e `name` da credencial
(`Evo Global`, `Supabase account`, `postgresn8n`, `redisn8n`, `OpenAI account`). Quem importa
precisa selecioná-las de novo se os IDs não existirem na instância de destino.

## O que mudou em 17/09/2026 (canal endurecido)

O workflow saiu de 45 para **50 nós**, numa janela com o dono presente. Quatro mudanças:

1. **Domínio novo.** `Atendente` e `Sobe mídia recebida` apontavam para `crm-obs.vercel.app`,
   que voltou **404** depois que o dono trocou o domínio. Os dois passaram a apontar para
   `https://atendimento.obomsobrinho.com.br`. ⚠️ Enquanto durou, o agente não respondeu ninguém
   **e a mensagem do cliente não era gravada**, porque a gravação vinha depois da chamada.
2. **Mensagem de grupo é recusada.** O nó `Rotas` ganhou a condição de o telefone não conter
   `@g.us`. Antes, a única condição era o telefone existir, e JID de grupo satisfazia isso.
3. **Dedupe por `key.id`.** O nó `Dados` passou a extrair `messageId`, e entraram dois nós entre
   `Rotas` e `Get Lead`: `Dedupe (Redis)` (`incr` em `dedupe:{messageId}`, TTL 300s) e
   `Primeira entrega?`. Segue só quando o contador é 1. ⚠️ A condição tem um **ou**: se
   `messageId` vier vazio, passa. Sem isso, toda mensagem sem id colidiria na mesma chave e só a
   primeira de cada 5 minutos seria atendida.
4. **Fallback quando o cérebro falha.** O `Atendente` ganhou saída de erro, com três nós:
   `Salva user (IA falhou)` (grava a mensagem do cliente em `chat_messages`, com a frase de
   espera como `bot_message`), `Fallback ao cliente` ("Recebi sua mensagem, já te respondo por
   aqui.") e `Avisa falha no grupo`. Os três com `onError: continueRegularOutput`, para um erro
   no aviso não engolir a gravação.

**Provado por webhook simulado**, com as execuções no n8n: grupo morre no `Rotas` com saída zero
(740); segunda entrega do mesmo `key.id` morre no `Primeira entrega?` (742); fallback grava,
responde e avisa (743); e o canal restaurado responde de verdade (744).

⚠️ **Defeito conhecido, não corrigido:** o nó `Notifica grupo` (o aviso de lead novo) escreve
`\n` literal no texto, então as quebras de linha aparecem cruas no WhatsApp. O
`Avisa falha no grupo` nasceu com o mesmo defeito e foi corrigido; o antigo ficou como está,
porque mexer nele é mudar texto que o dono lê todo dia.

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
