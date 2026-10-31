# Handoff: Campanhas v2

## Rodada de 31/10/2026 (Parte A, a parte real): detalhes do lead no banco, Nova busca de verdade (branch `claude/lucid-cerf-1wh6fc`)

**Parado para o "pode aplicar" do Franck.** O código da parte real está pronto e testado; ele depende da
migration abaixo, que NÃO foi aplicada (regra do repo: agente não aplica DDL, e esta sessão não tem o MCP
do Supabase).

- **Migration** `supabase/migrations/20261031021139_prospeccao_leads_detalhes.sql` (aditiva):
  - as 8 colunas em `prospeccao_leads`, todas anuláveis e sem default: `lat numeric`, `lng numeric`,
    `reivindicado boolean`, `horarios jsonb`, `distribuicao_notas jsonb`, `fotos int`, `categorias
    text[]`, `instagram text`. Nada existente é apagado ou reescrito;
  - para as colunas servirem, três funções mudam e duas nascem (todas só service_role):
    `prospeccao_concluir_busca` grava os campos novos; num lead que já estava na base, a busca nova traz
    juntos a pontuação e o que entra nela (nota, avaliações, site, perfil, horário) e o resto só completa
    (vazio não apaga; marcação e "parou" nunca mudam; sem mudança, a linha não é reescrita).
    `prospeccao_leads_pagina` devolve as colunas novas, o endereço e a pontuação gravada, e ganha o filtro
    "Perfil não reivindicado" (muda o retorno, por isso `drop` e `create`; chamadas antigas continuam
    valendo). Novas: `prospeccao_pagina_do_lead` (o pino clicado leva a tabela até o lead) e
    `prospeccao_pontos_da_busca` (os pinos, até 2000).
  - **Testada num Postgres 16 local** com as migrations reais: lead novo, lead achado de novo (pontuação e
    dados juntos, categoria vazia não apaga, linha sem mudança fica intocada), o filtro, a página de cada
    um de 25 leads, os pinos, e a migration rodando duas vezes.
- **Fonte:** `categoryFilterWords` (pago) só quando "Só desta categoria" está marcada; o custo do rodapé
  soma US$ 0,001 por empresa e a página avisa. Nota, site e avaliações seguem do nosso lado (a categoria
  também é conferida do nosso lado). O formato real do `openingHours` (`"07:30 to 12:30, 13:30 to 19:00"`,
  `"Fechado"`) tem teste com o texto exato. Os campos da fonte vão ao banco nas 8 colunas e voltam iguais.
- **Telas reais:** a página `/campanhas/buscas/nova` (`adminDaPagina`; o mapa abre na cidade da última
  busca, lida no servidor numa linha só; voltar e "Buscar" levam a Leads sem empilhar o formulário no
  histórico); o detalhe da busca com os pinos de verdade e o círculo quando houve raio; a ficha com os
  dados reais; o filtro "Perfil não reivindicado"; o selo mostra a pontuação GRAVADA (um lead antigo
  fica com a dele até uma busca nova achá-lo). Marcar um lead na tabela recolore o pino na hora, e o mapa
  não perde o zoom quando a tela relê. A campanha que mandou buscar contatos volta com você da Nova busca
  (`?rascunho=`). Rotas novas: `GET /api/admin/campanhas/leads/[id]` e `GET
  /api/admin/campanhas/buscas/[id]/pontos`, ambas no `rotaDoAdmin` e na lista de guarda do teste.
  Nenhuma escrita nova do admin (as que existem já gravam `admin_acoes`).
- **Bug achado de passagem e corrigido:** "Nova campanha" criada antes de as conexões chegarem nascia sem
  número e o "Continuar" ficava travado sem motivo à vista (o teste do assistente falhava 3 em 6 já antes
  desta rodada). Agora a campanha nova recebe o número padrão quando as conexões chegam; um rascunho salvo
  que só foi aberto nunca muda sozinho.
