# Plano: montagem invertida (configurar e testar antes de conectar)

Decidido pelo dono em 24/09/2026. Escrito para ser executado por uma sessão nova, depois de um
`/clear`: quem pegar este plano lê ele inteiro, o `CLAUDE.md` (bloco "Montagem e publicação") e
então executa.

## A decisão

**Ordem nova do assistente de `/montagem`:**

| # | Passo (key) | Título | O que faz |
|---|---|---|---|
| 1 | `quem` | Quem atende | igual a hoje (modelo do segmento, empresa, agente, tom) |
| 2 | `sabe` | O que ele sabe | igual a hoje; ao SAIR dele acontece a única gravação no servidor |
| 3 | `testar` | Testar | a bancada de teste, com o agente de verdade e sem WhatsApp |
| 4 | `conectar` | Conectar e ativar | conectar o WhatsApp (número ou QR) e, depois de conectado, a chave de ativar |

**Por quê (palavras do dono, resumidas):** a pessoa tem medo de conectar o WhatsApp e o agente já
sair respondendo antes de ela terminar de configurar. Tecnicamente isso NÃO acontece (o
`processTurn` fica mudo enquanto `agent_published_at` é nulo, e o n8n só grava a mensagem), mas a
tela nunca disse isso, e pedir o WhatsApp no primeiro passo passa exatamente essa impressão. Com a
ordem nova, a pessoa investe primeiro no que é fácil (nome, o que a empresa faz, conversar com o
agente), vê o agente funcionando, e só no fim liga o número e decide ativar.

**Testar vem ANTES de conectar, de propósito.** A bancada (`/api/playground`, `dryRun`) não precisa de
WhatsApp. Testar depois de conectar só faria sentido pelo WhatsApp de verdade, e aí o agente já
estaria respondendo, que é o medo.

## Estado de hoje (ponto de partida)

- `lib/onboarding.ts` (módulo puro): `PassoMontagem = "conectar" | "quem" | "sabe" | "ativar"`,
  `PASSOS_MONTAGEM` (títulos e a frase "porque" de cada passo), `montagemState()` (onde retomar:
  sem instância vai para `conectar`, sem configuração vai para `quem`, senão `ativar`) e
  `publishBlockers()` (falta conectar = `!hasInstance`, falta configurar = `!agentConfigured`).
- `components/MontagemWizard.tsx`: estado `passo`; o passo inicial força `conectar` quando
  `!hasInstance` ("conectar é piso duro"); `avancar()` grava no servidor ao sair de `sabe` e limpa o
  rascunho; `ativar()` faz `PUT /api/clients/[id]/publish` com `{ enabled: true }` e vai para
  `/painel`; o passo `ativar` junta a bancada (`AgentTestDrawer`) e a lista "Ao ativar, o que
  acontece". No passo `conectar` não existe "Continuar": quem avança é a conexão (`onConectado`).
- `components/ConnectWhatsApp.tsx` com `enquadramento="passo"` e `onConectado`: QR ou código pelo
  número (padrão no celular desde 24/09/2026), polling de `whatsapp-status`, tela "Tudo pronto!" e
  chama `onConectado` depois de 2,5s.
- `components/agente/rascunho.ts`: rascunho no navegador com `{ config, passo }`.
- `app/montagem/page.tsx`: guardas (bloqueada, atendente, já publicou, modo avançado) e
  `passoDoServidor={client.montagem.passo}`.
- `app/design/montagem/page.tsx`: preview sem banco, `?passo=` abre um passo, padrão `conectar`.
- Usos de `publishBlockers`: `app/api/clients/[id]/publish/route.ts` (o gate de verdade, só na
  primeira ativação), `app/(app)/agente/page.tsx`, `app/design/onboarding/page.tsx`.

## O que mudar

