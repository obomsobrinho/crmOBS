# Camada base

`components/ui/`, 17 arquivos, sobre **Radix** (pacote unificado `radix-ui`), com `cva` e `cn`
(`lib/utils.ts`). Concluída em 17/08/2026: as 15 telas do sistema saíram de classe solta para cá,
51 arquivos tocados.

⚠️ **São DUAS camadas, e confundi-las é o começo da divergência:**

- `components/ui/` é a **BASE**, ajustada UMA vez para encarnar o sistema.
- `components/` é **PRODUTO**, e consome a base.

Antes de escrever `className` numa tela, procurar a variante na base. **Se a mesma sopa de classe
aparecer duas vezes, ela virou variante.**

## As sete regras, cada uma paga com um bug

1. **Geometria mora no `size` do cva, não na base do componente**: raio, `gap` e peso da fonte.
   Assim `size="none"` significa mesmo "sem geometria".
2. **Nunca `[&_svg]:size-4`.** `size-4` é CSS e vence o atributo `width` do lucide, engordando todo
   ícone de 13, 14 e 15px.
3. **Nunca anel de foco no componente.** O foco é global (ver
   [fundamentos-geometria.md](fundamentos-geometria.md)).
4. **`data-slot` DEPOIS do spread**, senão um gatilho de fora (ex.: `TooltipTrigger`) sobrescreve.
   ⚠️ O contrário também vale: **`data-slot` vindo de fora é ignorado**. Quem precisa se marcar de
   fora usa outro `data-*` (o cartão sem dado do painel usa `data-em-breve`, a manchete usa
   `data-manchete`).
5. **Não depender do `data-state` de um ancestral** (`TooltipTrigger` sobrescreve o do filho):
   passar estado por prop, como `SwitchTrack` / `SwitchThumb` fazem.
6. **`tailwind-merge` conhece a escala tipográfica** via `extendTailwindMerge`. Sem isso ele trata
   `text-corpo` como COR e descarta `text-ink-2` em silêncio.
7. **Root do Radix não renderiza elemento**: `DropdownMenuTrigger asChild` em volta de `<Tooltip>`
   clona props no nada. Os dois gatilhos precisam se encadear ao MESMO elemento.

⚠️ Para um `<form>` ou `<section>` que **É** o cartão, usar `cn(cardVariants(), ...)` em vez de
`Card asChild`: evita um nó extra na árvore só para envolver.

## Os componentes

### `button`
8 variantes: `brand` (padrão), `send`, `warn`, `danger`, `outline`, `ghost`, `rail`,
`brand-ghost`.
7 tamanhos: `field` (40), `primary` (36), `control` (32, padrão), `chrome` (28), `icon-control`
(32 quadrado), `icon-chrome` (28 quadrado), `none`.
Tem `asChild`, então um `<Link>` com aparência de botão não precisa ser escrito à mão.

### `badge`
`contorno` (padrão), `tracejado`, `contagem`, `nao-lidas`, `dia`, `tag`, `delta-bom`,
`delta-ruim`, `delta-neutro`.
⚠️ Os três `delta-*` são o selo de variação e **têm consumidor único**, o `Selo` do painel. O
padrão é `delta-neutro` e o selo é OPCIONAL no cartão: a referência que inspirou isto tem selo
colorido em 100% dos cartões, e é assim que verde deixa de ser estado e vira enfeite.

### `card`
`conteudo` (padrão) e `menu`. Tem `asChild`, porque a lista de conversas é um `<aside>` e a
conversa é um `<main>`: cartão é aparência, não elemento.
**Sem `CardHeader` e sem `CardFooter`**, de propósito (ver
[fundamentos-superficie.md](fundamentos-superficie.md)).

### `stat`
Cartão de indicador. Entrou em 26/08/2026.
Variantes: `bloco` (dentro de um cartão de página), `elevado` (flutua sobre o canvas), `marca`,
`vazio` (borda tracejada, para o número que ainda não existe).
Tamanhos: `manchete`, `padrao`, `compacto`.
Partes: `StatTopo` (tamanhos `padrao` / `operacao`), `StatRotulo`, `StatValor` (tamanhos
`manchete` 68 / `destaque` 44 / `padrao` 32 / `compacto` 18), `StatFrase`, `StatLegenda`.

