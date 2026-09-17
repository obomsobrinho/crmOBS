# Testes e2e (Playwright)

Rodam contra o dev server (`http://localhost:3001`). Se ele não estiver de pé, o
Playwright sobe um (`npm run dev`).

## Sem login (telas /design)

Não precisam de banco nem credenciais.

```bash
npm run test:e2e -- --project=sem-login
```

## Com login (fluxos reais)

1. Abra `.env.e2e.local` (na raiz, fora do git) e cole a senha do usuário de teste
   depois de `E2E_PASSWORD=`. O e-mail já está preenchido.
2. Rode:

```bash
npm run test:e2e:login
```

O projeto `setup` (`auth.setup.ts`) faz login uma vez e salva a sessão em
`e2e/.auth/dono.json`; os testes `*.auth.spec.ts` reusam esse estado.

⚠️ **O tenant de teste mudou em 17/09/2026: passou a ser a OBS.** O que era usado
antes apontava para o WhatsApp de uma clínica com contato real chegando, o que é
o oposto do que a regra queria proteger. A OBS é o número do próprio dono, parado.
As escritas de teste ficam restritas a ele e limpam o que criarem.

⚠️ **A OBS está em `prompt_mode = 'avancado'`, e isso quebrou três testes** que
assumiam formulário guiado ou um telefone escrito no arquivo. A lição vale para
teste novo: **não travar o modo do tenant nem o número da conversa.** Quem precisa
de uma conversa pega a primeira da lista; quem precisa do construtor trata os dois
modos. Credenciais em `.env.e2e.local`: `E2E_EMAIL`, `E2E_PASSWORD`,
`E2E_ATTENDANT_EMAIL` e `E2E_ATTENDANT_PASSWORD` (o atendente existe desde
17/09/2026; os três testes de permissão dele ainda não foram escritos).

## Armadilhas da IA (cérebro real, custa dinheiro)

As 12 armadilhas da bateria de 28/08/2026 (`armadilhas.ia.spec.ts`) chamam o
modelo de verdade via `/api/playground`, em `dryRun`, com a sessão do dono do
tenant de teste. Ficam num projeto próprio, `ia`, que **só existe quando é pedido
pelo nome**: `npm run test:e2e` não o roda, de propósito, porque cada execução
são 12 chamadas pagas.

```bash
npm run test:e2e:ia
```

Rodar quando alguém pedir ou antes de publicar mudança na base do prompt
(`lib/agent-prompt.ts`, `lib/guardrail.ts`). O modelo não é determinístico:
o projeto tem uma repetição por caso, e a asserção aceita `pausar` onde a
tabela dizia `none`, porque escalar numa armadilha nunca é errado (o motivo
está no topo do spec).

## Tudo

```bash
npm run test:e2e
```

Roda `setup`, `sem-login`, `logado` e `logado-serial`. **Não** roda `ia`.