- **Menu "Gestão da OBS"** já estava na página real desde a rodada anterior (desktop e "Mais" no celular).
- **Lista de cidades:** como combinado, fica a do espelho; você roda `node scripts/gerar-municipios.mjs`.

### O que testei
- Testes de lib (`campanhas-lib`): mapeamento com dados inventados (nenhum telefone real), o formato real
  do horário, a pontuação com os sinais novos, `customGeolocation` e `categoryFilterWords`, o custo, o
  banco ida e volta, jsonb torto, o recorte da query, a cidade de partida. Guarda das rotas
  (`central-clientes-lib`) com a página e as rotas novas. Telas no preview (`campanhas.design`): círculo
  no detalhe, pino recolorido ao marcar, aviso e custo da categoria, 404 das rotas novas e login das
  duas páginas.
- Suítes gratuitas sem login inteiras; `/simplify` e `/code-review` com as correções (lista no fim).

### O que falta / o que precisa de você
1. **"Pode aplicar"** para a migration. Depois, numa sessão com o MCP do Supabase: `apply_migration`
   com a versão e o nome do arquivo, `generate_typescript_types` por cima de `lib/database.types.ts` (eu
   editei os tipos à mão no formato do gerador; o diff deve sair vazio) e `npm run typecheck`. A página
   real só funciona DEPOIS da migration (a leitura de leads pede o filtro novo): aplicar antes do deploy.
2. **O ensaio** (você mesmo como único lead): uma busca real em `/campanhas/buscas/nova` com raio pequeno
   em volta do seu endereço, de preferência com "Só desta categoria" marcada uma vez (os nomes sugeridos
   em `CATEGORIAS_SUGERIDAS` ainda são provisórios; se a fonte devolver vazio com a categoria, me diga).
   Conferir: o pino no mapa dentro do círculo, a ficha com horário, perfil e avaliações, o filtro "Perfil
   não reivindicado", e a pontuação do selo.
3. A lista de cidades pelo IBGE (`node scripts/gerar-municipios.mjs`).

### Achados das revisões que deixei de lado (com o motivo)
- Juntar o filtro de `prospeccao_leads_pagina` e `prospeccao_pagina_do_lead` numa função só: uma função
  SQL com `set search_path` não é "inlinada" e pesaria na leitura da tabela; ficou o comentário "mudar um
  muda o outro" e o teste local das 25 páginas.
- `lat`/`lng` como `double precision`: você pediu `numeric`; a leitura converte.
- Preview da Nova busca numa rota própria: a tela do preview segue dentro de `/design/campanhas`.

---

## Rodada de 31/10/2026 (Parte A): Nova busca vira página, mapa e campos ligados (branch `claude/lucid-cerf-1wh6fc`)

**Parado para a revisão do Franck.** Protótipo em `/design/campanhas?tela=nova-busca` (ou "Nova busca" na aba Leads).

- **Página própria**, com voltar para Leads: o mapa grande é a peça principal (à direita no desktop, em cima
  no celular) e os campos ficam numa coluna ao lado, rolando por dentro; o rodapé com o custo e "Buscar"
  fica sempre à vista. Todos os campos de antes continuam (segmento, UF, cidade, raio, quantidade, nota,
  avaliações, categoria, site, fechadas, contatos). Uma recusa do servidor aparece no rodapé e a página
  fica aberta para corrigir; dando certo, volta para Leads com a busca "Buscando".
- **Mapa e campos ligados:** o mapa abre já na cidade da última busca (sem busca, em Mutum, MG), com os
  campos preenchidos. Escolher UF e cidade move o mapa. Mover o centro (arrastar o pino ou clicar) cria a
  área e, se o ponto cai noutra cidade, troca UF e cidade nos campos (pela sede mais próxima da lista). O
  aviso "O centro está em ..." saiu: os próprios campos mostram a cidade.
