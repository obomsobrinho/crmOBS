# Plano: destino de AVISOS no WhatsApp

Aprovado pelo dono em 29/09/2026, **ainda não executado**. Um agente avalia antes; a execução
começa numa sessão nova. Contexto de produto e regras gerais no `CLAUDE.md` (blocos de handoff,
montagem e n8n).

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

## Riscos e pontos para o avaliador olhar
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
