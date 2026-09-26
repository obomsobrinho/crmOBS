# Plano de implementação do mobile (23/09/2026)

Leva ao código o desenho do celular feito no Claude Design em 5 rodadas. Escrito para ser
**executado sozinho**, sem o dono acordado: cada fase tem entrada, entrega, critério de pronto e o
que fazer quando travar. Quem retomar lê este arquivo mais o `CLAUDE.md`.

---

## 0. Antes de tudo: o desenho final

- **Fonte:** o export FINAL do projeto do Claude Design (as 5 rodadas mais os ajustes), em
  `C:\Users\franck\Desktop\Desk\projetos\desing mobile\` (arquivo `Conversas Prototipo.dc.html`, o
  `support.js` e a pasta `screenshots/`), exportado em 23/09/2026 01:35. ⚠️ Plano já aplicado; a pasta foi para a
  Lixeira em 26/09/2026 (decisão do dono). Se precisar, ela está lá. ⚠️ O export antigo em
  `Desktop\mobile-rodada-1\desing\` é da rodada 1, ANTES dos ajustes: não serve de base.
- **Apoio:** os briefings `C:\Users\franck\Desktop\mobile-rodada-{1..5}\BRIEFING.md` e
  `mobile-rodada-1\AJUSTES-{1,2}.md` dizem o que foi PEDIDO; o protótipo diz o que foi DESENHADO.
  Em conflito de arranjo, vale o protótipo. Em conflito de regra da casa (cor de estado, travessão,
  12px, vocabulário), vale o `CLAUDE.md`, e a divergência vai para o relatório.
- **Como abrir o protótipo:** o painel de navegador não roda arquivo local. Usar Playwright direto
  (script temporário no repo, apagado depois) abrindo `file:///...`; é assim que o bug do tema da
  rodada 1 foi achado.
- ⚠️ **O protótipo é REFERÊNCIA, não código.** HTML com estilo inline e runtime próprio. Nada dele é
  copiado: cada tela é refeita com `components/ui/`, os tokens do `globals.css` e Tailwind
  responsivo. Copiar criaria um segundo sistema de cor e de componente.
- ✅ **Desenho VALIDADO em 23/09/2026 01:40** contra este plano: ver "Divergências do desenho
  final" no fim. Não precisa reler o protótipo inteiro; abrir só a tela da fase em curso.

## Ponto de partida: a fase 0 já está quase pronta, num stash

`git stash list` tem **"mobile fase 0 (rascunho): casca, barra de abas, folha Mais, sheet baixo,
projeto mobile"**. É o PRIMEIRO passo da execução: `git stash pop`. Ele traz:
- `viewport` em `app/layout.tsx` (`viewportFit: cover`, `interactiveWidget: resizes-content`);
- `(app)/layout.tsx` e as páginas `/design/*` com a casca `h-dvh flex-col md:flex-row md:gap-3 md:p-3`;
- `components/ui/sheet.tsx` com `lado="baixo"` e `tamanho="cheia"`, e `.anim-baixo` no `globals.css`;
- `NavRail` escondido abaixo de `md` e, dentro dele, `BarraAbas` (Painel, Conversas, Pipeline, Mais)
  com a folha "Mais"; a barra some em `/inbox/[id]` e `/agente` (usa `activeHref ?? pathname`);
- `ThemeToggle linha` (chave na folha), faixas do topo finas no celular;
- projeto `mobile` no `playwright.config.ts` e `e2e/casca.mobile.spec.ts`.

**Estado do rascunho:** `tsc` e `eslint` limpos; no `mobile`, 2 de 3 testes passam. ⚠️ **Falha
conhecida:** "a folha Mais leva a Equipe..." não acha `[data-slot="sheet-content"]` depois de tocar
em Mais no `/design/painel`. Primeira coisa a investigar da fase 0 (suspeita: o `Sheet` está
DENTRO do `<nav md:hidden>` da barra, e o toque pode estar indo para outro alvo; conferir com um
print). As suítes de desktop ainda NÃO foram rodadas com o rascunho: rodar antes de commitar.

