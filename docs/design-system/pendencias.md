# Pendências do design system

Medido em **30/08/2026**. Cada item diz qual é a evidência e qual é a escolha, para a decisão ser do
dono do produto e não de quem estiver codando. O que já foi decidido fica marcado como **RESOLVIDO**
e permanece aqui como registro, com o custo que a escolha teve.

Isto **não é o roadmap**. Roadmap de produto é `docs/proximos-passos.md`.

## 1. Marca: o gradiente termina numa cor que o sistema não tem ✅ RESOLVIDO

O gradiente oficial vai de `#8C2CE7` a `#4464D4`, e **nem o site nem o produto têm azul no sistema
de cores**. A única peça oficial da identidade usa uma cor que o sistema não conhece.

**Decisão do dono, 30/08/2026: MANTER como está.** O azul segue vivendo por escopo fechado
(`--brand-grad-end`, só em `.brand-grad`), sem entrar na paleta e sem recalibrar a logo. É contenção
assumida, e não descuido: quem for mexer na marca depois precisa saber que a regra "o sistema não
tem azul" tem exatamente uma exceção, e que ela é a logo.

## 2. Marca: não existe identidade para fundo claro ✅ ACEITO POR ORA

Nem logo, nem roxo calibrado. O gradiente da marca sobre branco fica pesado, e o tema claro já é o
mais fraco dos dois.

**Decisão do dono, 30/08/2026: segue como está.** ⚠️ Registrado a partir de um "ok" curto; se a
intenção era outra, é só corrigir. Não há o que construir aqui de qualquer forma: identidade para
fundo claro é trabalho de marca, não de código.

## 3. `--raised` e `--s-conteudo` eram a mesma cor ✅ RESOLVIDO E APLICADO

Tinham `#ffffff` no claro e `#171717` no escuro, os dois. Dois nomes para uma cor: o painel usava
`bg-raised` (6 usos) e o resto do app usava `bg-conteudo` (17 usos).

**Resolvido em 30/08/2026: ficou `raised`.** É o nome do SISTEMA de camadas
(canvas/sunken/raised/inset); `conteudo` era da nomenclatura antiga, por função. Os 17 usos de
`bg-conteudo` viraram `bg-raised`, a ponte do shadcn (`--card`, `--popover`) foi reapontada, e
`--s-conteudo` deixou de existir.

## 4. A variante `segmentado` das abas não tinha uso ✅ RESOLVIDA E REMOVIDA

`components/ui/tabs.tsx` a descrevia como "o alternador de modo do `/agente`", mas o
`AgentConfigForm` usa a variante padrão e o alternador virou um botão. **Zero call sites.**

**Removida em 30/08/2026**, junto com a amostra dela na galeria. Sobraram duas: `sublinhado` e
`painel`.

## 5. `text-display` (24px) não tinha uso ✅ RESOLVIDO E REMOVIDO

Era um dos papéis tipográficos declarados e não era chamado por ninguém: as duas ocorrências no
código eram menções dentro de comentários.

**Removido em 30/08/2026.** Ele nasceu quando o painel usava 24px em dez números ao mesmo tempo;
a hierarquia de numeral (68/44/32) resolveu aquilo e o papel ficou órfão.

## 6. Sete utilitários de superfície sem uso ✅ RESOLVIDO E REMOVIDO

Eram `bg-sunken`, `bg-inset`, `bg-lista`, `bg-lista-sel`, `bg-composer`, `bg-sub`, `bg-painel` e
`bg-chat`. **Removidos em 30/08/2026**, junto com as variáveis de valor que ficaram órfãs. Um
utilitário disponível é um convite a compor camada que o sistema não tem.

## 7. Legado `--surface` e `--panel` ✅ RESOLVIDO E APLICADO

**Migrados em 30/08/2026.** A tag do contato foi de `bg-surface` para `bg-raised`, e o separador de
dia da conversa foi de `bg-panel` para `bg-bloco`. Os dois destinos já tinham exatamente o mesmo
valor da origem, então nenhum pixel mudou. As variáveis foram removidas.

## 8. Respiro de cartão: 22 contra 24 ✅ RESOLVIDO E APLICADO

O painel usava 22px, `/agente` e `/equipe` usavam 24px. O 22 vinha da prancha do painel; o 24 era o
que as outras telas já usavam.

**Decisão do dono, 30/08/2026: 24px.** Aplicado em 8 lugares (`p-6` / `px-6`): o cartão de indicador
da base, a fila, o verbatim, os quatro pontos do cartão de assuntos e o bloco da própria galeria.

**Regra que fica:** cartão respira **24px**. Duas exceções, e as duas são deliberadas: a manchete do
painel usa 28 na vertical e 32 na horizontal (medida da prancha, cartão de peso próprio), e bloco
DENTRO de um cartão usa 16px.

**Custo, medido:** o piso de altura da tela do painel foi de ~907px para ~911px de viewport. Em
1920x930 a tela ainda fecha com sobra 0 e movimento e verbatim alinhados em 0; abaixo disso a
rolagem volta, que é o comportamento combinado para monitor pequeno.

## 9. Um botão escrito à mão ✅ RESOLVIDO E APLICADO

O "Ver quem está esperando" (`components/PainelBlocos.tsx`) era um `<Button size="primary">`
reescrito em classe solta: `h-9` é 36px (`--h-primary`) e `rounded-[10px]` é `rounded-lg`.

**Aplicado em 30/08/2026:** virou `Button asChild`. Medido antes e depois nos dois estados: 36px de
altura, raio 10px, 13px peso 600, âmbar #f9a63a com tinta #241403 no urgente. Idêntico.

## 10. Comentário errado no `button.tsx` ✅ RESOLVIDO

Dizia que `rounded-lg` é 12px. O token é 10px. **Corrigido em 30/08/2026.**

## 11. Nível 2 de título faltando em duas telas ✅ RESOLVIDO E APLICADO

Pela regra de hierarquia (ver [fundamentos-tipografia.md](fundamentos-tipografia.md)), estes dois
encabeçam blocos com estrutura própria e estavam com tratamento de rótulo:

- `KnowledgeManager` → "Documentos", que encabeça a lista de arquivos com ações.
- `TeamManager` → "Membros", que encabeça a lista de membros.

**Decidido em 30/08/2026 manter os dois papéis** (16 caixa normal e 12 caixa alta), e os dois
lugares acima passaram a usar `text-cartao`. O "Membros" era um `<span>` e virou `<h2>`, que é o
que ele sempre foi semanticamente.

## 12. Mobile

O único dos seis problemas do diagnóstico anterior que **não foi resolvido**. Continua valendo o
fato que o torna caro de ignorar: 38% dos micro empreendedores brasileiros não têm computador.

Há um furo conhecido e assumido: quem abre o passo 1 da montagem no telefone não consegue ler o QR
na própria tela, e este projeto não tem conexão por código de telefone. A tela diz isso; não
inventar pareamento que não existe.