### 1. `lib/onboarding.ts`
- `PassoMontagem = "quem" | "sabe" | "testar" | "conectar"`, nessa ordem em `PASSOS_MONTAGEM`.
- Títulos e "porque" (regras de escrita: sem travessão, e nenhuma palavra de segmento, porque o
  público é misto: nada de consulta, paciente, agendamento, produto, processo):
  - `quem`: "Quem atende". Porque: manter o texto de hoje.
  - `sabe`: "O que ele sabe". Porque: manter o texto de hoje.
  - `testar`: "Testar". Porque, sugestão: "Converse com ele como se fosse alguém chamando no
    WhatsApp. Nada sai daqui e ninguém recebe mensagem."
  - `conectar`: "Conectar e ativar". Porque, sugestão: "Ligue o número que vai atender. Conectar não
    liga o agente: ele só começa a responder quando você ativar."
- `montagemState()`: sem configuração salva vai para `quem`; configurado vai para `conectar` (testar
  é opcional e não tem sinal próprio; quem parou no meio do teste é o rascunho que sabe). Instância
  deixa de ser piso: conectar é o ÚLTIMO passo.
- `publishBlockers()`: mesma regra (conectar e configurar). Ver o item 5 sobre "conectado de verdade".
- Atualizar o comentário do topo do arquivo com a data e o motivo da inversão.

### 2. `components/MontagemWizard.tsx`
- Passo inicial: sai o "se `!hasInstance`, força `conectar`". Fica: `passoInicial` (preview) > rascunho
  > servidor.
- `avancar()`: `quem` -> `sabe`; `sabe` -> grava (`form.save()`, como hoje) e vai para `testar`;
  `testar` -> `conectar`. A regra de voltar ao passo `quem` quando o `PUT` reprova campo dele fica.
- Passo `testar`: o cartão "Fale com ele antes" que hoje mora no passo `ativar` (com o
  `AgentTestDrawer`). O teste é OFERECIDO, nunca exigido (decisão de 28/08/2026): o "Continuar"
  funciona sem testar. `onboarding_tested_at` segue sendo gravado pelo `/api/playground`.
- Passo `conectar` ("Conectar e ativar"):
  1. Uma linha no topo: "Conectar não liga o agente. Ele só começa a responder quando você ativar."
  2. O `ConnectWhatsApp` (`enquadramento="passo"`). ⚠️ O `onConectado` NÃO avança mais de passo:
     ele marca na tela que conectou (estado local), e a ativação aparece logo abaixo.
  3. Depois de conectado: a lista curta "Ao ativar, o que acontece" (as 3 frases de hoje) e o botão
     "Ativar o agente" (o `ativar()` de hoje, que chama o `publish` e vai para `/painel`). Antes de
     conectar o botão fica desabilitado, com a razão escrita ("Conecte o WhatsApp para ativar").
  4. Quem já chega com a instância aberta (voltou depois de conectar) vê direto o estado conectado:
     o `ConnectWhatsApp` já faz polling quando `hasInstance`, e chama `onConectado` quando vê `open`.
- Rodapé: no passo `conectar` o botão da direita é "Ativar o agente" (como o `ultimo` de hoje); nos
  outros, "Continuar". "Deixar para depois" continua só no passo `sabe`.
