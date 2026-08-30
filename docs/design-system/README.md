# Design system

Gerado a partir do código em **30/08/2026**, não de uma proposta. A fonte da verdade é
`app/globals.css` (tokens) mais `components/ui/` (camada base); estes documentos explicam o
**porquê** de cada decisão, que é a única coisa que o código não guarda.

## Como manter

A versão anterior deste material morava numa pasta fora do repositório e desatualizou até virar
ficção: descrevia tokens que já tinham sido apagados (`--ink-dim`, `--ink-muted`, `--accent`), não
citava nenhum dos papéis tipográficos atuais, e abria dizendo "sem biblioteca de componentes, nada
de shadcn ou Radix" quando o projeto já tinha 17 arquivos em `components/ui/` sobre Radix.

Duas regras saem disso, e nenhuma é opcional:

1. **Mora no repositório.** Mudou token ou variante, o diff mostra que o documento ficou para
   trás, no mesmo commit.
2. **Não duplica valor.** Quando um número precisa aparecer aqui, ele vem com o nome do token e o
   arquivo onde está. Valor copiado é valor que diverge.

Se um documento e o código discordarem, **o código está certo e o documento está velho**.

## Os arquivos

| arquivo | o que cobre |
| --- | --- |
| [marca.md](marca.md) | relação com a OBS: o que herda, o que deriva, o que é livre |
| [fundamentos-cor.md](fundamentos-cor.md) | semântica, os quatro papéis de cada matiz, os quatro níveis de tinta |
| [fundamentos-superficie.md](fundamentos-superficie.md) | as camadas, e por que a hierarquia inverte entre os temas |
| [fundamentos-tipografia.md](fundamentos-tipografia.md) | os papéis de texto e os degraus de numeral |
| [fundamentos-geometria.md](fundamentos-geometria.md) | raio, espaço e altura de controle |
| [fundamentos-animacao.md](fundamentos-animacao.md) | as duas curvas, as durações, movimento reduzido |
| [camada-base.md](camada-base.md) | os 17 componentes de `components/ui/` e as sete regras deles |
| [pendencias.md](pendencias.md) | o que está em aberto e precisa de decisão |

## O produto

CRM multi-tenant de atendimento por WhatsApp com um agente de IA que responde sozinho e passa a
conversa para um humano quando precisa. O público é micro e pequena empresa brasileira: advogado,
clínica, pediatra, barbeiro, engenheiro, comércio.

Quem usa é **o dono do negócio ou a secretária**. Não é técnico, usa o dia inteiro, com pressa,
com o WhatsApp aberto do lado.

Três fatos que mandam em qualquer decisão de design:

1. **Densidade importa mais que respiro.** Uso diário e prolongado, alternando entre conversas.
2. **Os dois temas valem igual.** O produto roda em recepção clara e em sala escura.
3. **38% dos micro empreendedores brasileiros não têm computador.** Mobile não é rascunho.

⚠️ **O público é misto.** Nenhum texto fixo de tela pode assumir consulta, paciente, agendamento
ou qualquer vertical. Quem carrega a linguagem do segmento é o preset do agente, nunca a
interface. Existe teste e2e que reprova a tela.

## Regras inegociáveis

- **A semântica da cor não muda de significado:** roxo = marca e IA; verde = humano ("você"
  respondeu) e ação de enviar; âmbar = precisa de você; vermelho = erro e bloqueio. Verde, âmbar e
  vermelho são cores de **estado**, nunca decorativas nem de marca.
- **Claro e escuro são cidadãos de primeira classe.** Nada pode ficar bom em um e quebrado no
  outro.
- **Texto em português do Brasil, e nunca travessão.** Nem `—` nem `–`. Usar vírgula, ponto,
  dois-pontos ou parênteses. Vale para interface, prompts gerados, mensagens de erro e docs.
- **O produto ainda não tem nome.** A identidade mora em `lib/brand.ts`; não espalhar nome pela
  interface.
- **Não redesenhar do zero.** A base está aprovada. O trabalho é sistematizar e elevar o
  acabamento.

## O que mudou desde o material anterior

Aquele documento era um **diagnóstico**, e o diagnóstico foi executado. Para registro, os seis
problemas que ele listava e onde eles estão hoje:

| problema de então | hoje |
| --- | --- |
| 18 falhas de contraste WCAG AA | corrigidas; a causa raiz virou a regra dos quatro papéis por matiz |
| não existe escala tipográfica (11 tamanhos numa tela) | 10 papéis nomeados, com entrelinha travada |
| hierarquia de botões invertida | `components/ui/button.tsx`, 8 variantes e 7 tamanhos |
| painel do contato é uma lista plana de 8 seções | recolhíveis, com o valor visível quando fechado |
| tema claro não separa superfícies | quatro camadas, com a hierarquia invertida de propósito |
| mobile não existe | segue **em aberto**, ver [pendencias.md](pendencias.md) |
