---
name: fechar-entrega
description: Rodar a verificação completa antes de commitar uma entrega fechada neste CRM (tipos, lint, build e as suítes e2e certas). Use sempre que for fechar um passo, commitar código ou o usuário disser que uma entrega acabou.
---

# Fechar entrega

Rode nesta ordem e **pare no primeiro que falhar**. Não commite com qualquer um vermelho.

```bash
npx tsc --noEmit
```
```bash
npx eslint .
```
```bash
npm run build
```

## As suítes e2e

⚠️ **Rodar as DUAS**, sempre. No passo 1 do MVP do beta só a sem-login foi rodada e três testes
com login ficaram quebrados por seis dias, porque o painel novo tinha renomeado dois cabeçalhos.

```bash
npm run test:e2e -- --project=sem-login
```
```bash
npm run test:e2e:login
```

Se um dev server já estiver no ar na 3000, `E2E_PORT=3000 npx playwright test --project=logado`
reusa ele em vez de subir outro.

**`npm run test:e2e:ia` NÃO entra aqui.** São 12 chamadas pagas ao cérebro real por execução.
Só rode se a mudança tocou persona, guardrail, `lib/agent-prompt.ts` ou `lib/agent-turn.ts`,
e avise o usuário do custo antes.

## Antes do commit

- `git status` limpo de untracked: temporário e relatório de debug vão para o scratchpad da sessão,
  nunca na raiz do repo.
- Escrita de teste **só no tenant OBS** (decisão de 17/09/2026). O tenant com 7 contatos atende
  gente de verdade e nunca recebe escrita de teste. Credenciais em `.env.e2e.local`: `E2E_EMAIL`,
  `E2E_PASSWORD`, `E2E_ATTENDANT_EMAIL`, `E2E_ATTENDANT_PASSWORD`.
- Mensagem no padrão do repositório (`git log -8` mostra o tom: o porquê, o que mudou, como foi
  provado). **Nunca travessão** (`—` ou `–`) na mensagem.
- Se a entrega fechou um item do "Plano da demo", marque na tabela de `docs/proximos-passos.md` e
  atualize as seções 3 e 4 de `docs/handoff.md`.
