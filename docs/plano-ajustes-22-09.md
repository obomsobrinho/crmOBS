# Plano: três ajustes de design (22/09/2026)

Pontos que o dono levantou validando a tela antes de começarmos o MOBILE. Escrito
para sobreviver a um `/compact`: quem retomar isto lê só este arquivo mais o
`CLAUDE.md` e consegue executar.

**Estado ao escrever:** árvore limpa, último commit `4ac55e1`. Linha de base dos
testes: **181 sem login**, **26 com login e 1 pulado**. Dev server já no ar na
porta 3000 (usar sempre `E2E_PORT=3000`; subir outro falha).

---

## 1. As abas do chat estão grandes demais

**Pedido:** "dá para diminuir esse tamanho das tabs do chat (responder clientes,
nota interna, orientar ia), tá meio exagerado."

**Onde mora:** a pele é a variante **`acao`** do `TabsTrigger`, em
`components/ui/tabs.tsx` (procurar `acao:`). Hoje: `h-[34px] ... px-3 text-apoio
font-semibold`, mais `gap-2` para o ícone de 15px. A faixa que as contém é a
`TabsList` em `components/MessageComposer.tsx` (`flex-wrap gap-[7px]
border-b border-line-soft px-3 py-2`).

**Cuidados:**
- ⚠️ A variante `acao` é usada SÓ pelo composer hoje, mas confirmar com
  `grep -rn 'variant="acao"'` antes de mexer: se aparecer em outra tela, o degrau
  vira variante nova, não ajuste no lugar.
