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

⚠️ **Não consultar `Desktop/DesingSystem/`**: está obsoleta e cita tokens que não existem mais.

## 2. O que é o produto, em cinco linhas

CRM de WhatsApp com um agente de IA que atende, qualifica e passa para o humano quando precisa,
para pequenos negócios locais. **Horizontal de propósito**: advogado, pediatra, barbeiro,
engenheiro, clínica, comércio. Multi-tenant sobre Supabase com RLS. A Evolution API conecta o
WhatsApp por QR, o n8n é só o cano, e o cérebro é `POST /api/agent` neste repositório.

O lançamento é um **beta gratuito** com 5 a 10 conhecidos do dono. A cobrança está **construída e
desligada de propósito**.

## 3. Estado em 16/09/2026

- **Árvore limpa, tudo enviado.** Último commit `1a8daba`.
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

## 4. O que vem agora

O plano inteiro está em `docs/proximos-passos.md`, seção **"Plano da demo"**. O que falta se divide
em dois grupos, e o critério é quem precisa estar na sala.

**Com o dono presente** (mexe no n8n em produção, e a prova exige WhatsApp real):

- **Canal endurecido, numa janela só:** filtro de grupo (o nó `Rotas` só confere se o telefone
  existe; JID `@g.us` passa), dedupe por `key.id` (o nó `Dados` nem extrai esse campo), e fallback
  quando `/api/agent` falha (hoje são 2 tentativas e depois silêncio). Mesmo workflow, mesma bateria
  de prova: **webhook simulado** (mesmo `key.id` duas vezes, um JID de grupo) mais **uma** mensagem
  real no fim. `validateOnly` antes de aplicar. Os workflows estão versionados em `n8n/`, então há
  diff e rollback.
- **Higiene do workflow no n8n:** o `pinData` do `Webhook EVO` carrega a apikey da Evolution e um
  telefone real, e o `Sticky README` está desatualizado. Os dois saíram do export e continuam no n8n.

**Uma decisão do dono, depois anda sozinho:**

- **Fixture de atendente:** qual e-mail. Sugerido `franckantonnywork+atendente@gmail.com`, porque o
  endereço sem sufixo já é dono do tenant "testesnovo". Destrava três testes de permissão hoje
  declarados como buraco.
- **Propagação da base do prompt:** melhoria na base não chega em quem já publicou (a persona é
  compilada e gravada no save). Escolher entre guardar só a camada do cliente e compilar na leitura,
  ou recompilar em massa a cada mudança da base.

**Depois disso, na ordem que estava:** apagar os testes de design com cobertura duplicada, migrando
para as telas reais as asserções que travam REGRA (travessão, segmento único, o `XX`, a soma das
barras roxas, volume nunca vermelho); depois `/simplify`.

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
- **A4** O fixture de atendente está bloqueado, e sem ele três testes não podem ser escritos com
  honestidade.
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

Se a conversa for numa janela sem o código (revisão de estratégia, opinião de fora), existe um
briefing pronto e com etiquetas de estado em **`Desktop/briefing-revisao-projeto.md`**. Ele foi
escrito exatamente para isso: separa `[FEITO]`, `[DECIDIDO]`, `[IDEIA]` e `[VETADO]`, para o leitor
não tratar ideia como coisa pronta nem sugerir o que já foi recusado.

O design system também existe como **um HTML autônomo**, em `Desktop/design-system-obs.html`, que
abre por `file://` sem servidor. Regerar: `npm run design:export`.
