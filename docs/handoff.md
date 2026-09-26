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

## 3. Estado em 18/09/2026

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
2. **Escrita de teste só na Loja Teste, nunca na OBM.** A OBM atende cliente de verdade.
3. **Nunca usar travessão** (`—` ou `–`) em texto visível nem em prompt gerado. Vale para UI,
   `buildPersona`, mensagem de erro, documentação e commit.
4. **Nunca modificar ou ativar workflow do n8n sem confirmação explícita**: é produção.

## 7. Para um chat SEM acesso ao repositório

O briefing antigo de revisão (`Desktop/briefing-revisao-projeto.md`, 04/09) foi para a Lixeira em
26/09/2026 por estar desatualizado. Para uma revisão de fora, gerar um novo a partir do `CLAUDE.md`,
mantendo as etiquetas `[FEITO]`, `[DECIDIDO]`, `[IDEIA]` e `[VETADO]`.

O design system como HTML autônomo (abre por `file://`) se regera com `npm run design:export`.