- **Bug da rolagem, causa:** no modal, a trava de rolagem do diálogo (Radix) cancelava a roda do mouse
  quando ela caía sobre o mapa, e o mapa não usava a roda para zoom; como o mapa aparecia grande no meio do
  formulário depois da cidade, a página "parava" de rolar. Fora do modal (o mapa do detalhe) a página
  rolava. Correção: a Nova busca não é mais modal, e a roda sobre o mapa dá zoom NO MAPA (nos dois mapas);
  fora dele a página rola. Teste de regressão das duas coisas.

### Para o Franck
1. **Revisar** a página da Nova busca (desktop e celular).
2. **A página de verdade** ganha o endereço `/campanhas/buscas/nova` junto com a parte real, depois da
   aprovação (hoje, no protótipo, é uma tela dentro de `/design/campanhas`).
3. **Continua pendente:** liberar o DDL aditivo das 8 colunas em `prospeccao_leads` (`lat`, `lng`,
   `reivindicado`, `horarios`, `distribuicao_notas`, `fotos`, `categorias`, `instagram`); gerar a lista de
   cidades pelo IBGE numa máquina com acesso; o título "Gestão da OBS"; o layout do mapa no detalhe da busca.

### Decisões que tomei
- Antes de mexer no mapa, a busca continua sendo a cidade inteira (o pino fica na sede, sem círculo).
- A cidade de partida é a da busca mais recente com cidade escolhida da lista.

---

## Rodada de 30/10/2026 (2a revisão): bug do refresh, centro e raio no mapa, menu (branch `claude/lucid-cerf-1wh6fc`)

**Parado para a revisão do Franck.** Protótipo em `/design/campanhas`; a correção do bug já vale na página real.

- **Bug do refresh ("Carregando…" eterno com "Nenhum resultado" embaixo), corrigido na página real.** Causa:
  o HTML que o servidor entregava em `/campanhas` era a tela vazia, e todos os números vinham de leituras no
  navegador, sem prazo; um refresh mostrava esse HTML até elas voltarem, ou para sempre se uma travasse (o
  HTML do preview reproduzia exatamente o que você viu). Agora a primeira tela (totais, primeira página de
  buscas e o painel da base) vem lida do servidor, como a lista de Clientes; toda leitura tem prazo de 20 s
  e vira "Não deu para carregar agora" com "Tentar de novo"; a paginação só aparece com dados. Testes de
  regressão: o HTML já traz as buscas, dois refresh seguidos, e uma leitura que nunca volta (`?cenario=travado`).
- **Nova busca:** UF, cidade e, ao escolher a cidade, o mapa centraliza nela. "Raio: a cidade inteira" até
  você mexer; o "+" cria o círculo de 5 km, o pino central arrasta, clicar no mapa move o centro, "−"/"+"
  andam por 1, 2, 3, 5, 8, 10, 15, 20, 30 e 50 km, "Usar a cidade inteira" desfaz. Centro fora da cidade:
  "O centro está em Lajinha" (pela sede mais próxima), sem bloquear. Com ajuste vai `customGeolocation`
  (longitude primeiro, como no run `Rfb0VfmDckdMIbiwT`) e não vai `locationQuery`; sem ajuste, "Cidade, UF,
  Brasil". O centro e o raio ficam no `opcoes` da busca (sem DDL) e o detalhe diz "Mutum, MG · raio de 5 km".
  O mapa da Nova busca é o mesmo componente do detalhe (`components/admin/campanhas/Mapa.tsx`).
- **Menu:** o CRM como antes (Painel, Pedidos, Conversas, Contatos, Pipeline, Agente, Equipe, Follow-up em
  breve) e, no fim, a seção "Gestão da OBS" com Campanhas e Clientes, só admin; no celular o mesmo grupo
  dentro de "Mais". O título é `BRAND.secaoDoDono` em `lib/brand.ts`: trocar é uma linha.

