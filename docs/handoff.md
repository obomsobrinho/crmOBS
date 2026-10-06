# Handoff: por onde começar

Escrito em **07/09/2026**, quando o dono trocou de plano do Claude e perdeu o histórico das
conversas. Serve para um agente (ou uma pessoa) que chega sem nenhum contexto.

Este arquivo é **mapa e estado**, não conteúdo. Ele não repete o que já está escrito em outro lugar;
diz onde está cada coisa e o que estava acontecendo no dia em que foi escrito.

---

## 1. O que ler, nesta ordem

| Quando | Leia |
|---|---|
| **Sempre, antes de tocar em código** | `CLAUDE.md` na raiz. Carrega sozinho no Claude Code. É o guia do projeto: schema, isolamento por tenant, convenções, armadilhas, e o porquê de cada decisão de arquitetura. |
| Antes de decidir **o que construir** | `docs/proximos-passos.md`. **Fonte de verdade de roadmap.** |
| Perguntas de **mercado, concorrente, preço, risco de banimento** | `docs/estrategia-2026-07.md`. É base de pesquisa; as conclusões prescritivas antigas estão superadas, e o banner no topo diz o que vale. |
| Antes de mexer em **cor, tipografia, espaçamento, componente base** | `docs/design-system/` (8 arquivos). O código tem os valores; esses arquivos têm o porquê. |
| Para **ler o que os testadores fizeram** | `docs/instrumentacao-beta.md`. Cinco consultas SQL. Não existe tela, e isso é decisão. |
| Para **escrever no Next 16** | `node_modules/next/dist/docs/`. Esta versão tem mudanças que quebram o que você aprendeu; `AGENTS.md` avisa. |

A antiga `Desktop/DesingSystem/` (obsoleta) foi para a Lixeira em 26/09/2026. O design system vale pelo `docs/design-system/`.

## 2. O que é o produto, em cinco linhas

CRM de WhatsApp com um agente de IA que atende, qualifica e passa para o humano quando precisa,
para pequenos negócios locais. **Horizontal de propósito**: advogado, pediatra, barbeiro,
engenheiro, clínica, comércio. Multi-tenant sobre Supabase com RLS. A Evolution API conecta o
WhatsApp por QR, o n8n é só o cano, e o cérebro é `POST /api/agent` neste repositório.

O lançamento é um **beta gratuito** com 5 a 10 conhecidos do dono. A cobrança está **construída e
desligada de propósito**.

## 3. Estado em 27/09/2026

### 05/10/2026: FAZER PRIMEIRO NA PRÓXIMA SESSÃO

**Onde estamos.** Auditoria de 01 e 02/10 fechada e no ar (13 frentes; relatório visual em
claude.ai/artifact/7bCGT53nePjp3vNofciazy). Regras novas em `.claude/rules/`, ADRs em `docs/adr/`.
O número de teste (instância OBM) foi restringido pelo WhatsApp em 03/10 (Evolution 403) e o dono
conseguiu recuperar. Banco de teste limpo em 05/10 (0 mensagens, 0 conversas, 0 contatos). A OBM
ganhou horário comercial (seg a sex 8 às 18) no prompt avançado e em `agent_config.hours`.

