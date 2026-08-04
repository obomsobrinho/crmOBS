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

## Tudo

```bash
npm run test:e2e
```