### Para o Franck (esta rodada e o que segue pendente)
1. **Revisar** o menu novo, o mapa da Nova busca e o título da seção ("Gestão da OBS" é proposta).
2. **Liberar o DDL aditivo das 8 colunas** em `prospeccao_leads` (continua pendente): `lat numeric`, `lng
   numeric`, `reivindicado boolean`, `horarios jsonb`, `distribuicao_notas jsonb`, `fotos int`, `categorias
   text[]`, `instagram text`. Sem isto a página de verdade fica sem pinos no detalhe, sem a ficha completa e
   sem o filtro "Perfil não reivindicado".
3. **Gerar a lista de cidades pelo IBGE** numa máquina com acesso (`node scripts/gerar-municipios.mjs`) e ver
   se o diff muda algum nome (esta sessão não alcança servicodados.ibge.gov.br).
4. A pergunta do layout do detalhe da busca continua: o mapa empurra a tabela para baixo da primeira tela.
5. Ainda a conferir com um item real do dataset: o formato do `openingHours` em português e os nomes das
   categorias sugeridas.

### Decisões que tomei
- O centro e o raio só valem depois de você mexer no mapa (o "+" ou o pino); antes, a busca é a cidade
  inteira, que é o que a busca de 30/10 fez.
- O aviso de cidade vizinha usa a SEDE mais próxima (o arquivo tem a coordenada da sede, não o contorno do
  município): perto da divisa ele pode errar para o lado da cidade vizinha. Serve para avisar, nunca decide.
- O mapa do detalhe ainda não desenha o círculo da busca; se quiser, entra junto da parte real.

---

## Rodada de 30/10/2026: busca de leads, mapa e menu (branch `claude/lucid-cerf-1wh6fc`)

Revisão do Franck depois da primeira busca real. **Protótipo pronto em `/design/campanhas`, parado para a
revisão do layout.** A página de verdade ainda não ganhou nada disso (a não ser o item do menu e a lista
de cidades), de propósito: fluxo fixo, protótipo primeiro.

O que dá para ver no protótipo:
- **Menu:** "Campanhas" logo abaixo de Contatos, só para admin (no celular, dentro de "Mais").
- **Nova busca:** UF primeiro; a cidade num campo que busca digitando (sem acento e sem diferença de
  maiúscula: "mutum", "Mutúm") e só aceita cidade da lista daquela UF. Filtros novos: "Mínimo de
  avaliações" e "Só desta categoria" (sugestões a partir do segmento). Nota, site, categoria e avaliações
  são filtrados do nosso lado, de graça; o actor só recebe "sem fechadas" e o enriquecimento de contatos.
- **Detalhe da busca:** um mapa com um pino por lead, na cor do estado (não contatado, bom, contatado,
  respondeu; descartado é um anel vazado), com a legenda e as contagens. Clicar num pino leva a tabela até
  a página do lead e destaca a linha; o ícone de pino na linha destaca o pino no mapa.
- **Ficha do lead** (clique no nome): pontos e motivos, "Perfil não reivindicado", ganchos do horário
  (fecha antes das 18h, não abre sábado, fecha no almoço), o horário da semana, as avaliações por
  estrela, fotos, categorias, endereço e o @ do Instagram.
- **Tabela:** filtro novo "Perfil não reivindicado". A pontuação ganhou perfil não reivindicado (15) e
  horário (10); os pesos continuam provisórios (D9): sem site 25, segmento 20, avaliações 20, nota 10.

### Para o Franck (esta rodada)
1. **Revisar o layout** em `/design/campanhas?tela=busca` (mapa e ficha) e na "Nova busca". Uma pergunta: o
   mapa empurra a tabela para baixo da primeira tela (a regra de 29/10 era tudo acima da tabela em
   1440x900). Prefere assim, o mapa mais baixo, ou o mapa ao lado dos cartões de bairro e presença?