**RODADA em 05/10 (relatório: claude.ai/artifact/4rsVNF5yLaw7UjwhShBYYa).** 31 casos x 3, cérebro direto
(`runAgent` + guardrail, sem servidor e sem WhatsApp). Contexto, momento, interpretação e fidelidade passaram;
4 brechas de calendário (agenda sábado, "17h já passou" às 16h, "amanhã cedo" às 23h50, "de tarde" vira hoje).
Culpa: modelo (gpt-5.5 acerta, prompt simplificado falha igual). Calendário dos próximos 8 dias calculado pelo
código e injetado no turno resolve no mini (30/30). Pedido sem o cliente digitar NÃO reproduziu no cérebro.
Segunda rodada no guiado (odonto, advocacia, loja, pizzaria): mesmo padrão. **Calendário no código FEITO**
(edcf88f, `calendarioBlock`): erros de aberto/fechado nos segmentos caíram de ~12 para 1 em 120; OBM 28/30;
`test:e2e:ia` 27/27. Decidido pelo dono em 05/10: trava no agendar e feriados NÃO, a agenda (Google
Calendar) resolve. Pendentes: exemplo "terça à tarde" do prompt da OBM (agenda "de tarde" sem dia, 2/3,
mudança é do dono); guardrail barrando valor do cliente: dono decidiu NÃO mexer. Suíte fixa FEITA: `npm run test:e2e:bateria` (70 casos, 69 ok e 1 pendente do dono).
Teste do dono em 06/10 (conversa real, número da OBM): calendário certo ("amanhã, quarta, à tarde"). Achados: (1) barra da conversa fora do lugar, endurecida em `scroll-area.tsx` mas NÃO reproduzida, pedir novo teste; (2) aviso "Conversa marcada" chegou no grupo como "Aguardando mensagem" (falha de criptografia do WhatsApp entre o número da OBM e o grupo, provável efeito da restrição e reconexão de 03 a 05/10; não é código, o envio saiu do n8n às 11:26); (3) "consigo conversar agora" foi confirmado pela IA: regra nova na base, pede ajuda ao time em vez de prometer. Segundo teste (06/10 à tarde): agendar passa a exigir dia E horário (período sozinho pergunta o horário) e o resumo guarda o combinado que não aconteceu (ADR 2026-10-06). O dono vai apagar o grupo de avisos e criar outro (aviso do sistema chegava como "Aguardando mensagem"); depois, escolher o grupo novo no /agente.

**Prioridade 1, decidida pelo dono: bateria de DIAGNÓSTICO do atendimento.** Objetivo: ter certeza
de que o atendimento está correto e saber de quem é a culpa de cada brecha (modelo, prompt ou desenho
do agente), com poucos casos e não com milhares de mensagens. Decisões já tomadas:
- Cerca de 25 casos por dimensão (período e horário, contexto da conversa, momento da conversa,
  interpretação do pedido, fidelidade à base), com relógio FIXO (`agoraTeste`) e histórico escrito à
  mão; configuração FIXA no corpo (como as armadilhas), não o tenant real.
- Brechas reais que viram os primeiros casos (relato do dono): "amanhã" dito às 21h virou pergunta
  "seria hoje às 18h?"; handoff aberto sem o cliente digitar nada; confusão de horário em geral.
- Assertivas por máquina (action, menciona ou não a data/hora certa, pergunta de esclarecimento) e um
  modelo juiz só de apoio, nunca reprovando sozinho. Cada caso roda 3 vezes (erro intermitente é achado).
- Três variações para o diagnóstico: A = prompt e modelo de hoje; B = mesmo prompt em outro modelo
  (escolha do agente, olhando o que o mercado usa; justificar); C = mesmo modelo com prompt simplificado
  (`personaOverride`). Falha nas 3 = desenho; só some em C = prompt; só some em B = modelo.
  Começar só com A (cerca de 75 chamadas) e abrir B e C nos casos que falharem.
- Relatório por caso (prompt montado, histórico, data injetada, resposta, veredito) no scratchpad.
- ENTREGA FINAL: relatório em HTML (Artifact) fácil de ler, com brechas, decisões para o dono, e uma
  reflexão honesta sobre a ARQUITETURA do agente (hoje: um turno de LLM com persona + histórico + RAG +
  guardrail em TypeScript). Avaliar se faz sentido outro desenho: ferramentas/function calling, estado
  explícito da conversa (o que já foi combinado: data, hora), roteador de intenção antes da resposta,
  frameworks de agente (inclusive em Python), ou se o problema não pede isso.
- ⚠️ Nada de teste que mande WhatsApp de verdade (ver abaixo).

**Pendências com prompt pronto para outro agente (o dono roda):**
1. **Teste nunca envia WhatsApp:** guarda no n8n e no app para pular toda chamada da Evolution quando o
   telefone começa com 5500 (DDD 00), regra, ADR e checagem em `scripts/checagens.mjs`. Motivo provável
   da restrição de 03/10: a bateria `test:e2e:n8n` enviava respostas reais ao número inexistente.
   NÃO rodar `test:e2e:n8n` até isso estar feito.
