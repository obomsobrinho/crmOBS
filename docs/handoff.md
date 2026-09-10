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

## 3. Estado em 07/09/2026

- **Árvore limpa, tudo enviado.** Os 25 commits que estavam parados desde a última versão publicada
  foram para `origin/main` neste dia.
- **Banco com 30 migrations aplicadas.** Não há migration pendente.
- **Verificação da última rodada:** 114 e2e sem login, 19 com login (1 pulado), `tsc` 0, `eslint` 0,
  `npm run build` limpo.
- **Passo do MVP do beta:** 3 de 6 fechados (painel, montagem, os quatro furos). O passo 4 (design e
  mobile) está em andamento; 5 (aplicar) e 6 (testes) não começaram.

## 4. O que estava acontecendo quando isto foi escrito

Uma rodada de **cobertura de teste**, com um plano de quatro passos acordado com o dono:

1. ✅ Subir os commits parados.
2. **Em andamento:** escrever os testes reais que faltam. Já entraram o pipeline (que tinha zero
   cobertura) e duas das quatro guardas da `/montagem`.
3. Depois: apagar os testes de design cuja cobertura ficou duplicada, **migrando para as telas reais
   as asserções que travam REGRA e não aparência** (travessão, "nenhum texto fixo assume um único
   segmento", o `XX` que nunca vira número plausível, a igualdade entre a soma das barras roxas e a
   manchete, volume nunca em vermelho).
4. Por fim, `/simplify`.

⚠️ **O passo 3 tem uma armadilha já identificada:** `e2e/publico.design.spec.ts` **não é** teste de
design, apesar do nome. Ele testa `/cadastro`, `/login` e `/recuperar-senha`, que são páginas reais,
e um dos casos é de **segurança** ("responde igual para qualquer e-mail, não vira verificador de
contas"). Não apagar na faxina.

⚠️ As rotas `/design` **não custam nada em produção**: `proxy.ts` as bloqueia quando
`NODE_ENV=production`. O custo delas é manutenção, não risco.

## 5. O que está em aberto e depende do dono

Os cinco achados medidos estão em `docs/proximos-passos.md`, na seção "Achados medidos entre 31/08 e
07/09/2026". Em uma linha cada:

- **A1** Trocar de conversa custa ~0,9s, quase tudo viagem de rede em série. **Pergunta em aberto: a
  lentidão aparece no site publicado ou só em `npm run dev`?**
- **A2** Usuário em dois tenants cai num deles por acaso (`getMyClient` usa `limit(1)` sem `order`).
- **A3** Os e-mails do Supabase Auth dizem "DeskCRM" e o assunto está em inglês. O texto não está no
  repositório, e falta decidir qual nome usar.
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