2. **Liberar o DDL aditivo** para a parte real (só colunas novas em `prospeccao_leads`, nada existente muda):
   `lat numeric`, `lng numeric`, `reivindicado boolean`, `horarios jsonb`, `distribuicao_notas jsonb`,
   `fotos int`, `categorias text[]`, `instagram text`. Sem isto a página de verdade não tem pinos, ficha
   completa nem o filtro de perfil. A pontuação dos leads já gravados continua a antiga até uma nova busca.
3. **Lista de cidades:** gerei `lib/dados/municipios.json` a partir do espelho `kelvins/municipios-brasileiros`
   (os mesmos códigos do IBGE; 5.571 cidades), porque a rede desta sessão bloqueia
   servicodados.ibge.gov.br. O script versionado (`scripts/gerar-municipios.mjs`) usa a API do IBGE por
   padrão; rode uma vez numa máquina com acesso (`node scripts/gerar-municipios.mjs`) e veja se o diff
   muda algum nome.
4. **"Incluir cidades vizinhas" (raio em km): NÃO fiz.** O README do actor estava bloqueado aqui (apify.com),
   então não deu para confirmar o formato do `customGeolocation`. Se você colar o trecho do README (ou
   liberar o domínio), entra na parte real.
5. **Conferir com a busca de 30/10** (o JSON de um item do dataset ajuda): o nome dos dias e o formato das
   horas em `openingHours` com `language: pt-BR` (o leitor aceita português e inglês, "08:00–18:00", "8 AM
   to 6 PM", "Fechado", "Aberto 24 horas"), e os nomes das categorias sugeridas (lista provisória em
   `CATEGORIAS_SUGERIDAS`, `lib/prospeccao.ts`).

### Decisões que tomei nesta rodada
- **Filtrar do nosso lado** nota, site, categoria e avaliações (pediu para preferir isso quando o dado já
  vem). Consequência: o teto de 50 por segmento conta ANTES do filtro, então uma busca filtrada pode voltar
  com menos empresas. O `categoryFilterWords` pago fica disponível se preferir gastar para não trazer o
  dentista.
- **Mapa:** Leaflet 1.9.4 (versão fixa), tiles do OpenStreetMap com a atribuição, escuro por filtro nos
  tiles; o mapa só carrega no navegador e só no detalhe da busca. Neste container os tiles não carregam
  (rede), então as capturas mostram só os pinos; no seu navegador o mapa aparece.
- **Combobox de cidade** é uma peça nova da camada base (`components/ui/combobox.tsx`), com o desenho do
  `Select`.

---

# Handoff: Campanhas v2 backend (rodada de 29 e 30/10/2026, já na main)

Branch `claude/campanhas-plano-1c34fe`. Never merged, never pushed to `main`. Phases 0 and 1 by the Cursor
agent (night of 29 to 30/10/2026); phases 2 to 7 by Claude Code in the cloud on 30/10/2026.

## Para o Franck (o que só você pode fazer, na ordem)

1. **Apify:** crie a conta e gere o token (Console, Settings, API and Integrations). Não cole o token no chat.
2. **Vercel (Production):** crie as variáveis `APIFY_TOKEN` (o token do item 1) e `APIFY_WEBHOOK_SECRET` (um
   texto longo e aleatório que você inventa, só a Vercel guarda). `CRON_SECRET` já existe (o da agenda); o
   cron das Campanhas usa o MESMO valor. Faça um redeploy depois.
3. **Supabase Vault** (Dashboard, Project Settings, Vault): crie `prospeccao_cron_url` = a URL de produção
   terminando em `/api/prospeccao/cron`, e `prospeccao_cron_bearer` = o mesmo valor do `CRON_SECRET`.
4. **Aplicar a migration** `supabase/migrations/20261030043000_prospeccao_cron_job.sql` (agenda o tick de 5 em
   5 minutos; os segredos são lidos do Vault a cada execução, nunca copiados para o job). Sem o item 3 o job
   roda e não chama nada. Para desligar: `select cron.unschedule('prospeccao_tick_5m');`.