2. **Trocar o número de WhatsApp conectado** (desconectar e conectar outro sem criar conta). Perguntar
   ao dono antes: quem pode trocar e o que acontece com o histórico e com o agente.
3. **Barra de rolagem da conversa** salta na roda do mouse e fica parada no arraste (paginação da
   conversa mexendo no scrollTop contra o thumb do Radix ScrollArea).

### 01/10/2026, madrugada (histórico)

O Supabase parou de responder a esta máquina por volta das 01:50 (login e banco; 25 minutos de
tentativas) e a sessão terminou sem duas conferências:
1. **Destino de avisos da OBM.** O cenário de agendamento da bateria `npm run test:e2e:n8n` troca
   `clients.notify_group_jid` por `5500000000099@s.whatsapp.net` e devolve no fim. O cenário passou,
   mas a devolução não conferia erro (corrigido depois). Conferir:
   `select notify_group_jid from clients where name='OBM';` tem que ser o GRUPO do dono (`...@g.us`).
   Se vier o número impossível, avisar o dono e pedir para escolher o grupo de novo em `/agente`.
2. **Limpar a conversa de teste** (SQL no topo de `e2e/semente.ts`, com `like '5500000000001%'`,
   porque a bateria do n8n grava o telefone com `@s.whatsapp.net`).

O resto da madrugada está commitado e no ar: espera deslizante no n8n, aviso "Conversa marcada",
envio que falha não para o resto, horários contados em código (`lib/horarios.ts`) e a bateria de
ponta a ponta (`e2e/atendimento.n8n.spec.ts`). O dono quer ser chamado para testar só com tudo
verde: rodar `npm run test:e2e:n8n` e `npm run test:e2e:ia` antes de chamá-lo.

### 30/09/2026: tela de Clientes, fatia A

Item 3 do P0 (`docs/plano-clientes.md`, aprovado pelo dono). **Fatia A commitada, sem push**: lista
`/clientes` com busca e filtros, ficha única (`FichaContato`) nas duas superfícies, Nascimento e
E-mail no cadastro. **Próximo: fatia B** (criar contato e iniciar conversa com alerta), depois C
(contato frio, 60 dias). **OBS e OBM são o MESMO tenant de teste** (no banco
ele se chama "OBM"); o dono limpou as conversas e os contatos dele em 29/09. A Loja Teste não existe
mais.

### 29/09/2026, noite: P0 do beta FEITO

Os dois itens do P0 do plano vigente estão commitados, **sem push** (o dono decide):
- **Avisos no WhatsApp** (`docs/plano-avisos.md`): o pedido de ajuda novo avisa o destino de avisos
  (número ou grupo, configurado no passo 4 da montagem e no `/agente`; obrigatório na primeira
  ativação). O número de avisos nunca é atendido e some de toda lista.
- **Página `/pedidos`** (`docs/plano-pedidos.md`): todos os pedidos abertos, do mais antigo para o
  mais novo, com as três saídas da caixa de escrita na própria linha. O "Abrir" do aviso leva a ela.

**Falta, e só o dono faz:** o teste com o chip do envio real (configurar o destino, "Mandar teste" e
um pedido de ajuda de verdade chegando no celular). Nenhum teste automatizado manda WhatsApp.
Depois do deploy, conferir que `VERCEL_PROJECT_PRODUCTION_URL` existe na Vercel (sem ela o aviso
sai sem o link "Abrir").
**Anotado, sem decisão:** o "Notifica grupo" do n8n (reunião marcada) ainda diz "🚨 Novo Lead" e
dispara a cada turno de agendamento; trocar é mexer no n8n.

### 29/09/2026, tarde

