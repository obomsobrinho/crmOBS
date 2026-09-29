# Plano: destino de AVISOS no WhatsApp

Aprovado pelo dono em 29/09/2026 e **executado no mesmo dia** (commit "Avisos no WhatsApp do
time"). O que saiu diferente dos passos abaixo: a "Revisão de 29/09/2026" no fim, o link "Abrir"
que leva à página de pedidos (`docs/plano-pedidos.md`) e a trava do telefone de teste (DDD 00).
Contexto de produto e regras gerais no `CLAUDE.md` (blocos de handoff, montagem e n8n).

## O problema

Quando a IA pede ajuda (pedido entra na fila `handoffs`), ninguém fica sabendo se não estiver com o
CRM aberto. O dono trata como **obrigatório para o beta**: advogado, barbeiro e pediatra não vivem
na tela, e o cliente fica esperando sem ninguém ver.

Estado hoje:
- `clients.notify_group_jid` existe e o n8n (workflow "OBS Atendimento", produção) já manda para
  ele: `Notifica grupo` (reunião marcada, `action=agendar`) e `Avisa falha no grupo` (o cérebro
  falhou e o cliente recebeu só o aviso de espera).
- No `action=pausar` (pedido de ajuda) o n8n cai em `Pausa IA (handoff)`, desativado desde
  20/08/2026: **não avisa ninguém**.
- A tela pede o JID cru (`120363…@g.us`) em `components/agente/campos.tsx` (~linha 513), só com o
  objetivo "agendar" marcado, e só no `/agente`. Na montagem não existe campo.
- Rota de gravação: `app/api/clients/[id]/notify-target/route.ts` (dono-only, service_role).

## Decisões do dono (não reabrir)

1. **UM destino só, "Avisos"**, para tudo: pedido de ajuda, reunião marcada e "a IA não
   respondeu". Quem quiser separar público usa um grupo.
2. Destino = **número** (DDI 55 automático) **ou grupo** (escolhido numa lista, nunca JID digitado).
3. **Nunca o número do próprio agente** (não faz sentido e o celular não toca).
4. **Avisa só em pedido de ajuda NOVO** (o mesmo `entraNaFila` que abre a linha em `handoffs`).
   Insistência no mesmo assunto e mensagem normal não avisam.
5. Configurado no **passo 4 da montagem** (depois de conectar, porque o "Mandar teste" e a lista de
   grupos exigem o WhatsApp ligado) e no `/agente`.
6. **Obrigatório para a PRIMEIRA ativação.**
7. **A IA ignora o número de avisos**, por regra no app (e não no n8n).
8. **Zero mudança no n8n e zero migração**: `notify_group_jid` vira o destino de Avisos (nome da
   coluna fica; semântica muda para "número OU grupo").

## Passos

### 1. Envio pela Evolution (`lib/evolution.ts`, server-only)
- `sendText(instance, jid, text)` (`POST /message/sendText/{instance}`).
- `fetchGroups(instance)` (`GET /group/fetchAllGroups/{instance}?getParticipants=false`), devolve
  `{ jid, nome }`.
- `ownerNumber(instance)`: o número conectado (`/instance/fetchInstances?instanceName=`, campo
  `ownerJid`). Conferir o formato na Evolution 2.3.7 antes de confiar; se não vier, a validação
  do item 2 não bloqueia (dado faltando não derruba quem configura, mesma regra do `publish`).
- ⚠️ Consultar a doc da Evolution (context7) para os três endpoints antes de codar.

### 2. Rota `notify-target` (ampliar a que existe)
- Aceita `{ numero }` (normaliza para dígitos, prefixa 55 se vier com 10 ou 11 dígitos, grava
  `<digitos>@s.whatsapp.net`) ou `{ grupo: jid }` (tem que terminar em `@g.us`).
- Recusa (400) se o número for o dono da instância (`ownerNumber`).
- `GET` novo na mesma rota ou irmã: lista os grupos (`fetchGroups`), dono-only.
- `POST .../notify-target/teste`: manda "Teste de aviso do seu agente. Se chegou, está certo." ao
  destino salvo. Dono-only.

### 3. Aviso no pedido de ajuda novo (`lib/agent-turn.ts`)
- No bloco `if (entraNaFila)` do ramo de produção (fora do `dryRun`), depois de gravar a linha em
  `handoffs`: se o tenant tem `notify_group_jid` e `evolution_instance`, `sendText` com:
  ```
  🙋 A IA pediu sua ajuda
  Cliente: {nome ou telefone} (wa.me/{digitos})
  Pedido: {summary}
  Abrir: {APP_URL}/inbox/{encodeURIComponent(phone)}
  ```
  O param de `/inbox/[id]` é o JID do WhatsApp (ver `app/(app)/inbox/[id]/page.tsx`).
- **Best-effort e nunca lança**, como `logTurn`: falha no aviso não pode derrubar a resposta ao
  cliente. Registrar no diagnóstico (`diagnostics.avisoEnviado?: boolean`).
- `APP_URL`: não existe env para isso hoje. Criar `APP_URL` server-only (Vercel + `.env.example`)
  **perguntando o valor ao dono**, não inventar; sem ela, a linha "Abrir" sai fora da mensagem.
- Não disparar na retomada (ela nunca abre pedido, já é garantido pelo `!retomada`).

### 4. A regra do número de avisos
- `processTurn`: se `phone === notify_group_jid` (comparar só os dígitos), devolve `silentTurn`
  antes do modelo e do RAG (flag nova `diagnostics.numeroDeAvisos`). Motivo: o aviso sai do número
  do agente, a Evolution devolve como `fromMe` e o n8n trata como conversa; se alguém do time
  responder, sem a regra a IA atenderia o time como cliente.
- Esconder esse número de Conversas (`components/ContactSidebar.tsx`), Pipeline
  (`app/(app)/pipeline/page.tsx` / `PipelineBoard`) e Painel (`app/(app)/painel/page.tsx`,
  `lib/metrics.ts`). Um helper puro só (`ehNumeroDeAvisos(phone, jid)` em `lib/inbox.ts`), usado
  nos três, para não virar três regras.
- O n8n segue gravando essas mensagens em `chat_messages`, e isso é aceito.

### 5. Ativação (`lib/onboarding.ts` + `app/api/clients/[id]/publish/route.ts`)
- `publishBlockers` ganha `hasNotify` e a falta "definir para onde vão os avisos".
- Vale só na primeira ativação (como o resto). A OBM, já ativa, não é bloqueada.

### 6. Telas
- **Componente único** `components/agente/AvisosCampo.tsx` (as duas superfícies usam o mesmo, regra
  "UM formulário, duas composições"): alternância Número / Grupo, campo de telefone ou lista de
  grupos, "Mandar teste" com `carregando`, erro do "é o número do agente" embaixo do campo.
  Sem WhatsApp conectado: explica que a lista de grupos e o teste aparecem depois de conectar, e o
  número pode ser digitado mesmo assim.
- **Montagem, passo 4** (`components/MontagemWizard.tsx`): o bloco aparece depois do
  `onConectado`, junto da lista "Ao ativar". O "Ativar o agente" fica desabilitado com a razão
  escrita enquanto não houver destino salvo.
- **`/agente`** (`components/agente/campos.tsx`): o `SubBloco` "Grupo de WhatsApp para avisar" vira
  "Avisos", **sempre visível** (hoje só com "agendar"), usando o componente novo. Sem destino, aviso
  âmbar embaixo do campo ("sem isso, ninguém fica sabendo quando a IA pedir ajuda").
- Texto: nunca travessão; público misto (não assumir consulta, paciente ou agendamento).
- Previews: `/design/montagem?passo=conectar&conectado=1` e `/design/agente` mostram o bloco.

### 7. Testes
- `sem-login`: bloco no passo 4 e no `/agente`, Ativar desabilitado sem destino, texto do aviso.
- `logado`: normalização e recusas da rota (400 para JID inválido; o caso "número do agente" só se
  a Evolution devolver o dono); `processTurn` silencioso para o número de avisos (via
  `/api/agent` com `x-lookup-secret`, no tenant de teste, telefone impossível); número de avisos
  fora da lista de Conversas.
- Unitário puro (se couber num spec): `ehNumeroDeAvisos` e a normalização do número.
- **Não** testar o envio real em e2e (mandaria WhatsApp). O envio de verdade é o teste do dono com
  chip.
- Fechar com a skill `fechar-entrega` (as duas suítes). `test:e2e:ia` não é necessário: a base do
  prompt não muda.

### 8. Docs
- `CLAUDE.md`: glossário de `clients` (`notify_group_jid` = destino de Avisos, número ou grupo),
  bloco de montagem (passo 4 e o bloqueio), bloco de handoff (quem é avisado), e remover a frase
  "ninguém é avisado quando abre handoff (limitação assumida)" de `docs/handoff.md`.

## Revisão de 29/09/2026 (aprovada pelo dono; vale sobre os passos acima onde discordar)

1. **Só `pausar` avisa pelo app.** O `entraNaFila` também é verdade em `agendar`, e o n8n já manda
   "Notifica grupo" para o mesmo destino em todo `agendar`: avisar nos dois daria aviso em dobro. A
   reunião marcada continua com o n8n (zero mudança nele). ⚠️ Anotado, sem decisão: o texto do n8n
   é "🚨 Novo Lead" e dispara a cada turno de agendamento, não só no primeiro; trocar é mexer no n8n.
2. **Enviar com `after()` do `next/server`** (conferido em
   `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`): o aviso nasce
   dentro do `/api/agent`, que o n8n espera responder, e chamar a Evolution ali atrasaria a resposta
   ao cliente.
3. **URL do "Abrir":** usar `VERCEL_PROJECT_PRODUCTION_URL` (variável automática da Vercel) em vez de
   criar `APP_URL`. Sem ela (local), a linha "Abrir" sai fora da mensagem.
4. `lib/evolution.ts` **já existe** (criar instância, conectar, estado, QR): o passo 1 amplia, não cria.
5. `ehNumeroDeAvisos` vale em **toda** contagem e lista (inclusive qualquer contador de
   "Precisa de você"), não só nas três telas do passo 4. Em grupo o problema não existe: o nó `Rotas`
   do n8n recusa `@g.us`.
6. A OBM já tem destino (um grupo, `@g.us`): segue valendo sem migração.

## Riscos e pontos para o avaliador olhar
- ✅ **Resolvido com evidência (29/09/2026): o aviso NÃO volta pelo n8n.** No teste ao vivo de
  28/09, as duas mensagens enviadas pela API ao número do dono (21:10:05 e 21:10:36 UTC) não geraram
  nenhuma execução do "OBS Atendimento". Mas o texto abaixo está errado num ponto: o nó `Cria Lead`
  **faz** INSERT em `dados_cliente` quando o contato não existe, e toda mensagem enviada pelo celular
  do agente que não seja "Atendimento finalizado" cai em `Pausar IA (Franck digitou)`. Não afeta o
  aviso (que não chega ao n8n), só vale saber.
- **`fromMe` do aviso no n8n:** o nó `Pausar IA (Franck digitou)` faz `update` em `dados_cliente`
  do número de avisos; se a linha não existe, é no-op. Confirmar lendo `n8n/obs-atendimento.json`
  que nenhum nó faz INSERT do contato nesse caminho.
- **Enviar do número do agente para um número novo** conta como mensagem ativa. Volume é baixo
  (um por pedido de ajuda) e o destino é do próprio time, então o risco de bloqueio é pequeno, mas
  não zero.
- **`ownerJid`** pode não vir em instância antiga; a validação "não é o número do agente" vira
  melhor esforço nesse caso.
- **Grupo:** o número do agente precisa estar no grupo. A lista só mostra grupos em que ele está,
  então isso se resolve sozinho.