5. **Uma busca real de 5 lugares** em `/campanhas` (Leads, Nova busca; o menor teto da tela é 50, então use um
   segmento raro numa cidade pequena). Confira: (a) a busca fica "Pronta" sozinha em poucos minutos (webhook)
   ou em até ~13 min (o cron confere buscas paradas há 8 min); (b) no Apify Console, Input da execução, os
   valores de `placeMinimumStars` (usamos `threeAndHalf`, `four`, `fourAndHalf`) e `website` (`allPlaces`,
   `withoutWebsite`, `withWebsite`) foram aceitos; (c) os leads chegam com telefone, nota, site, bairro e
   cidade. Se algum campo vier vazio, me mande o JSON de UM item do dataset (sem dados de terceiros, se
   preferir) e eu ajusto `lib/apify-campos.ts`. Mesmo que o actor ignore um filtro, aplicamos nota, site e
   fechadas do nosso lado (`filtrarPelasOpcoes`).
6. **Ensaio com o seu celular como único lead**: hoje só um lead vindo de uma busca entra numa campanha. Faça
   uma busca que ache a sua empresa (ou me peça um modo seguro de inserir só o seu número; NÃO fiz isso).
   Crie a campanha com só esse lead (filtro "só os bons" e marque só você como bom), Iniciar, e espere o
   tick (8h às 18h, segunda a sábado). Confira a mensagem com a linha "Se não quiser receber mais
   mensagens, é só responder SAIR.", responda "oi" (vira "Respondeu" no próximo tick) e depois "SAIR"
   (vira "Pediu para parar" e o lead nunca mais entra).
7. **A pergunta do n8n (`fromMe`)**: no ensaio, veja se a mensagem enviada pela API pausou a IA da sua
   conversa com a OBS ("Pausar IA (Franck digitou)" no `obs-atendimento`). Para um lead NOVO não há
   `dados_cliente` ainda, então nada pausa; para um telefone que já conversa com a OBS, pode pausar. Eu não
   toquei no n8n; me diga o que viu e decidimos.
8. **Revisar e fazer o merge** quando estiver de acordo (o fluxo: você faz o merge).

## Estado

- Fase 0 e 1 (Cursor): decisões D1 a D9; DDL aditivo APLICADO em produção (`20261030034211_prospeccao_do_dono.sql`).
- Fase 2: fonte Apify revisada e corrigida (ver "Revisão do trabalho da noite"); `data.md` com as envs.
- Fase 3: `/campanhas` (só admin, `adminDaPagina`), link "Campanhas" no topo da central Clientes. As telas
  aprovadas leem de `FonteDeCampanhas`: `lib/campanhas-fonte.ts` (rotas) na página de verdade, memória no
  preview. Layout igual ao aprovado (conferido por captura de tela em 1440x900).
- Fase 4: 13 rotas em `/api/admin/campanhas/*` (lista, totais, conexões, buscas, leads e marcação, painel da
  base, resultados, prévia do recorte, rascunho, detalhe e leads, iniciar/pausar/retomar). O servidor confere
  de novo `problemasParaIniciar` (com `problemasDaVariante`) e que o número é de uma empresa sua; a fila sai
  de `prospeccao_leads_do_filtro` (`podeEntrarNaCampanha` no SQL).
- Fase 5: cron revisado (uma mensagem por campanha por tick, linha de saída pelo código, respostas lidas de
  `chat_messages` em lotes, D6).
- Fase 6: painéis lendo os agregados SQL, dobrados pelos gêmeos puros.
- /simplify e /code-review rodados (achados aplicados; os pulados estão no fim deste arquivo).
- Fase 7: `e2e/campanhas-lib.design.spec.ts` (24 testes puros) e `e2e/campanhas.design.spec.ts` (9 de tela e
  das travas sem login), guard list atualizada. Suíte `sem-login`: 827 passaram; 6 de
  `bancada-conversa.design.spec.ts` não abriram o navegador neste container (o spec usa um launch próprio que
  procura um headless shell que a nuvem não tem), sem relação com Campanhas. Suítes com login e pagas: não
  rodadas (regra: só o orquestrador local, e nada aqui envia mensagem).