O dono segue no teste com chip real. Entrou nesta rodada: a retomada (orientar) nunca abre pedido
novo, a bancada sempre mostra a última mensagem (`AreaRolavel` engolia o `ref`), a seção
`CONDUÇÃO DA CONVERSA` na base do prompt, e o teto `LIMITS.persona` subiu para 14.000.
**Próximo:** o plano do contato AVISADO quando abre um pedido de ajuda (o dono trata como
obrigatório para o beta).

**Anotado para depois, com a posição do dono:**
- Convite com link vencido: o `/login?erro=convite` ainda manda para "Esqueci minha senha", que
  confunde quem nunca criou senha. O dono achava que já estava corrigido; não está.
- `account_type`: **não marcar testador um a um.** Decisão do dono: o projeto inteiro está em beta,
  e quando mudar, muda para todos. Não propor de novo a marcação manual.
- Trocar o token do Supabase exposto no chat: o dono recusou. Não levantar de novo.
- Ao desligar o `BETA_ABERTO`, quem se cadastrou no beta cai no bloqueio (teste vencido): decidir
  antes de desligar.

### A sessão de 24 a 27/09/2026

**Onde paramos:** tudo commitado e em produção (último commit: `git log -1`). O dono foi fazer o
**teste de ponta a ponta** com chip real e vai voltar com a lista do que está ok e do que falta.
O próximo passo é tratar esse relatório. Ele testa em produção
(`https://atendimento.obomsobrinho.com.br`).

**O que entrou nesta sessão** (detalhe no `CLAUDE.md`, blocos de montagem, bancada e cadastro):
- Montagem invertida: quem atende, o que ele sabe, conversa de teste, conectar e ativar. Conectar
  não liga o agente; o Ativar só libera com a conexão vista na tela, e o servidor confere o estado
  real na Evolution na primeira ativação.
- Passo 3 com a conversa de teste dentro (digitando, um balão por mensagem, áudio transcrito com
  `whisper-1`, recomeçar), sem rolar a página e com a cara da tela de Conversas.
- Passo 4 no molde do WhatsApp Web, QR no roxo, "Gerar QR code", saída que diz o que fica para depois.
- Botão `carregando` na base (spinner, cor cheia) em todas as ações assíncronas.
- Convite e cadastro: link do e-mail com sessão depois do `#` agora abre (`/auth/concluir`); login
  avisa quando o link venceu.
- **Pedidos de ajuda viraram a tabela `handoffs`** (27/09). O desenho passou por duas versões no
  mesmo dia (cartão na conversa, depois a caixa de escrita); o que vale é o da "Segunda rodada"
  abaixo.
- **Favicon** é o mesmo do site da OBS; **menu do avatar** abre ao lado da coluna, com 12px de ar.
- **Orientação chega ao cliente em segunda pessoa** (antes o agente dizia "esse cliente" ao cliente).
- Faxina: código morto, comentários, pastas de design do Desktop na Lixeira (`ATUAL DESING` e o
  briefing da Tela de Clientes ficaram).
- Testes: semente de conversa de teste no tenant de teste (`e2e/semente.ts`, telefone
  `5500000000001`, SQL de limpeza no topo) e `atendimento.serial.spec.ts` com as duas jornadas do
  dono no cérebro real. Números: 261 sem login e mobile, 35 com login (nenhum pulado), `ia` 12 de 12.

**Primeiro relatório do teste com chip (27/09, à noite), três ajustes no handoff:**
- **Orientar É resolver, e a IA responde na hora.** O cartão chama `POST /api/conversations/orientar`:
  fecha o pedido, roda o cérebro num turno de RETOMADA (sem mensagem nova do cliente) e manda a
  resposta pelo n8n. ⚠️ **Falta o lado do n8n:** o fluxo `n8n/crm-envio-ia.json` ("CRM Envio IA")
  tem que ser criado e ativado, e a URL dele vai em `N8N_IA_SEND_WEBHOOK_URL` (Vercel). Sem isso
  a rota cai na orientação pendente (a IA usa na próxima mensagem do cliente), sem erro.