- ⚠️ **Não voltar a cor para cinza.** Há decisão registrada (18/09) e teste em
  `telas.design.spec.ts` ("o modo ATIVO do composer é fundo cheio, e cada modo tem
  a sua cor"): os três carregam o próprio matiz mesmo desligados, e o ativo é
  fundo cheio. O que se mexe aqui é TAMANHO.
- O ícone de 15px provavelmente cai junto; ver a regra 2 da camada base (nunca
  `size-4` em svg do lucide).
- Medir antes e depois: a faixa toda tinha ~53px em 1600x950.

---

## 2. Horário de atendimento: sempre aberto, primeiro, e com modo simples

**Pedido:** "horário de atendimento não deveria ficar colapsado, deveria estar
sempre em aberto e deveria ser o primeiro dessa sessão. Além disso poderia ter
algo assim, seg a sexta e coloca o horário, se eu quiser personalizar clico em
outro botão e aí sim eu ajusto dia por dia."

São **três** mudanças, e a terceira é a maior:

1. **Deixa de ser `Recolhivel`.** ⚠️ Em 21/09 eu só troquei o estado inicial para
   aberto (`useState(true)` em `components/agente/campos.tsx`); ele quer o bloco
   sem o recolher. Ao tirar, some o `resumo` da linha fechada, e há teste em
   `e2e/ajustes.design.spec.ts` ("horário e limites recolhem mostrando o valor na
   linha") que precisa ser ATUALIZADO com o motivo, não apagado.
2. **Primeiro da aba "O que ele sabe".** Hoje a ordem é: Detalhes do negócio →
   Documentos (`KnowledgeManager`) → Horário. Ele quer o horário primeiro.
   ⚠️ O comentário atual diz que "horário não entra no assistente: ele alimenta a
   frase de valor do painel, não a primeira resposta do agente", e ele fica atrás
   de `mostrarOpcionais`. **Conferir se vai para o `/montagem` também** ou se
   segue só na tela permanente: `mostrarOpcionais` é a ÚNICA diferença permitida
   entre as duas superfícies (regra do CLAUDE.md).
3. **Modo simples e modo dia a dia.** Hoje `components/AgentHoursEditor.tsx` é
   sempre a parede de 7 linhas (checkbox + dois `input[type=time]` por dia), com
   dois atalhos que já existem: `copyWeekdays()` (copia o de segunda para seg..sex)
   e `allDay()`. O pedido é inverter o padrão: abrir no simples ("segunda a sexta,
   das X às Y", talvez mais sábado) e o dia a dia atrás de um botão
   "Personalizar por dia".
   - O dado no banco NÃO muda: `BusinessHours` é `Record<DayKey, {open,from,to}>`
     com os 7 dias (`lib/agent-prompt.ts`), e o modo simples é só uma forma de
     editar os 7 de uma vez. **Não inventar campo novo no `agent_config`.**
   - Decidir como o simples nasce quando o valor atual JÁ é irregular (ex.: sábado
     com horário diferente): o certo é detectar e abrir direto no dia a dia, nunca
     achatar o que a pessoa configurou.
   - `renderHours` (mesmo arquivo) é quem vira texto no prompt e no resumo; ele
     não deve precisar mudar.

---

## 3. "Limites e quando chamar o time" também não precisa ser recolhido

**Pedido:** "não precisa ser colapsado também, tem espaço abaixo, não faz sentido
deixar colapsado."

**Onde mora:** `components/agente/campos.tsx`, dentro de `CamposOQuePodeFazer`,
`Recolhivel titulo="Limites e quando chamar o time"` (tem 3 campos dentro: o que
NÃO fazer, quando chamar um humano, o que avisar ao passar para o time).

**Cuidados:**
- ⚠️ `Recolhivel` tem `manterMontado`, e o motivo está escrito no código:
  `AgentBulletList` guarda o rascunho não adicionado num ref do pai, e desmontar
  faria o texto sumir da tela CONTINUANDO a ser salvo. **Tirando o recolher, essa
  armadilha deixa de existir** para este bloco, mas confirmar que nada mais
  dependia do `manterMontado` dele.
- Mesmo teste do item 2 (`ajustes.design.spec.ts`) cobre os dois blocos juntos.
- Se `Recolhivel` ficar sem nenhum consumidor depois dos itens 2 e 3, ele vira
  código morto: **verificar com grep e reportar ao dono** (não apagar por conta
  própria; ver a regra de levantamento no CLAUDE.md).

---

## Como fechar cada item

Sempre com `E2E_PORT=3000`:

```
npx tsc --noEmit
npx eslint .
npm run build
E2E_PORT=3000 npx playwright test --project=sem-login
E2E_PORT=3000 npx playwright test --project=setup --project=logado --project=atendente --project=logado-serial --workers=2
```

`npm run test:e2e:ia` **não entra**: nada aqui toca prompt, guardrail ou modelo.

Commit por item, na linguagem do repositório (o porquê, o que mudou, como foi
provado). **Sem push.** Teste que afirmava o comportamento antigo se ATUALIZA com
o motivo escrito, nunca se apaga.

---

## Pendências do dono (levantadas, não executadas)

1. **Campo "Grupo de WhatsApp para avisar" só aparece com o objetivo "Agendar"
   marcado** (`cfg.goals.includes("agendar")`, `campos.tsx`). Ele perguntou
   "tiramos isso?" em 21/09: não foi tirado, está condicionado. Mostrar sempre é
   uma linha, e é decisão dele.
2. **`AiSummary` variante `painel` não tem mais nenhum consumidor** desde que o
   entendimento virou faixa (18/09). É código morto carregando uma prop `variante`
   com um valor só em uso.
3. **Balão da conversa**: um balão de uma linha tem 55px, e a hora em linha
   própria custa 16px de cada um (medida do desenho de 18/09, com motivo
   registrado). Se "o chat está grande" ainda incomodar depois do item 1, é aqui
   que se aperta.
4. **Atribuição com um atendente só**: confirmado em 21/09 que o dono SEMPRE pode
   atender (a `tenant_members()` devolve todos e ordena o dono primeiro). O que a
   tela não faz é avisar que responder uma conversa de outra pessoa não rouba a
   atribuição dela (`POST /api/send` só grava `assigned_user_id` quando está
   vazio). Decisão dele foi MANTER assim.