## Ambiente (o que uma sessão nova precisa saber)

- **Dev server:** `preview_start` com o nome `crm-dev` (porta 3001, em `.claude/launch.json`).
  Todos os comandos de teste usam `E2E_PORT=3001`.
- ⚠️ **Os arquivos estão em CRLF** (autocrlf do git). Troca de texto por script com `\n` no padrão
  FALHA EM SILÊNCIO. Usar a ferramenta Edit, ou normalizar para `\n`, trocar e devolver o CRLF.
  Foi assim que três trocas se perderam na primeira tentativa.
- **Capturas em 375px** sem o painel de navegador: script Playwright temporário na raiz do repo
  (`import { chromium, devices } from "@playwright/test"`), `devices["Pixel 5"]` com
  `viewport: { width: 375, height: 812 }`, contra `http://localhost:3001/design/...`. Apagar o
  script depois (regra do dono: nada temporário no repo).
- **Telas de preview sem login:** `/design` (inbox com conversa aberta), `/design/painel`,
  `/design/pipeline`, `/design/agente`, `/design/equipe`, `/design/assinatura`,
  `/design/montagem?passo=conectar|quem|sabe|ativar`, `/design/connect`, `/design/conexao`,
  `/design/playground`. `/login` e `/cadastro` são públicas. `/perfil` só com login.
- **Sessão com login para teste manual:** `e2e/.auth/dono.json` (storageState do Playwright).
- **Não perguntar nada ao dono** (ele está dormindo): nunca usar AskUserQuestion, nunca parar
  esperando resposta. Toda dúvida se resolve pelas regras abaixo e vai para o relatório.

## Princípio: o MESMO app, responsivo

- **Abaixo de `md` (768px) é celular.** Nada de rotas `/m/...` nem componentes duplicados por
  plataforma: as mesmas páginas, com `md:` / `max-md:` na classe. Hook de mídia só quando o
  COMPORTAMENTO mudar (o que um toque abre), nunca para trocar aparência.
- **Entre 768 e 1023px** fica o desktop com o trilho recolhido, que já existe. Não é alvo; só não
  pode quebrar.
- **O desktop não muda.** Toda mudança nova de desenho (caixa de escrita no estilo do Claude, chave
  da IA no menu) vale só abaixo de `md`, por CSS no MESMO componente. Um componente, dois arranjos,
  nunca dois componentes.

## Regras de execução autônoma

1. **Decisões do dono ainda abertas: fica o comportamento de hoje.** Ver a lista PENDENTE no fim.
   Nada que mude regra de negócio entra sem ele: nem "Desfazer", nem trava nova, nem filtro novo.
   O que o desenho pedir disso vira item do relatório.
2. **Uma fase, um commit**, na linguagem do repositório, sem rodapé de coautoria (regra do dono).
   **Sem push**: push dispara deploy na Vercel, e o dono não pediu.
3. **Critério de pronto de toda fase:** `tsc`, `eslint` e `build` limpos; suítes `sem-login`,
   `mobile` e as com login verdes (comandos no fim). Teste que afirmava o comportamento antigo se
   ATUALIZA com o motivo escrito, nunca se apaga.
4. **Travou?** Mais de 20 minutos sem conseguir fechar um item: reverter SÓ aquele item
   (`git checkout` do arquivo), anotar no relatório com o motivo, e seguir. Fase com a casca
   quebrada (fase 0) não é pulável: sem ela nada anda, e aí a execução para e o relatório diz onde.
5. **Teste instável:** repetir isolado (`--repeat-each=3`). Passou isolado, é carga; anota e segue.
   Falhou isolado, é defeito.
6. **Tempo:** a ordem das fases é a ordem de valor. Se o tempo acabar, o que ficou para trás vai
   para o relatório como "não iniciado", e o que foi feito precisa estar commitado e verde. Nunca
   terminar com árvore suja.
7. **Nunca tocar** n8n, banco de produção, prompt da base (`lib/agent-prompt.ts`) nem guardrail.
   O mobile é só apresentação.