- **Pedido resolvido não volta.** A IA pedia ajuda de novo pelo mesmo assunto quando o cliente
  respondia "ok, fico no aguardo". Agora cada pedido fechado entra no histórico dela como nota
  interna com a hora. Medido na conversa de teste: sem a nota, 3 de 3 reabriram; com ela, 0 de 3,
  e assunto novo continua abrindo pedido.
- **Horário na tela saía em UTC** (17:47 aparecia 20:47): o servidor renderiza em UTC e o
  `suppressHydrationWarning` mantinha o texto dele. Toda data agora sai em America/Sao_Paulo.

**Segunda rodada (27/09, noite), desenho aprovado pelo dono:**
- **O pedido mora na caixa de escrita, em fila.** O pedido fica em cima da caixa ("1 de 2"), que
  abre em "Orientar a IA", troca para Responder pelo seletor e tem "Resolvido" ao lado; a conversa só
  guarda a linha de histórico.
- **Orientação aplicada já na primeira resposta:** a IA cumprimentava e deixava a orientação do time
  para depois (desconto orientado: 3 de 6). Uma frase na ORIENTAÇÃO DO OPERADOR (`lib/agent.ts`)
  levou a 6 de 6. Vários pedidos por
  conversa, do mais antigo para o mais novo; a IA diz se o pedido é novo (`pedido_novo`).
- **Pipeline no celular:** ligar "Esperando você" leva à coluna de quem espera (antes o recorte
  acontecia em outra coluna e a tela não mudava).
- Fluxo **"CRM Envio IA"** criado e ativo no n8n (`QbWUBuzXjvIEnQZN`); a URL está na Vercel.
- Bateria `ia` 12 de 12. O caso 3 (conselho clínico) oscila entre `pausar` e `none` nas duas
  versões do código (1 em 8 no código anterior), com resposta segura nas duas.
- **Próximo assunto combinado com o dono:** o contato que é AVISADO quando abre um pedido de ajuda
  (ele lembrava de ter isso na montagem, e não tem). Fazer o plano depois de ele testar esta rodada.

**Configuração feita pelo dono no painel do Supabase (27/09):** Site URL passou a ser o domínio de
produção e ele entrou em Redirect URLs. Antes o cadastro em produção mandava o link para
`localhost:3000`. ⚠️ A linha `http://localhost:3001/auth/confirm` da lista casa só o endereço exato;
para o cadastro LOCAL voltar a funcionar, trocar por `http://localhost:3001/**`.

**Decisões que ficaram com o dono:**
- `/design` fica (é a base dos testes sem login); esconder em produção foi recomendado e não
  respondido. Staging (projeto Supabase de testes) é o caminho de longo prazo, depois do beta.
- Gerar o QR sozinho ao abrir o passo 4 (hoje pede clique, porque cria a instância na Evolution).
- Tela de Clientes antes ou depois do beta: nunca decidido.
- Os mapas do sistema (`mapa-do-sistema`, `nucleo-atendimento`) são do dono e ficam FORA do git, em `Desktop/arquitetura-crm/` (02/10/2026).

**Só o teste com chip prova:** responder pelo CRM (chega no celular e pausa a IA), áudio do cliente,
mídia nos dois sentidos, mensagem chegando em tempo real, conexão pelo número (código de pareamento
nunca provado com número real) e QR roxo lido pela câmera.

### Estado em 18/09/2026 (histórico)

- **Árvore limpa, tudo enviado.** Último commit no dia, ver `git log -1`.
- **Banco com 30 migrations aplicadas.** Nenhuma pendente.
- **Verificação da última rodada (11/09):** 116 e2e sem login, 21 com login (1 pulado), projeto `ia`
  12 de 12, `tsc` 0, `eslint` 0, `npm run build` limpo.
- **Plano da demo:** os cinco contratos que se faziam sem o dono (C1 a C5) **fecharam em 11/09**.
  Relatório completo, com o que saiu diferente do contrato, em `docs/relatorio-noite-2026-09-10.md`.
  Depois dele, duas decisões do dono já entraram: toda manipulação abre handoff (`b510ecd`) e os
  e-mails ganharam logo e contato de suporte (`1a8daba`).
