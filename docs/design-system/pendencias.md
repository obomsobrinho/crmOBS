# Pendências do design system

Tudo aqui foi **medido em 30/08/2026** e nada foi decidido. Cada item diz qual é a evidência e qual
é a escolha, para a decisão ser do dono do produto e não de quem estiver codando.

Isto **não é o roadmap**. Roadmap de produto é `docs/proximos-passos.md`.

## 1. Marca: o gradiente termina numa cor que o sistema não tem

O gradiente oficial vai de `#8C2CE7` a `#4464D4`, e **nem o site nem o produto têm azul no sistema
de cores**. A única peça oficial da identidade usa uma cor que o sistema não conhece.

**Escolha:** ou o azul entra como cor de sistema, ou a logo é recalibrada para o roxo. Hoje ele
sobrevive por escopo fechado (`--brand-grad-end`, só em `.brand-grad`), o que é contenção, não
resposta.

## 2. Marca: não existe identidade para fundo claro

Nem logo, nem roxo calibrado. O gradiente da marca sobre branco fica pesado, e o tema claro já é o
mais fraco dos dois.

## 3. `--raised` e `--s-conteudo` são a mesma cor

`#ffffff` no claro e `#171717` no escuro, nos dois casos. Dois nomes para uma cor. O painel usa
`bg-raised` (6 usos), o resto do app usa `bg-conteudo` (18 usos).

**Escolha:** unificar num nome só, ou manter os dois e escrever quando usar cada um. Enquanto
estiver assim, uma mudança de superfície precisa ser feita em dois lugares para não divergir.

## 4. A variante `segmentado` das abas não tem nenhum uso

`components/ui/tabs.tsx` a descreve como "o alternador de modo do `/agente`", mas o
`AgentConfigForm` usa a variante padrão. **Zero call sites.**

**Escolha:** apagar, ou adotar em algum lugar. Enquanto existir, o comentário da variante `painel`
se compara a algo que ninguém vê.

## 5. `text-display` (24px) não tem nenhum uso

É um dos papéis tipográficos declarados e não é chamado por ninguém. As duas ocorrências no código
são menções dentro de comentários.

**Escolha:** apagar o papel, ou identificar onde ele deveria estar sendo usado.

## 6. Sete utilitários de superfície sem uso

`bg-sunken`, `bg-inset`, `bg-lista`, `bg-composer`, `bg-sub`, `bg-painel`, `bg-chat`.

## 7. Legado `--surface` e `--panel`

`--surface` tem 4 usos e `--panel` tem 1 (o badge `dia`). A migração está escrita e **aguarda
decisão**, porque mexe em pixels de uma tela já aprovada.

## 8. Respiro de cartão: 22 contra 24

O painel usa 22px, `/agente` e `/equipe` usam 24px. O 22 vem da prancha do painel; o 24 é o que as
outras telas já usavam.

**Escolha:** adotar um dos dois como token (`--pad-cartao`) e migrar o outro, ou aceitar os dois
com uma regra escrita.

## 9. Um botão escrito à mão

O "Ver quem está esperando" (`components/PainelBlocos.tsx`) é um `<Button size="primary">`
reescrito em classe solta: `h-9` é 36px (`--h-primary`) e `rounded-[10px]` é `rounded-lg`. O
`Button` já tem `asChild`. Correção pequena, sem decisão envolvida.

## 10. Comentário errado no `button.tsx`

Diz que `rounded-lg` é 12px. O token é 10px.

## 11. Nível 2 de título faltando em duas telas

Pela regra de hierarquia (ver [fundamentos-tipografia.md](fundamentos-tipografia.md)), estes dois
encabeçam blocos com estrutura própria e estão com tratamento de rótulo:

- `KnowledgeManager` → "DOCUMENTOS", que encabeça a lista de arquivos com ações.
- `TeamManager` → "MEMBROS", que encabeça a lista de membros.

**Decidido em 30/08/2026 manter os dois papéis** (16 branco e 12 caixa alta). Falta aplicar a
regra nesses dois lugares.

## 12. Mobile

O único dos seis problemas do diagnóstico anterior que **não foi resolvido**. Continua valendo o
fato que o torna caro de ignorar: 38% dos micro empreendedores brasileiros não têm computador.

Há um furo conhecido e assumido: quem abre o passo 1 da montagem no telefone não consegue ler o QR
na própria tela, e este projeto não tem conexão por código de telefone. A tela diz isso; não
inventar pareamento que não existe.