## Revisão do trabalho da noite (o que estava errado)

1. O webhook ad hoc do Apify ia no CORPO do POST, que o Apify trata como entrada do actor: o fim da busca nunca
   chegaria. Agora vai na query `webhooks` (base64), com o segredo no header `x-apify-secret`
   (`headersTemplate`) e o token como Bearer; nada secreto em URL.
2. O fallback do cron concluía a busca pelo dataset sem olhar o status da execução: uma busca ainda rodando
   seria gravada pela metade. Webhook e cron agora perguntam à fonte (`lerExecucao`).
3. A migration do pg_cron copiava o bearer para o texto do job (visível em `cron.job`). Agora lê do Vault a cada
   execução.
4. Um envio "pulado" devolvia o lead à fila: o cron reivindicaria o mesmo lead para sempre. Agora vira
   "falhou" com o motivo.
5. Detalhes: `select("*")`, casts `as never`/`as unknown as`, Evolution chamado na renderização (agora o
   navegador pede `/conexoes`), respostas lidas uma consulta por lead (agora lotes de 25 por empresa).

## Decisões que tomei (diga se quer outra)

- **Números que enviam:** só as empresas de que você é membro (`user_clients`) com instância. A OBS entra.
- **Páginas numeradas por offset** (como o Cursor): a tela pede "página 7"; são tabelas suas, de milhares de linhas.
- **Rascunho salva sozinho** 600 ms depois da última mudança; "Cancelar" salva antes de sair.
- **Reserva da vez:** o lead é marcado "enviado" ANTES do envio (nunca manda duas vezes). Se o processo
  morrer bem no meio, esse lead fica "enviado" sem ter recebido. Preferi o risco de perder um envio ao de
  repetir mensagem para um desconhecido.
- **Respostas:** 14 dias de observação depois do envio; uma resposta conta só até o próximo envio ao mesmo
  lead (a "segunda chance" fica com a dela). O cron lê as respostas ANTES de enviar: um "SAIR" lido no tick
  já tira o lead de toda fila; se a leitura falhar, o tick não envia nada.
- **Falhas de envio:** se a Evolution não confirmar (recusa, erro ou tempo esgotado; a mensagem pode até ter
  saído), o lead vira "Falhou" e não é tentado de novo, para nunca receber duas vezes. Uma falha ANTES de
  entregar à Evolution devolve o lead à fila. Só "desconectado" pausa a campanha; estado desconhecido tenta
  no próximo tick.
- **Lead sem nome** (a fonte não trouxe o nome): fica na base, mas na vez dele vira "Falhou" em vez de mandar
  "Achei a Sem nome...".
- **Busca perdida:** uma busca ainda "Buscando" depois de 2 horas vira "Falhou" ("A fonte não respondeu a
  tempo").

## O que ficou de fora

- Nenhuma mensagem real foi enviada; n8n intocado; nenhum DDL aplicado nesta sessão.
- Não há tempo real nas telas (de propósito: a busca em andamento é relida a cada 10 s, só com a aba visível).

## Achados das revisões que ficaram de fora (de propósito)

- Unificar `useLeitura` (Campanhas) com `useCarga` (central): mexeria nas abas da central já aprovadas.
- Trocar o "Tentar de novo" das tabelas por `FalhaAoLer`: muda o visual dentro da tabela aprovada.
- Dia da semana, plural e taxa repetidos em `lib/prospeccao.ts` (vêm do protótipo aprovado): limpeza para
  depois, sem mudança de comportamento.
- Provar os agregados SQL contra o banco de verdade: o teste puro prova a dobra; uma prova contra
  `prospeccao_resultados` real cabe na suíte com login (não rodada aqui).