- **Rotação do `x-lookup-secret`:** o dono relatou ter colado o valor novo na Vercel, redeployado e
  recebido resposta do agente numa mensagem real, em 11/09. ⚠️ Não é verificável a partir do
  repositório; o export em `n8n/` só tem o marcador. Confirmar com ele antes de tratar como feito.
- **Ordem do MVP do beta mudou em 10/09:** estabilidade e confiança antes de desenho. Os passos 4 e
  5 (design, mobile) foram para depois da demo.

- ⚠️ **O domínio de produção mudou para `https://atendimento.obomsobrinho.com.br` (17/09/2026),
  e isso tinha derrubado o canal em silêncio.** `crm-obs.vercel.app` respondia 404, e os dois nós
  do n8n que chamam o app apontavam para lá: o agente não respondia ninguém e as mensagens do
  período **não foram gravadas**. Descoberto por acaso, ao provar o fallback. Já corrigido no n8n e
  nos documentos, incluindo a logo dos e-mails do Supabase.
- **Canal endurecido FEITO (17/09/2026):** filtro de grupo, dedupe por `key.id` e fallback com
  gravação garantida. O workflow foi de 45 para 50 nós, está reexportado em `n8n/` e provado por
  webhook simulado (execuções 740, 742, 743 e 744). Detalhe em `n8n/README.md`.
- **Higiene do workflow: já estava feita pelo dono.** `pinData` vazio e `Sticky README` atualizado
  (o Sticky ganhou as três mudanças novas nesta sessão).
- **Fixture de atendente: resolvido.** O tenant de teste passou a ser a **OBS**, e o atendente é
  `franckantonny@gmail.com`. As variáveis em `.env.e2e.local` são `E2E_EMAIL`, `E2E_PASSWORD`,
  `E2E_ATTENDANT_EMAIL` e `E2E_ATTENDANT_PASSWORD`. ⚠️ A regra antiga "nunca na OBM" mudou de
  alvo: o tenant que **não** pode receber escrita de teste é o de 7 contatos, que atende gente de
  verdade. Os três testes de permissão ainda não foram escritos.
- **Propagação da base: decidida, não implementada.** A persona passa a ser montada na LEITURA,
  dentro do `/api/agent`, com queda para `clients.persona` se a montagem falhar. O n8n não é
  tocado, porque quem lê a persona é o nosso código, não ele.

### Design aplicado em 18/09/2026

O passo 4 do MVP (design) começou, e o que entrou está em seis commits, **todos
locais: nada foi enviado nem publicado**. Rode `git log --oneline -8` para ver.

- **Kanban:** desenho "Kanban com chips e cards inteligentes" aplicado. Idade em
  vez de hora, "Sua vez" com a espera real, subtítulo por coluna, origem no pé do
  card, filtro "Esperando você".
- **Atendimento, em três frentes** (uma por seção, cada uma com valores medidos no
  desenho, não estimados): lista de conversas, conversa e coluna do cliente.
- **`/agente`:** a aba ativa voltou a ser visível. A causa era a cor da barra ser
  opcional na camada base; hoje ela cai na cor da marca quando ninguém passa.

⚠️ **O que o desenho pede e NÃO foi feito, sempre por falta de dado**, com teste
travando onde dava: frase por card dizendo o que fazer e o que a IA está fazendo;
"Ana moveu" com nome (o banco só sabe humano ou IA); chip de "mensagem não
enviada" (nada registra falha de entrega); prefixo "IA:" e "{colega}:" na prévia;
nome de quem assumiu no marco da conversa; marca de lida por mensagem; "N novas
desde sua última visita". **Escrever qualquer uma dessas seria inventar na tela em
que o time decide o que fazer.**

⚠️ **Respostas rápidas ficaram de fora e é o próximo item natural do atendimento:**
a tabela `quick_replies` existe desde a Fase 1 e **nunca teve tela nenhuma**, então
não há como criar uma. Construir só os chips entregaria uma faixa que nunca
aparece. É tela nova com CRUD por tenant, não aplicação de desenho.

