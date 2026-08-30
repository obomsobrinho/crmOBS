# Marca

Trazido do material anterior porque é **decisão**, não medição: continua valendo inteiro.

## Decisão travada: o CRM é subproduto da OBS

A OBS (O Bom Sobrinho) é a agência, e faz agentes de IA, automação, sistemas, site e ecommerce. O
CRM nasceu de acoplar os agentes de IA a uma interface que escala rápido. Ele mora **debaixo** da
marca da agência, provavelmente num subdomínio do tipo `crm.obomsobrinho.com.br`.

O CRM **pode ter identidade visual própria**, desde que claramente **derivada da OBS**: quem vê o
produto e vê o site precisa reconhecer a mesma casa. Não é herança cega nem marca nova, é uma
**marca-filha**.

## Os três níveis

**1. Herda, sem discussão.** É o que faz reconhecer a mesma casa:

- A família tipográfica: **Manrope** (corpo) e **Space Grotesk** (display).
- **Roxo como cor de marca.** O produto não vira azul, verde ou laranja.
- A **assinatura da OBS** presente de alguma forma no produto.

**2. Deriva.** Mesmo DNA, recalibrado, porque produto e site têm exigências diferentes:

- **Os tons exatos do roxo.** O site precisa de brilho, o produto precisa de contraste. `#a855f7`
  funciona num título gigante sobre preto e reprova como texto pequeno numa ferramenta.
- **As superfícies.** O site é dark-only; o produto tem os dois temas.
- **A logo.** Marca própria é permitida, desde que derive do bloco com "OBS" em espaço negativo:
  mesma construção, mesmo gradiente, mesma lógica de espaço negativo.

**3. Livre.** O produto decide e o site não manda:

- **A atmosfera.** Sem mesh radial, sem glass com blur, sem halo, partícula, pulso ou parallax.
- **A semântica de estado** (verde, âmbar, vermelho). O site não tem esse problema; o produto vive
  dele.
- **Densidade, escala tipográfica e espaçamento**, que são decisões de ferramenta.

## O que já está alinhado

As fontes são as mesmas, o roxo claro é o mesmo (`#8b46f6`), o fundo escuro é praticamente o mesmo
e o anel de foco é idêntico. O único desencontro de cor era o roxo principal: `#6b21e8` no site
contra `#6d28d9` no produto. **O site mandou**, porque é onde a marca está publicada, e o produto
passou a usar `#6b21e8`.

**O verde deixou de ser conflito.** A versão anterior do site usava `#25d366` como ação principal,
o que colidia com a regra do produto. A versão atual não tem nenhum botão verde preenchido: o
verde sobrou em ponto de status, ícone de check, selo com baixa opacidade e parada de gradiente. É
o mesmo uso que o CRM faz. Os dois convergiram sozinhos.

## O que NÃO importar do site

- **O roxo `#a855f7` como cor de texto pequeno.** No site ele aparece em título de 64px sobre
  quase preto.
- **A atmosfera:** glow radial, glass com blur, halos, partículas, marquee, pulso, shimmer e
  parallax. Vende num site, cansa numa ferramenta de oito horas por dia.
- **A pílula branca com borda em gradiente animado** (o CTA principal do site) como botão padrão.
  Num site há dois CTAs por dobra; numa ferramenta densa há dezenas de botões, e branco preenchido
  é o maior peso visual disponível. Serve como **botão primário único por tela**, nunca como
  padrão.

## No código

Nome, inicial e tagline ficam em `lib/brand.ts`; o selo em `components/BrandMark.tsx` (login,
cadastro, recuperar senha, definir senha, assinatura e nav rail). **Trocar de marca é editar esse
arquivo mais `--accent` e `.brand-grad` no `globals.css`.**

O selo tem as duas artes no DOM e o CSS escolhe pelo tema (`.mark-dark` / `.mark-light`). O padrão
é a arte clara, porque o tema claro é o estado sem atributo.

⚠️ **O produto ainda não tem nome.** Nada de nome fixo em componente.

## A régua que isso levanta

⚠️ **A OBS não tem design system definido.** O que existe é o site institucional, a paleta dele e a
logo. Ou seja, o trabalho feito aqui **passa a ser a referência de identidade da OBS**, e o site
vai ter que se alinhar a ele depois, não o contrário.

Duas lacunas em aberto por causa disso estão em [pendencias.md](pendencias.md).
