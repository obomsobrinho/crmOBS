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

As escritas de teste devem ficar restritas ao tenant da Loja Teste e limpar o que
criarem. Não mexer na OBM.

## Armadilhas da IA (cérebro real, custa dinheiro)

As 12 armadilhas da bateria de 28/08/2026 (`armadilhas.ia.spec.ts`) chamam o
modelo de verdade via `/api/playground`, em `dryRun`, com a sessão do dono da
Loja Teste. Ficam num projeto próprio, `ia`, que **só existe quando é pedido
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