⚠️ **`StatLegenda` é OBRIGATÓRIA por decisão de projeto.** O defeito que ela conserta estava na
tela: "Leads qualificados 9" (7 dias) ao lado de "19 leads qualificados em julho" (mês), com o
período escrito só no título da seção. **Cartão de indicador sem período mente sobre o próprio
número.**

⚠️ A variante `elevado` existe porque no claro `--s-bloco` é igual ao `--canvas`: um cartão
`bloco` sobre o canvas ficaria invisível.

### `tabs`
`sublinhado` (padrão): barra sólida de 3px embaixo da ativa, sem fundo; a cor da barra chega por
`barra` e vira `--aba-cor`. É a do composer e a do `/agente`.
`painel`: bandeja com moldura e pílula ativa em **superfície**, nunca no fill da marca. Roxo cheio
num seletor de período roubaria a cor da série, que no painel é a única cor categórica.
⚠️ Existiu uma terceira, `segmentado`, com a pílula ativa em roxo cheio. Foi **removida em
30/08/2026** por não ter nenhum consumidor. Variante sem uso é pior que ausente: quem lê o design
system a considera disponível e a adota sem saber que ela nunca foi aprovada em tela nenhuma.

⚠️ **Não existe `TabsContent` no composer**, de propósito: os três modos dividem UM editor só, e
envolvê-lo em painéis o desmontaria a cada troca de aba, perdendo foco e posição do cursor. O
custo é um `aria-controls` que aponta para um id inexistente. Decisão tomada.

⚠️ `TabsContent` traz `data-[state=inactive]:hidden`. Com `forceMount`, que é como o `/agente`
usa, o Radix mantém os painéis inativos montados **e visíveis**. Sem essa linha os três grupos do
formulário apareciam empilhados.

### `dialog`
Tamanhos `confirmacao` e `gestao`. Animação `.anim-flutuante` e `.anim-fundo`.
⚠️ O `conteudoVariants` embute `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2`.

### `sheet`
Painel lateral. Entrou em 22/08/2026 e é **arquivo separado do `dialog` de propósito**: o
centramento do dialog brigaria com o `translate` do painel. Animação própria (`.anim-lateral`).
Tamanhos `padrao` (520px, leitura) e `largo` (1040px, bancada de teste).
⚠️ A largura é **variante**, não `className` na tela: eram dois usos da mesma sopa de classe com um
número trocado.

### `switch`
Tons: `marca` (roxo, chave que liga um recurso) e `ativo` (verde, chave que representa ESTADO de
operação ligado). Existe porque a chave "Agente ativo" tinha o rótulo verde com o trilho roxo do
lado: a mesma chave dizia duas cores sobre o mesmo estado.
Partes `SwitchTrack` / `SwitchThumb` recebem estado **por prop** (regra 5).

### `input` e `textarea`
Variante `limpo` (sem moldura). Altura `--h-field`. Sem classe de foco (o foco é global, e campo é
a exceção que acende a própria moldura).

### `select`
Tamanhos `field` e `control`.

### `avatar`
Tamanhos `xl` (44), `lg` (40), `md` (36), `sm` (32), `xs` (28). A cor sai de `avatarPair()`
(`lib/inbox.ts`), nunca branco sobre cor cheia.

### `dropdown-menu`, `tooltip`, `scroll-area`, `separator`, `checkbox`
Sem variantes. `dropdown-menu` e `tooltip` usam `.anim-flutuante`. A `scroll-area` imita a barra
nativa que o `globals.css` já estiliza.

## O que a faxina de 30/08/2026 tirou daqui

- A variante `segmentado` das abas (zero usos).
- `bg-conteudo`, que era a mesma cor de `bg-raised` com outro nome. Ficou `raised`.
- O botão "Ver quem está esperando" do painel, que era um `<Button size="primary">` reescrito em
  classe solta, virou `Button asChild`.

Ver [pendencias.md](pendencias.md).
