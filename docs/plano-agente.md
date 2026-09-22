# Melhorar a tela do agente como um todo (22/09/2026)

Pedido do dono depois de aplicar os três ajustes do dia: "quero melhorar essa
parte dos agentes como um todo". Este arquivo é o ponto de partida dessa
conversa, escrito para sobreviver a um `/clear`: quem retomar lê só este arquivo
mais o `CLAUDE.md`.

⚠️ **Nada aqui está decidido.** É levantamento mais perguntas. Não executar sem
o dono escolher.

---

## Onde estamos hoje

Três commits fecharam os ajustes pedidos na validação (não houve push):

- `a43f52d` as abas do composer caíram de 34 para 28px
- `2019fbb` horário virou o primeiro bloco da aba, ganhou modo simples, e os
  dois blocos deixaram de recolher
- `ff00ffc` **um vocabulário só de bloco** no formulário: `SubBloco` (filete de
  cima, título `text-cartao`, `required` e `error`), usado nos seis blocos de
  primeiro nível das duas abas

Linha de base dos testes: **184 sem login**, **26 com login e 1 pulado**. Dev
server na porta 3000 (usar sempre `E2E_PORT=3000`; subir outro falha).

### O que o agente é, em arquivos

| arquivo | linhas | o que é |
| --- | --- | --- |
| `lib/agent-prompt.ts` | 889 | a base do prompt, os tipos, os limites, `compilePersona` |
| `components/agente/campos.tsx` | 501 | os campos, em três grupos |
| `components/AgentConfigForm.tsx` | 461 | a casca: abas, salvar, modo avançado |
| `components/KnowledgeManager.tsx` | 418 | documentos (RAG) |
| `components/agente/useAgentConfig.ts` | 393 | estado e `PUT` |
| `components/agente/ui.tsx` | 304 | `Secao`, `SubBloco`, `Recolhivel`, `Field`, `Hint`, `Par`, `Trio` |
| `components/AgentPromptDrawer.tsx` | 261 | ver o prompt compilado |
| `components/AgentHoursEditor.tsx` | 184 | horário, em dois modos |
| `components/AgentTestDrawer.tsx` | 126 | a bancada de teste |
| `app/(app)/agente/page.tsx` | 122 | a página |

Duas superfícies sobre um formulário só (`/montagem` e `/agente`), e a **única
bifurcação permitida é `mostrarOpcionais`**. Isso não se negocia: campo
duplicado diverge na primeira mudança.

---

## O que eu já sei que está torto (levantado, não decidido)

1. **`Recolhivel` ficou sem nenhum consumidor.** Sobrou o componente e o
   comentário que guarda a regra boa ("fechado, a linha mostra o VALOR"). É
   apagar ou guardar? Regra da casa diz que variante sem uso é pior que ausente.
2. **`AiSummary` variante `painel` também não tem consumidor** desde 18/09,
   carregando uma prop `variante` com um valor só em uso. Fora da tela do
   agente, mas é a mesma faxina.
3. **"Grupo de WhatsApp para avisar" só aparece com o objetivo "Agendar"
   marcado** (`cfg.goals.includes("agendar")`). Ele perguntou "tiramos isso?" em
   21/09 e o assunto ficou aberto. Mostrar sempre é uma linha.
4. **O campo do grupo pede um JID cru** (`120363000000000000@g.us`). Ninguém
   sabe o próprio JID de cabeça; hoje a dica diz "peça a quem cuida da
   automação", que é o produto admitindo que não resolve.
5. **A aba "O que ele pode fazer" mistura dois assuntos**: objetivos (o que ele
   faz) e limites (o que ele não faz). Pode ser certo, pode ser o motivo de a
   aba parecer longa.
6. **Não existe estado vazio nenhum**: conta nova cai num formulário em branco
   com seis blocos. O assistente de `/montagem` cobre a primeira vez, mas quem
   passou por ele volta para cá e vê tudo.
7. **Salvar é publicar, e a tela não diz isso o tempo todo** (só a linha "Salvar
   já publica no WhatsApp" no rodapé). É a consequência mais cara da tela.

---

## Perguntas para o dono (as que mudam o trabalho)

Ordem importa: a primeira decide o tamanho de tudo que vem depois.

1. **"Melhorar como um todo" é qual dos três?**
   (a) **acabamento**: continuar tirando ruído bloco a bloco, como hoje;
   (b) **arranjo**: repensar o que são as três abas e o que mora em cada uma;
   (c) **capacidade**: campos ou poderes novos para o agente (por exemplo
   ferramentas de verdade, que hoje não existem).
   A (c) é outra fase de produto, não é design.
2. **Isto é antes ou depois do mobile?** O plano em vigor era: validar o desktop
   e ir para o mobile. Se a tela do agente vai mudar de arranjo, fazer o mobile
   dela agora é trabalho jogado fora.
3. **Qual é a queixa concreta?** Hoje eu só sei "está grande e desigual". Uma
   frase do tipo "eu abro e não sei o que mexer primeiro" vale mais que dez
   medidas minhas.

---

## Regras que continuam valendo, não reabrir

- **A cor das abas do composer** (inativo na superfície tingida do próprio
  matiz, ativo no fundo cheio) é decisão de 18/09 com teste próprio.
- **`BusinessHours` são os 7 dias no banco.** O modo simples do horário é só uma
  forma de escrever os 7 de uma vez; não inventar campo novo no `agent_config`.
- **Hierarquia de título em três níveis**: `text-titulo` 18 = página,
  `text-cartao` 16 caixa normal = bloco com estrutura própria, `text-rotulo` 12
  caixa alta = rótulo de valor ou sub-bloco recolhível. Foi trocar esses dois
  últimos que produziu o erro de hoje.
- **`publishBlockers()` não tem `tested`** (decisão de 28/08).
- **Não tocar no n8n.**

## Como fechar qualquer item

```
npx tsc --noEmit
npx eslint .
npm run build
E2E_PORT=3000 npx playwright test --project=sem-login
E2E_PORT=3000 npx playwright test --project=setup --project=logado --project=atendente --project=logado-serial --workers=2
```

`npm run test:e2e:ia` **não entra** enquanto nada tocar prompt, guardrail ou
modelo. ⚠️ Mexer em `lib/agent-prompt.ts` FAZ tocar a base do prompt, e aí entra.

Commit por item fechado, na linguagem do repositório. **Sem push** (push dispara
deploy na Vercel). Teste que afirmava o comportamento antigo se ATUALIZA com o
motivo escrito, nunca se apaga.