- Revisar TODO comentário do arquivo que fale da ordem antiga ("conectar é piso duro", "passagem de o
  que ele sabe para ativar").
- ⚠️ `ConnectWhatsApp` mostra "Tudo pronto!" e espera 2,5s antes de chamar `onConectado`. No passo
  novo isso pode ficar, mas conferir que a frase "As conversas aparecem aqui a partir de agora" não
  confunde quem ainda não ativou; se confundir, trocar por uma frase para o enquadramento `passo`.

### 3. Rascunho
- `components/agente/rascunho.ts` guarda `passo`. Rascunho gravado com a ordem antiga pode ter
  `passo: "ativar"`, que não existe mais: tratar como `conectar` ao ler (ou descartar o passo e usar o
  do servidor). Nunca deixar um passo inexistente travar a tela.

### 4. Previews e guardas
- `app/design/montagem/page.tsx`: padrão passa a ser `quem`; `?passo=` aceita as keys novas.
- `app/montagem/page.tsx`: as quatro guardas continuam; conferir que nada depende de a instância
  existir para abrir o assistente.
- `app/page.tsx` (dono não publicado vai para `/montagem`) não muda.
- `components/AvisoMontagem.tsx`: conferir o texto, que não pode citar a ordem antiga.

### 5. Conectado de verdade (decisão tomada neste plano, conferir com o dono no relatório)
Hoje `hasInstance` é `clients.evolution_instance` preenchida, e ela é gravada ao PEDIR o QR ou o
código, não ao conectar. Com a ativação no mesmo passo da conexão, dá para ativar com uma instância
criada e nunca lida. Proposta: na primeira ativação, `app/api/clients/[id]/publish/route.ts` consulta
o estado real (`connectionState` em `lib/evolution.ts`, o mesmo da rota `whatsapp-status`) e responde
409 "conectar o WhatsApp" se não for `open`. Só na primeira ativação, como o resto do gate. Se a
Evolution não responder, NÃO bloquear (dado faltando nunca derruba quem está tentando ativar); anotar.

### 6. Testes (atualizar com o motivo escrito, nunca apagar)
- `e2e/montagem.design.spec.ts`: a lista de passos (linha ~14 tem `{ key: "ativar", titulo: "Testar e
  ativar" }`), o teste "no passo de conectar não existe Continuar" (agora o passo de conectar tem
  "Ativar o agente", desabilitado até conectar), e o de "Deixar para depois".
- `e2e/montagem.auth.spec.ts` (guardas com login), `e2e/onboarding.design.spec.ts`,
  `e2e/entrada.mobile.spec.ts` (`?passo=conectar` continua existindo), `e2e/telas.mobile.spec.ts`
  (lista de URLs: trocar `?passo=ativar` por `?passo=testar`).
- Teste novo no `sem-login`: a ordem dos quatro passos e o botão de ativar desabilitado antes de
  conectar. Se o item 5 for feito, teste com login do 409 exige conta nova sem instância: se não der,
  declarar o buraco dentro do spec, como os outros.

### 7. Documentação
- `CLAUDE.md`, bloco "Montagem e publicação": a ordem nova, o porquê, e a frase "conectar não liga o
  agente". Também a linha sobre `publishBlockers` se o item 5 entrar.
- `docs/proximos-passos.md`: registrar a decisão de 24/09/2026 na seção dos steps do agente.

## Critério de pronto
1. `npx tsc --noEmit`, `npx eslint .` e `npm run build` limpos.
2. `E2E_PORT=3001 npx playwright test --project=sem-login --project=mobile` verde.
3. `E2E_PORT=3001 npx playwright test --project=setup --project=logado --project=atendente
   --project=logado-serial --workers=2` verde. ⚠️ A OBS está SEM conversas desde a limpeza de
   24/09/2026: testes que precisam de conversa pulam, e isso é esperado.
4. Capturas do assistente em 375px e 1440px, nos dois temas, passando pelos quatro passos.
5. Um commit (sem rodapé de coautoria, regra do dono). **Push só se o dono pedir.**
6. Relatório curto ao dono: o que mudou, o item 5 feito ou não e por quê, e o que ele precisa
   testar de verdade: criar conta pelo `/cadastro`, passar os 4 passos e conectar pelo número com um
   chip de teste (o código de pareamento ainda não foi provado com número real).

## Não fazer
- Não mexer em n8n, banco de produção, prompt da base (`lib/agent-prompt.ts`) nem guardrail.
- Não mudar a regra de ativação além do item 5, nem exigir teste para ativar.
- Não reintroduzir importação de histórico (desligada de propósito em 23/09/2026).