8. **Orçamento de tempo: 2h30 no total**, contando do início da execução (anotar a hora no
   relatório logo no começo). Passou de 2h15, parar de abrir item novo e ir para o fechamento.
9. **Ao terminar, SEMPRE, qualquer que seja o resultado** (tudo pronto, metade pronta, ou travado
   na fase 0): ver "Fim da execução" no fim deste arquivo. Desligar a máquina é obrigatório.

---

## Fase 0: casca do app no celular (obrigatória, ~15 min, quase toda no stash)

**Falta, depois do `git stash pop`:** corrigir o teste da folha "Mais", rodar as suítes de desktop
(o desktop tem que continuar idêntico), conferir em 375px nos dois temas e commitar.

**Entrega (o que o stash já tem, para conferir):**
1. `viewport` exportado em `app/layout.tsx` com `interactiveWidget: 'resizes-content'` (ler antes
   `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`).
2. `(app)/layout.tsx`: `h-screen` vira `h-dvh`; abaixo de `md`, coluna sem o respiro de 12px e sem
   gap (o conteúdo encosta nas bordas).
3. `NavRail` some abaixo de `md`; entra a barra de abas embaixo (Painel, Conversas com a contagem
   de não lidas, Pipeline, Mais) e a folha "Mais" (Agente só dono, Equipe, Perfil, tema, enviar
   feedback, sair, "Em breve"). Tudo dentro do `NavRail`, para a assinatura de realtime continuar
   sendo uma só. Barra some em `/inbox/[id]` e em `/agente`.
4. Base: `sheet` ganha `lado="baixo"` (topo arredondado, até 92% da altura, área segura) com
   `.anim-baixo` no `globals.css`, incluída no `prefers-reduced-motion`.
5. Faixas do topo (`BillingBanner`, `WhatsAppBanner`, `AvisoMontagem`) em versão fina no celular.
6. Projeto `mobile` no `playwright.config.ts` (375x812, `hasTouch`, `isMobile`), sobre telas
   `/design`, com `e2e/mobile.design.spec.ts` checando em toda tela: sem rolagem horizontal, nenhum
   alvo de toque abaixo de 44px, nenhum texto abaixo de 12px. E a barra de abas: aparece nas telas
   de lista, some na conversa e no Agente, abre a folha "Mais".

**Pronto quando:** o desktop continua idêntico (as suítes `sem-login` e com login passam sem
mudança de asserção) e o `mobile` passa.

## Fase 1: Conversas (~35 min)

**Entrega:**
- `/inbox` no celular mostra só a lista; `/inbox/[id]` mostra só a conversa, com seta de voltar
  para `/inbox`. Hoje o layout do inbox põe lista e conversa lado a lado: a lista ganha
  `max-md:hidden` quando há conversa aberta, e a conversa ocupa a tela.
