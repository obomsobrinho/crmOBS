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
Rode em TRÊS casos, e avise o custo antes:

1. O **texto da base** mudou: `buildBaseTail` ou `buildPersona` em `lib/agent-prompt.ts`. É o caso
   principal, porque esse texto vale para todos os tenants e, desde 17/09/2026, chega a todos na
   mensagem seguinte (a persona é montada na leitura).
2. A **regra do guardrail** mudou (`lib/guardrail.ts`).
3. O **modelo** mudou (`OPENAI_AGENT_MODEL`) ou a montagem do prompt em `lib/agent.ts`.

Mais uma vez, fora de mudança de código: **antes de abrir o beta**, como linha de base.

⚠️ **Mexer em `lib/agent-turn.ts` NÃO é motivo por si só**, e a versão anterior desta skill dizia
que era. A bateria manda a configuração FIXA no corpo da requisição, então ela nunca passa pelo
código que monta a persona a partir do tenant: rodar por causa disso paga 12 chamadas para provar
outra coisa.

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