⚠️ **Achado que o dono precisa saber:** a persona da OBS em modo avançado está a
POUCAS DEZENAS de caracteres do teto de `LIMITS.persona` (o texto dele mais o rabo
invariante da base). Qualquer parágrafo a mais e o próprio Salvar recusa com
"prompt muito longo". Foi isso que derrubava a bancada de teste na suíte, e o 400
era verdade do produto, não teste instável.

**Instabilidade da suíte resolvida, e não era acaso:** além do limite acima, o
teste que CRIA e ARQUIVA estágio contava colunas no tenant compartilhado enquanto
outro worker mexia no mesmo funil. Foi para `pipeline.serial.spec.ts`. Depois
disso, três execuções seguidas limpas.

**Números:** 143 sem login, 26 com login (1 pulado), `tsc` 0, `eslint` 0, build
limpo.

## 4. O que vem agora

O plano inteiro está em `docs/proximos-passos.md`, seção **"Plano da demo"**. O grupo que exigia o
dono na sala **fechou em 17/09/2026** (ver a seção 3).

✅ **Fechados na mesma sessão de 17/09:**

- **Persona montada na leitura.** `personaDoTenant` em `lib/agent-turn.ts`: `buildPersona` no
  guiado, `buildAdvancedPersona` no avançado, queda para `clients.persona` se falhar. O n8n não foi
  tocado. Provado contra o banco: a OBS troca a seção ANTI-MANIPULAÇÃO antiga pela nova sem ninguém
  salvar nada.
- **Permissões do atendente.** Projeto `atendente` (`*.att.spec.ts`), quatro provas, com a sessão
  que o `auth.setup.ts` passou a gravar. Fechou os buracos declarados em `pipeline.auth.spec.ts` e
  `montagem.auth.spec.ts`.
- **Os três testes que a troca do tenant quebrou.** Não eram bug: assumiam modo guiado e um telefone
  escrito no arquivo.

⚠️ **A faxina dos testes de design foi INVESTIGADA e o plano não se sustentou (18/09/2026).** A
sobreposição real é de uma meia dúzia de asserções em 123 testes. O resto não é duplicata: os testes
de `/design` rodam com **dado falso feito para criar situações que o dado real não tem** (volume
caindo, dia sem movimento, amostra pequena, soma de barras maior que zero). Apagar não removeria
redundância, removeria cobertura, e em dois casos o teste de design é o MAIS FORTE dos dois: na tela
real a soma das barras compara 1 com 1 hoje.

O que sobrou de verdadeiro do item foi feito: a regra de **segmento único** (nenhum texto fixo diz
consulta, paciente ou agendamento) passou a valer também contra a tela REAL, que é onde o texto do
tenant se mistura ao texto fixo e onde o vazamento aconteceria. As outras quatro regras já valiam
nos dois lugares.

**Sobra do plano:** `/simplify` no código (não nos testes), quando o dono quiser.

⚠️ **Duas coisas dependem do dono antes do próximo deploy:**

- **Os commits de 17/09 estão LOCAIS.** A montagem na leitura só vale no WhatsApp depois do deploy, e
  é ela que leva a regra nova de anti-manipulação para a OBS.
- **O portão `npm run test:e2e:ia` não foi rodado** nesta sessão. Ele custa 12 chamadas pagas, e a
  mudança da persona é exatamente o caso que ele existe para cobrir.

⚠️ `e2e/publico.design.spec.ts` **não é** teste de design, apesar do nome: testa `/cadastro`,
`/login` e `/recuperar-senha`, e um caso é de segurança. Não apagar na faxina. As rotas `/design`
não custam nada em produção (`proxy.ts` bloqueia); o custo é manutenção.

## 5. O que está em aberto e depende do dono

Os cinco achados medidos estão em `docs/proximos-passos.md`, na seção "Achados medidos entre 31/08 e
07/09/2026". Em uma linha cada:

- **A1** Trocar de conversa custa ~0,9s, quase tudo viagem de rede em série. **Pergunta em aberto: a
  lentidão aparece no site publicado ou só em `npm run dev`?**