- Lista: seletor Hoje / 7 dias / Tudo, busca, chips com rolagem horizontal (dissolvendo nas bordas).
- Cabeçalho da conversa no celular: voltar, avatar, nome, linha de ESTADO embaixo do nome ("IA
  atendendo", "IA pausada · ninguém atende", "Você está atendendo", "Ana está atendendo") e os três
  pontos com Quem atende (transferir), IA nesta conversa (a chave) e Dados do contato.
  ⚠️ As regras de atribuir e religar (atribuir pausa a IA, religar larga o responsável) continuam as
  mesmas: o menu chama os MESMOS handlers do `ConversationView`, não escreve de outro jeito.
- `ContextPanel` (hoje `hidden lg:block`) abre como folha de baixo no celular.
- Caixa de escrita no estilo do Claude, só no celular: faixa de contexto em cima, campo, "+" de
  anexo, pílula do modo (Responder, Nota interna, Orientar a IA) e enviar na cor do modo. As frases
  de contexto estão no `AJUSTES-2.md`. O modo volta para Responder depois de enviar nota ou
  orientação. Conta bloqueada: a caixa some, como hoje.

**Pronto quando:** as suítes com login, INCLUSIVE `logado-serial` (realtime e "zero buscas ao abrir
o inbox"), passam; e no `mobile` a lista abre a conversa, voltar volta, a folha do contato abre.

## Fase 2: Painel, Equipe, Perfil, Assinatura (~20 min)

- Painel em uma coluna: manchete (com o gráfico de horas dentro), "Precisa de você", operação em
  2x2, movimento com altura contida, assuntos, a última resposta. O gráfico continua contando
  resposta da IA (a igualdade com a manchete tem teste nas duas suítes e não pode quebrar).
- Equipe: convite empilhado; remover num menu da linha, com a confirmação que já existe.
- Perfil: trocar senha em folha de baixo.
- Assinatura: botão de pagar preso embaixo, acima da área segura.

## Fase 3: Pipeline (~25 min)

- Um estágio por vez no celular: faixa de estágios rolando para o lado (bolinha da cor, nome,
  contagem), a lista do estágio embaixo, e o resumo do estágio.
- Mover o card por um botão que abre a folha de estágios, chamando a MESMA função que o arrastar
  chama hoje (mesma escrita de `stage` e `stage_source='human'`). Arrastar continua só no desktop.
- Filtro "Todos os estágios" some no celular; busca e atendente ficam.
- Gerenciar estágios: o diálogo atual vira folha em tela cheia no celular.
- **Fora, até o dono decidir:** "Desfazer" e trava de conta bloqueada (PENDENTE 3 e 4).

## Fase 4: Agente (~25 min)

- Cabeçalho: voltar, título, chave "Agente ativo"; Testar, Ver prompt, Usar um modelo e Escrever o
  prompt à mão nos três pontos.
- Três abas presas no topo; tudo em uma coluna (Horário e Documentos empilhados, Horário primeiro).
- Barra de salvar presa embaixo, no lugar da barra de abas do app, com as frases de hoje.
- Bancada de teste: já é painel de largura toda no celular; ganha as abas "Conversa" e
  "Diagnóstico" abaixo de `md`.
- Modo avançado continua editável (PENDENTE 5).
- ⚠️ `mostrarOpcionais` segue sendo a única bifurcação entre montagem e agente.

## Fase 5: Montagem, Conectar e entrada (~15 min)

- Montagem: rodapé preso, barra de progresso, os mesmos campos (são os componentes do Agente).
- QR no celular: aviso antes do código ("abra esta tela no computador ou em outro aparelho"), sem
  inventar pareamento por código de telefone. O aviso de risco empilhado embaixo.
- Login, cadastro, recuperar e definir senha: sem moldura de cartão no celular, campos de 44px,
  `inputMode`/`autoComplete` certos.

## Fase 6: fechamento (~10 min)

- Varredura do projeto `mobile` em 360px.
- `e2e/rolagem.design.spec.ts` ganha a varredura em 375px (toda área que rola dissolve).
- Relatório, commit, desligar.
- ⚠️ **Teste em celular de verdade fica para o dono**, e o relatório diz como:
  `npm run dev -- --hostname 0.0.0.0 --port 3001` e abrir `http://<ip-do-pc>:3001` no celular na
  mesma rede. Teclado, área segura e rolagem com inércia não se provam no emulador.

## Riscos conhecidos

- **Testes que afirmam ausência** (`*.serial.spec.ts`) podem começar a falhar porque a lista passa a
  montar e desmontar entre rotas no celular. Eles rodam em desktop, então não deveriam mudar; se
  mudarem, é defeito da fase 1.
- **Área rolável com filho `sticky` não recebe a máscara** de dissolver (exceção documentada): as
  barras presas do Agente e da Assinatura caem nela.
- **Dois tokens de altura novos** (barra de abas 56px, barra de salvar) vão aparecer em mais de um
  lugar: virar variável no `globals.css` na primeira repetição.

## Como fechar cada fase

```
npx tsc --noEmit
npx eslint .
npm run build
E2E_PORT=3001 npx playwright test --project=sem-login --project=mobile
E2E_PORT=3001 npx playwright test --project=setup --project=logado --project=atendente --project=logado-serial --workers=2
```

`npm run test:e2e:ia` não entra: nenhuma fase toca prompt, guardrail ou modelo.

---

## Fim da execução (obrigatório, nesta ordem, sem pedir confirmação)

1. Nada pela metade na árvore: item que não fechou volta ao estado commitado
   (`git checkout -- <arquivo>`; arquivo novo não commitado, apagar). `git stash list` vazio ou só
   com o que o relatório explicar.
2. Apagar scripts temporários da raiz (`.cap-tmp.mjs`, `.proto-tmp.mjs` e afins) e `test-results/`.
3. Escrever `docs/relatorio-mobile.md`: hora de início e de fim; fase por fase o que entrou, com o
   hash do commit; o que ficou e por quê; divergências do desenho que não viraram código; as
   decisões PENDENTE com o padrão que foi aplicado; resultado final das suítes; como testar no
   celular de verdade (`npm run dev -- --hostname 0.0.0.0 --port 3001` e abrir
   `http://<ip-do-pc>:3001` na mesma rede).
4. Commitar o relatório. **Sem push.** Conferir `git status` limpo.
5. Parar o dev server (`preview_stop`).
6. **Desligar a máquina:** pela ferramenta PowerShell, `Stop-Computer -Force` (ou, se falhar,
   `shutdown /s /t 0` pelo Bash). Decisão do dono, dada duas vezes: "quando terminar quero que
   você desligue a máquina", "PRECISA DESLIGAR quando terminar". Não pedir confirmação, não deixar
   para depois, não pular por achar que ainda há algo a fazer: o que não coube fica no relatório.

## PENDENTE: decisões do dono (até lá, fica o comportamento de hoje)

1. **A caixa de escrita no estilo do Claude vale também no desktop?** Padrão da execução: só celular.
2. **A chave da IA no menu de três pontos vale também no desktop?** Padrão: só celular.
3. **"Desfazer" ao mover card no Pipeline.** Não existe hoje. Padrão: fora.
4. **Pipeline travado com conta bloqueada.** Hoje não trava. Padrão: fora.
5. **Modo avançado do agente no celular: editável ou só leitura?** Padrão: editável, como hoje.
6. **"Ver quem está esperando" (Painel) abrir Conversas já no filtro Esperando.** Padrão: como hoje.
7. **Entrada para Assinatura dentro de Perfil** para a conta ativa. Padrão: fora.

## Divergências do desenho final

Lido em 23/09/2026 às 01:40, navegando o protótipo por Playwright (capturas no scratchpad da
sessão). No geral o desenho bate com este plano; o que muda ou acrescenta:

- **Folha "Mais":** cabeçalho com avatar, nome e "Dono · <empresa>"; a linha Agente mostra o estado
  ("Agente ativo" em verde) e todas as linhas de navegação têm seta à direita; o tema é uma CHAVE
  ("Tema escuro" ligada no escuro), não um botão de texto. Seguir.
- **Barra de abas:** o contador em Conversas é âmbar no desenho (conversas esperando). No código
  fica a contagem que o trilho já tem (não lidas), pela regra 1: trocar o que o número conta é
  decisão de produto. Vai para o relatório.
- **Pipeline:** busca e "Gerenciar estágios" viram ÍCONES no cabeçalho; atendente é uma pílula;
  o card tem o botão "Mover" no rodapé; a folha de mover tem o subtítulo "Vira 'Movido pelo time',
  e a IA não desfaz." e marca o estágio "atual". O desenho tem "Desfazer" (3 ocorrências): fica
  FORA (PENDENTE 3).
- **Montagem:** topo com "Sair" e, embaixo, "o progresso fica salvo"; o aviso do celular é um
  cartão roxo "Está neste celular?". Seguir.
- **Entrada:** sem moldura de cartão, como o plano diz.
- **Seletor lateral do protótipo** tem estados que não viram código: "Conta: Leitura", "Agente:
  Novo", "Conexão: Falha". São só para revisar o desenho.