- **A2** Usuário em dois tenants cai num deles por acaso (`getMyClient` usa `limit(1)` sem `order`).
- **A3** Os e-mails do Supabase Auth dizem "DeskCRM" e o assunto está em inglês. O texto não está no
  repositório, e falta decidir qual nome usar.
  **Texto novo pronto em `docs/emails-supabase.md` (11/09/2026), sem nome de produto; aplicar no painel do
  Supabase é do dono.**
- ✅ **A4 resolvido em 17/09/2026.** O fixture existe: tenant OBS, atendente `franckantonny@gmail.com`,
  variáveis `E2E_ATTENDANT_EMAIL` e `E2E_ATTENDANT_PASSWORD` no `.env.e2e.local`. Faltam os três testes.
- **A5** A conta "testesnovo" está com o teste vencido.

Além desses: **mobile** é a única pendência aberta do design system
(`docs/design-system/pendencias.md`, item 12), e é cara de ignorar porque boa parte do público-alvo
não tem computador.

## 6. As quatro coisas que um agente novo erra se ninguém contar

1. **"Cliente" é ambíguo neste schema.** `clients` é o TENANT (a empresa que usa o CRM);
   `dados_cliente` são os CONTATOS (o cliente do seu cliente). Trocar os dois é o erro mais caro.
2. **Escrita de teste só no tenant de teste**, que é a OBS (no banco, "OBM": são o mesmo, confirmado
   pelo dono em 30/09/2026). A Loja Teste não existe mais.
3. **Nunca usar travessão** (`—` ou `–`) em texto visível nem em prompt gerado. Vale para UI,
   `buildPersona`, mensagem de erro, documentação e commit.
4. **Nunca modificar ou ativar workflow do n8n sem confirmação explícita**: é produção.

## 7. Para um chat SEM acesso ao repositório

O briefing antigo de revisão (`Desktop/briefing-revisao-projeto.md`, 04/09) foi para a Lixeira em
26/09/2026 por estar desatualizado. Para uma revisão de fora, gerar um novo a partir do `CLAUDE.md`,
mantendo as etiquetas `[FEITO]`, `[DECIDIDO]`, `[IDEIA]` e `[VETADO]`.

O design system como HTML autônomo (abre por `file://`) se regera com `npm run design:export`.

## Status carried over from the old CLAUDE.md (01/10/2026)

The old 1236-line CLAUDE.md was split into `.claude/rules/` (rules) and `docs/adr/` (the why). These are the status notes that were neither rule nor decision.

- Beta MVP six steps state: (1) dashboard done, (2) agent steps done, (3) 4 gaps done, (4) design and mobile, (5) apply design, (6) tests. Billing parked. Phases 1, 2, 3, 3.5 summary (multi-login, RAG, pipeline, guardrail; B-6 removed; `msg1 | msg2` debt postponed).
- Test counts: login suite 41 passing none skipped (29/09), no-login plus mobile 286, `ia` 12/12 (26/09). Known intermittents.
- OBM persona recompiled 22/08 (10,494 -> 11,452 chars, md5 `0efa85000852f92b75140562127b3544`, backup `public._persona_backup_20260822`); OBS prompt backup `Desktop/prompt-avancado-OBS-2026-09-30.md`; OBS stays advanced. `LIMITS.persona` timeline 12,000 -> 14,000 (29/09) -> 16,000 (30/09).
- Pending owner decisions: tightening `stage_source`/`pending_instruction` writes; QR auto-generation on opening step 4; pairing-code connection not proven with a real number; real-voice transcription never proven (bench).
- n8n re-export status after 30/09 and 01/10 live edits.
- Preview URLs: `/design/montagem?passo=conectar&conectado=1[&avisos=1]`, `/design?handoff=aberto|resolvido`.
- Feedback: nobody is notified when a report arrives (accepted limitation).
- Free beta of 5 to 10 testers; `account_type` marked by hand.
- Plan docs: `docs/plano-avisos.md`, `plano-pedidos.md`, `plano-fechar-p0.md`, `plano-clientes.md`, `plano-carregamento.md`.
