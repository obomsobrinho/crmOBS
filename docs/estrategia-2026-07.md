# Consultoria estratégica DeskCRM (base de pesquisa)

Data: 30/07/2026. Base: código do repositório, schema no Supabase, workflow n8n em produção, e
pesquisa de mercado com fontes citadas.

> ⚠️ **PAPEL DESTE DOCUMENTO E DECISÕES REVISADAS (31/07/2026).**
> Este documento vale como **base de pesquisa e evidência** (diagnóstico, dados de mercado,
> concorrentes, regras e custos do WhatsApp, fontes). As **decisões de produto e o roadmap**
> foram revisadas depois de escrito e vivem em **[proximos-passos.md](proximos-passos.md)**, que
> é a fonte de verdade. Onde este texto recomendar o contrário do que está abaixo, vale o de baixo:
> 1. **Horizontal**, não vertical em clínicas (atende qualquer segmento).
> 2. **Construir até ter paridade e só depois publicar e vender.** Ignore todo trecho que diz
>    "pare de construir e venda 10 clínicas agora".
> 3. **Pricing por usuário** (assento), não plano único de R$ 297.
> 4. **Cobrir a base de CRM É escopo:** multi-login, pipeline e afins entram. A agenda é a única
>    que fica de fora por ora (decisão do usuário). Ignore os trechos "não é um CRM, não construir
>    pipeline/multi-atendente".
> 5. **Eixos de superioridade:** execução/confiança + profundidade de IA (base de conhecimento com
>    upload, controle de alucinação, playground).
> As seções abaixo ficam como registro do raciocínio de mercado; as conclusões prescritivas antigas
> estão superadas pelos 5 pontos acima.

Convenção usada em todo o documento:
- **[DADO]** informação verificada em fonte citada.
- **[INFERÊNCIA]** conclusão minha derivada dos dados.
- **[HIPÓTESE]** possibilidade não validada. Não tratar como fato.

---

## 0. Resumo em uma página

O DeskCRM não tem problema de produto. Tem três problemas, nesta ordem:

1. **Não está no ar.** Roda em localhost. Não existe cadastro. Criar um cliente exige rodar SQL
   à mão. Nenhuma funcionalidade nova muda isso.
2. **Não tem distribuição.** Zero clientes pagantes, zero prova social, num mercado com mais de
   30 concorrentes dizendo exatamente a mesma frase.
3. **O valor dele é invisível.** A IA responde dentro do WhatsApp. O dono vê as respostas no
   celular dele de qualquer jeito. Um painel que ele não precisa abrir não sustenta mensalidade.

E tem um ativo que ninguém no mercado brasileiro está usando: **a sua IA já produz qualificação
estruturada em toda conversa relevante (resumo do caso, intenção, preferência de horário) e o
sistema joga isso no lixo.** Isso, mais o handoff humano que você já construiu, é a única base de
diferenciação defensável que existe hoje neste repositório.

Recomendação central (revisada, ver banner no topo): **cobrir a base que os concorrentes cobrem e
ser melhor em execução/confiança e profundidade de IA, mantendo como diferencial a qualificação
estruturada que a IA já produz e hoje é descartada. Publicar e vender só depois da paridade.** O
texto original desta seção dizia "pare de construir e venda 10 clínicas por R$ 297"; isso foi
superado pela decisão de construir até a paridade antes de ir a mercado.

---

## 1. Diagnóstico do produto atual (resumo)

O DeskCRM é a camada de interface de um sistema de três partes. Só uma está no repositório.

| Parte | O que faz | No repo? |
|---|---|---|
| Evolution API (Baileys/QR) | conexão com o WhatsApp, uma instância por tenant | não |
| n8n (`OBS Atendimento`, 47 nós, ativo) | recebe webhook, transcreve áudio/imagem, agrupa mensagens, roda o agente, decide ação, envia, **grava no banco** | não |
| DeskCRM (Next.js 16) | login, leitura com RLS, envio manual via webhook, onboarding do QR, construtor do prompt | sim |

**Existe e funciona:** multi-tenant com RLS, onboarding por QR com polling, importação automática
da base existente, inbox com busca e realtime, filtro "Precisa de você", handoff humano por
conversa (pelo CRM e detectado automaticamente quando o dono digita no celular), construtor guiado
do prompt em dois modos com preview, persona-fallback, tema claro e escuro.

**Não existe uma linha:** cadastro/signup, recuperação de senha, cobrança, deploy, pipeline,
follow-up, dashboard, agenda, campanhas, multi-WhatsApp, base de conhecimento por upload,
automações configuráveis, edição de contato, não-lidas, testes.

**Achado mais relevante:** o parser estruturado do n8n obriga o agente a devolver `summary`
(resumo do caso com nome, segmento e dor), `preferencia_horario` e `action`. Nada disso é
persistido. `summary` e `preferencia_horario` são interpolados numa mensagem de texto para um grupo
do WhatsApp e descartados. Não há coluna, tabela nem log.

**Riscos operacionais já presentes:** a ação `agendar` degrada em silêncio quando
`notify_group_jid` é nulo (`onError: continueRegularOutput`), ou seja o lead é qualificado, a IA é
pausada e ninguém é avisado. E o `Rotas` do n8n tem um número pessoal e uma palavra-chave de treino
hardcoded, resíduo do primeiro cliente rodando no fluxo compartilhado de todos os tenants.

---

## 2. O mercado: existe demanda, e a categoria já não precisa ser educada

**[DADO] O funil da PME brasileira mora no WhatsApp.**
82% dos MEI e micro e pequenas empresas vendem pelo WhatsApp, contra 57% no Instagram, 30% no
Facebook e 10% em loja própria. É o único canal crescendo. Sebrae, Pulso dos Pequenos Negócios
12ª edição, campo fev-mar/2026, mais de 8.200 empreendedores, publicado 16/04/2026.
https://agenciasebrae.com.br/dados/whatsapp-se-consolida-nas-vendas-on-line-enquanto-facebook-e-lojas-proprias-perdem-folego/

**[DADO] 147 milhões de usuários no Brasil, 97% acessam todo dia ou quase.** Opinion Box,
"WhatsApp no Brasil", campo jun/2025, n=1.126, margem 2,9 p.p.
https://blog.opinionbox.com/pesquisa-whatsapp-no-brasil/

**[DADO] O CRM não penetrou, e está regredindo para planilha.**
42% dos times de vendas usam CRM (mesmo número de 2024), enquanto planilha subiu de 25% para 40%
e "nenhuma ferramenta" está em 20%. RD Station, Panorama de Marketing e Vendas 2025, n=1.504.
https://www.rdstation.com/pesquisas/panoramas-rdstation-2025/vendas/maturidade-times/
Ressalva de viés: a base é de profissionais de marketing e vendas respondentes de um estudo da RD
Station, público já digitalizado. O número real de PMEs sem CRM é provavelmente pior.

**[DADO] A categoria "IA no WhatsApp" já está instalada, não precisa ser explicada.**
41% dos pequenos negócios já usam chatbot com robô no WhatsApp e 30% chatbot de vendas. Sebrae,
Transformação Digital nos Pequenos Negócios, jun/2025.
https://www.cnnbrasil.com.br/economia/macroeconomia/44-dos-pequenos-negocios-usam-inteligencia-artificial-diz-sebrae/

**[DADO] O gap que importa: experimentação alta, operacionalização baixa.**
44% dos pequenos negócios "já usam IA" (Sebrae, jun/2025), mas apenas **15% das MPEs usam IA com
frequência** (Sebrae + FGV IBRE + Google, campo set/2025, ~5.000 empresas, publicado jan/2026).
https://agenciasebrae.com.br/dados/pequenos-negocios-abracam-a-inteligencia-artificial-para-otimizar-o-tempo-e-inovar/

**[DADO] O consumidor brasileiro não gosta de robô, e isso é o limite do produto.**
59% não gostam de respostas automáticas. 62% já desistiram de uma compra pelo WhatsApp após
experiência negativa. Opinion Box, jun/2025.

**[DADO] Piso involuntário de churn.** Mortalidade de MEI em 5 anos: 29% (comércio 30,2%). Sebrae,
Sobrevivência das Empresas, coorte 2020, publicado fev/2022. Não há atualização pública 2024-2026.
https://sebraepr.com.br/comunidade/artigo/sebrae-em-dados-sobrevivencia-de-empresas
**[INFERÊNCIA]** ~0,57% de churn por mês só porque o cliente deixa de existir, antes de qualquer
insatisfação. Vender só para MEI garante um piso de churn que nenhum produto resolve.

**[DADO] 38% dos MEI não têm computador** (76% das PMEs têm; MEI 62%). Sebrae, Pesquisa TIC 2025.
https://sebraepr.com.br/impulsiona/pesquisa-tic-2025-transformacao-digital-nos-pequenos-negocios/
**[INFERÊNCIA]** qualquer coisa que exija o dono sentado num desktop exclui uma fatia grande do
mercado que você imagina atender.

### Resposta à pergunta "é demanda ou é preciso educar?"

**Nem uma nem outra.** A demanda existe e a categoria já está educada (41% já usam chatbot). O
problema não é convencer que IA no WhatsApp serve. O problema é que **a categoria já foi
contaminada**: 59% dos consumidores não gostam de resposta automática, existem 30+ fornecedores
dizendo a mesma frase, e o dono de PME que já testou um bot ruim está mais cético do que quem nunca
testou. Você não vende "IA que atende". Você vende **por que a sua não vai fazer o cliente dele
desistir da compra**.

---

## 3. Concorrência: mapa de preços verificado

### ⚠️ Correção de enquadramento: quem é e quem NÃO é seu concorrente

A primeira versão deste documento ancorou a análise em Kommo, RD Station Conversas, Blip e Zenvia.
**Isso estava errado.** Esses quatro são **referência de teto de preço e de linguagem de mercado**,
não concorrentes: RD Station Conversas começa em R$ 989/mês no anual com implantação de R$ 1.999,
Blip não tem caminho self-service para WhatsApp, Zenvia parte de R$ 600 com setup de até R$ 3.999 e
Kommo cobra em dólar com mínimo de 6 meses. Nenhum deles disputa o mesmo cliente que você.

**Seu conjunto real de concorrentes é este, e são os dois abaixo mais os players de R$ 87 a 199 já
mapeados (GPT Maker, SocialHub, Atendente.AI, Nexloo, Sellflux, Simple Chat, BotConversa).**

#### ZapResponder (https://ia.zapresponder.com.br/) — o concorrente mais próximo
[DADO] verificado 30/07/2026. Headline: "Automatize o atendimento no WhatsApp com IA".

| Plano | Preço | WhatsApps | Atendentes | Créditos de IA | Boards de CRM |
|---|---|---|---|---|---|
| Starter | **R$ 132/mês** (R$ 441 trimestral) | 1 | 4 | 7.500 | 1 |
| Premium | **R$ 199/mês** (R$ 891 trimestral) | 3 | 20 | 15.000 | 10 |
| Business | **R$ 422/mês** (R$ 1.791 trimestral) | 5 | 40 | 30.000 | ilimitado |

Tem: pipeline visual de CRM, **agendamentos**, campanhas em massa, automações, multicanal
(Instagram e Messenger), agente de IA com o cliente configurando o prompt. Trial de 7 dias, **sem
taxa de setup**. Cobrança trimestral.
**E o dado mais importante: conexão via API Oficial do WhatsApp certificada pela Meta, não QR Code.**

#### HelenaCRM (https://www.helenacrm.com/) — o mais avançado em produto de IA
[DADO] verificado 30/07/2026. Empresa mineira (Belo Horizonte e Uberlândia). Headline da página de
IA: "Agentes de IA para WhatsApp", com a promessa "Configure equipes inteligentes que atuam juntas
em uma mesma conversa. Nada de códigos."

- **Preço de tabela (retail): R$ 657/mês (3 usuários), R$ 987 (5), R$ 1.387 (7).**
- Tem **múltiplos agentes orquestrados na mesma conversa**, base de conhecimento com **upload de
  arquivos diversos e tabelas estruturadas**, agendamento com **oferta de horários e confirmação**,
  handoff para humano, multicanal. Lançou coordenação de múltiplos agentes em jan/2026.
- **White label para agências** (https://www.helenacrm.com/white-label-agencias-de-marketing):
  setup **R$ 4.900** (Pro) ou **R$ 7.900** (Premium), mais licenciamento **R$ 659,90/mês**, mais
  domínio R$ 190/mês (Pro) ou app R$ 900/mês (Premium). Custo marginal por cliente do revendedor:
  R$ 149,90 (3 usuários + 1 canal) + R$ 19,90 por usuário extra + R$ 29,90 por canal extra +
  **R$ 50,00 por IA ilimitada**.

### [INFERÊNCIA] O que esse conjunto correto muda nas conclusões

**1. Você não ganha uma comparação de planilha. Aceite isso e não tente.** ZapResponder entrega
3 números, 20 atendentes, 10 boards de CRM, agendamento e campanhas por **R$ 199**, em API Oficial.
Numa tabela lado a lado de funcionalidades, você perde. O R$ 297 só se sustenta com posicionamento,
nicho e onboarding assistido, nunca com "temos mais recursos".

**2. Seu concorrente mais próximo escolheu API Oficial, e isso é um sinal que eu não posso ignorar.**
Eu recomendei ficar no QR com base em custo e em atrito de onboarding. ZapResponder mostra que dá
para operar oficial em R$ 132 a 199 e ainda vender. **A vantagem que sobra para o QR é uma só, e
precisa ser validada e não presumida: na API Oficial o número deixa de funcionar no app normal do
WhatsApp.** Transforme isso na primeira pergunta das suas 20 conversas de venda: "a secretária
precisa continuar usando esse número no celular dela?". Se a resposta for majoritariamente não, o
QR deixa de ser vantagem e passa a ser só passivo, e a migração vira prioridade.

**3. Correção da minha própria tese sobre agenda.** Eu classifiquei agenda como "não agora".
No conjunto correto de concorrentes, **agendamento é item de tabela**: ZapResponder tem
"Agendamentos" já no Starter de R$ 132, e a Helena oferece horários e confirma com o cliente.
Isso não muda a recomendação de não construir agenda própria nos 90 dias (o esforço operacional
continua alto e você tem 1 a 2 horas por dia), mas muda o discurso: **você precisa saber responder
"e agendamento?" na venda**, e a resposta honesta é o seu "agendar por alto" (a pessoa diz dia e
período, o time confirma), que é o que a clínica faz hoje de todo jeito. Se essa objeção derrubar
mais de 3 das 10 primeiras vendas, agenda sobe para prioridade 🔴.

**4. Correção sobre a compressão por white label.** Eu disse que white label a R$ 297 com clientes
ilimitados destrói o custo marginal. Isso vale para as plataformas de baixo padrão. Para plataforma
de qualidade comparável à Helena, o revendedor paga **R$ 4.900 de entrada mais R$ 850/mês fixos
mais cerca de R$ 200 por cliente**. Ou seja o piso de preço de um revendedor sério é bem acima de
R$ 67, e a compressão real vem do porão (ZapGPT, DB Ware), não de quem entrega produto bom.

**5. A pergunta desconfortável que você precisa responder para si mesmo: por que construir em vez
de revender?** Por R$ 4.900 de setup mais cerca de R$ 850/mês você teria hoje, sob sua marca, um
produto com múltiplos agentes, base de conhecimento com upload, agenda com confirmação e
multicanal. Você levaria 12 meses para chegar nisso com 1 a 2 horas por dia. **A resposta honesta
de por que ainda vale construir é uma só, e não é técnica:** white label não acumula nada seu, você
fica preso ao roadmap e ao preço de terceiro, e o único ativo defensável que identifiquei (a
biblioteca de prompts por nicho testada contra conversas reais, mais o dado de resultado por nicho)
só se acumula se o produto for seu. **Se em 90 dias você não conseguir 10 clientes pagantes, essa
pergunta volta, e aí a resposta correta pode ser revender.**

---

### Mapa geral de preços (contexto de mercado, não conjunto de pares)

Todos os preços lidos em páginas oficiais em julho de 2026. Fonte por linha no relatório de
pesquisa; principais links no fim desta seção.

| Faixa | Players |
|---|---|
| **R$ 0** | **Meta Business Agent** (nativo no app), atende.aí Grátis (inclui 1 número de WhatsApp real), Huggy Starter (WhatsApp restrito), WiiChat Gratuito (sem WhatsApp e sem IA), Blip Free (sem WhatsApp) |
| **R$ 87 a 199** | GPT Maker 87, SocialHub 99, Atendente.AI 99, Umbler Talk 109 a 129 (mín. 2 agentes), Nexloo 149, Sellflux 149, Zappy 149/usuário, Simple Chat 159, BotConversa 189 a 199 |
| **R$ 239 a 499** | Simple Chat 239, atende.aí 249, Suri 270 a 290, Nexloo 349, SocialHub 399, Sellflux 440, ChatPro 499, Atendente.AI 499, WiiChat 379+ |
| **R$ 500 a 1.000** | Clint 523+ (mais R$ 299 do módulo de IA), Huggy 579, Nexloo 599, Sellflux 690, Poli 829,90, RD Station Conversas 989, Chat Inteligente 990, GPT Maker 997 |
| **R$ 1.000+** | Poli 1.319,90 e 1.859,90, Chat Inteligente 1.990 e 2.990, RD Station 2.699, Blip Super 7.292 |

**Taxas de setup obrigatórias (fricção explorável):** WiiChat R$ 2.999; Poli a partir de
R$ 1.197,90 em todo plano; RD Station R$ 1.999 (ativação) e R$ 3.799 (chatbot) mais carteira
mínima de R$ 300; Zappy quatro taxas separadas (API R$ 500 a 750, chatbot R$ 500, IA R$ 500,
treinamento R$ 250).

**Travas de contrato:** Kommo mínimo de 6 meses e cobrança **em dólar mesmo na página /br/**;
Atendente.AI só trimestral ou anual; BotConversa vitrine só no anual; Poli 12 meses; RD Station
preços só no anual; Umbler mínimo trimestral e mínimo 2 agentes. **Huggy é o único que usa "sem
multa, sem fidelidade" como argumento, e nem coloca na headline.**

### As três ameaças estruturais (não são empresas, são forças)

**1. Meta Business Agent, dentro do app. ⚠️ CORREÇÃO: não é gratuito.** Agente de IA nativo no
WhatsApp Business, anunciado no blog oficial da Meta em português.
https://whatsappbusiness.com/pt-br/blog/
Duas fontes brasileiras secundárias afirmavam Brasil em fev/2026 e gratuidade para PMEs. **A
documentação oficial de preços da Meta desmente a gratuidade:** o Meta Business Agent é uma
categoria de cobrança criada em 01/07/2026 e **cobrada por token desde 01/08/2026**, à taxa global
de **US$ 2,00 por 1 milhão de tokens**. Uma mensagem consome tipicamente 20.000 a 25.000 tokens, ou
seja **cerca de US$ 0,04 a 0,05 por mensagem** (aproximadamente R$ 0,22 a R$ 0,28), em cobrança
única que já inclui a entrega. Sem linha de crédito configurada, as mensagens não são entregues.
https://developers.facebook.com/docs/whatsapp/pricing/
**[INFERÊNCIA] Isso rebaixa materialmente esta ameaça.** Mil mensagens por mês no agente nativo da
Meta custam cerca de R$ 250, ou seja o concorrente "gratuito" cobra, por volume modesto, quase o
preço do seu plano inteiro. Ele continua sendo ameaça de **distribuição** (está dentro do app, sem
instalar nada, sem risco de ban) e de **percepção** ("a Meta já faz isso"), mas **não** é mais o
piso de preço em R$ 0 que eu havia descrito. Fraquezas exploráveis: configuração manual em cerca de
16 etapas e aviso visível ao consumidor de que a conversa é gerida por serviço da Meta.

**2. [DADO] White label a R$ 297 a R$ 400/mês com clientes ilimitados.** Ao menos 8 fornecedores
brasileiros. ZapGPT White Label: R$ 2.997 de setup mais R$ 297/mês, com piso de revenda imposto de
R$ 67/mês por cliente final. https://www.ozapgpt.com.br/whitelabel
DB Ware: R$ 399,90/mês fixo, sem limite de clientes. https://www.dbware.com.br/revenda.php
**[INFERÊNCIA]** o custo marginal de mais um tenant é praticamente zero para milhares de
micro-revendedores. Preço por assento ou por tenant é estruturalmente indefensável nesse ambiente.

**3. [DADO] Um mercado de infoproduto ensinando a montar exatamente o seu produto.** IA Revolution
(R$ 298/ano, alega 6.000+ alunos), Intensivão n8n (R$ 97/mês ou R$ 697/ano, alega 11.000+ alunos),
mais 7 outros cursos identificados. Sinal quantificável de commoditização: um único domínio
(horadecodar.com.br) mantém pelo menos 7 artigos quase duplicados otimizados para variações de
"quanto cobrar automação n8n", ou seja o volume de busca é de **gente querendo entrar no negócio**,
não de compradores finais.
**[INFERÊNCIA]** a oferta de fornecedores está inflando mais rápido que a demanda. Isso comprime
preço de forma permanente.

### Preço praticado por agência (seu concorrente real hoje)

**[DADO]** Setup de automação com IA: R$ 1.500 a 5.000 típico, R$ 5.000 a 10.000+ para projeto
completo. Mensalidade de manutenção: R$ 500 a 1.500 típico, chegando a R$ 3.000.
https://horadecodar.com.br/quanto-cobrar-automacao-whatsapp-n8n/
**[INFERÊNCIA]** o mesmo cliente que a agência cobra R$ 3.000 de setup mais R$ 1.200/mês é
atendido pela Nexloo por R$ 149/mês sem setup. Esse delta é a sua oportunidade e o seu teto ao
mesmo tempo.

### Lacunas de verificação (honestidade metodológica)

**Verificados depois da primeira versão:** ZapResponder e HelenaCRM (ver acima), que são o conjunto
de pares que de fato importa.

Ainda não verificados: **ZapIA CRM, Responza, Digisac (preços), Octadesk (preços), Weni, GigaWhats,
WaSeller.** Internacionais verificados em detalhe (respond.io, WATI, Trengo, Interakt, ManyChat,
Chatfuel, Intercom Fin, Tidio) servem de referência de modelo de cobrança, não de concorrência
direta no Brasil. Chatwoot: US$ 0 (até 2 agentes) / 19 / 39 / 99 por agente/mês, remoção de marca só
no tier de US$ 99. https://www.chatwoot.com/pricing

---

## 4. Posicionamento: o que está saturado e o que está vazio

Base: headlines e promessas de 26 produtos e serviços brasileiros coletadas em julho de 2026.

### As 5 dores mais atacadas
1. Perder venda por não responder rápido ou fora do horário.
2. Caos operacional: conversas espalhadas, ninguém sabe quem falou com quem.
3. Custo de contratar gente.
4. Dependência de técnico ou desenvolvedor.
5. Lead que esfria por falta de follow-up.

### As 5 promessas mais repetidas
1. Atendimento 24 horas por dia, 7 dias por semana.
2. Vender mais, com percentual não auditável (Poli "até 30%", Anota AI "até 50%", Assis "+19%").
3. Sem código, configure em minutos (5, 10, 4, 2 minutos, todos dizem).
4. Tudo em uma só plataforma.
5. A IA treinada com o seu negócio.

### Saturado (não use nada disto)
"24/7", "sem código", "configure em X minutos", "plataforma completa", "automatize seu WhatsApp",
"aumente suas vendas em X%", "IA treinada com o seu negócio", "clone seu melhor vendedor".
Observação: "configure em minutos" é desmentido pela própria realidade do mercado, que cobra
R$ 1.197 a R$ 2.999 de implantação.

### Poucos dizem
Sem fidelidade e sem multa (só Huggy, e discretamente). Sem taxa de setup (quase ninguém afirma
positivamente). Mensagens ilimitadas (só Simple Chat). Traga sua própria chave de API (só
WiiChat). Custo por interação exposto (só Clint). Plano gratuito com número de WhatsApp de verdade
(só atende.aí).

### Ninguém diz (o espaço vazio)
1. **"A IA não vai inventar informação sobre o seu negócio."** Zero dos 26 posiciona controle de
   alucinação, apesar de ser a dor técnica número 1 nas reclamações (há reclamação formal contra a
   Zaia intitulada sobre alucinações da plataforma, e reclamações contra o BotConversa sobre o
   mesmo, ironicamente o player posicionado em simplicidade).
2. **"Você vê tudo que a IA respondeu e corrige."** Todos vendem autonomia. Ninguém vende controle.
3. **"Assumir a conversa na hora certa."** Todos vendem o robô. **Ninguém vende o handoff.** E a
   auditoria de 50 lojas virtuais brasileiras aponta que o erro mais comum de chatbot é
   justamente **falha de contexto na transferência para humano**.
   https://babitonhela.com/blog/erros-ia-atendimento-perder-cliente/
4. **"Seu número não vai ser bloqueado", com o mecanismo explicado.** Fornecedores só falam de
   banimento em blog, nunca na página de vendas.
5. **"Feito para quem atende sozinho."** Todo o mercado precifica por assento, e vários exigem
   mínimo de 2 usuários. Ninguém fala com o dono que **é** o atendimento.
6. **"Cancele em um clique."** Apesar de cobrança e cancelamento ser a reclamação campeã do setor.
7. **Vertical fora de restaurante.** Anota AI provou que verticalizar escala no Brasil (785
   reclamações significa escala grande). Fora de restaurante e delivery, **não existe um único
   agente de IA para WhatsApp verticalizado de verdade no Brasil.** Clínica, estética, odonto, pet
   e imobiliária aparecem em listas de 5 a 30 segmentos em Sellflux, Chat Inteligente, Simple Chat,
   SocialHub e Zappy: citados por todos, possuídos por ninguém.
8. **Preço por resultado.** Zero de 26 cobram por lead qualificado, conversa resolvida ou
   agendamento confirmado. Todos cobram por esforço de máquina (crédito, conversa, contato,
   interação), ou seja **o cliente paga igual quando a IA erra e perde a venda**.
   **⚠️ Ressalva importante, com dado contra:** este espaço é vazio por motivos estruturais, não por
   falta de imaginação do mercado, e a evidência recomenda cautela. No Brasil existe pay-per-resolution,
   mas só em enterprise e em dólar: **Cloud Humans** cobra US$ 0,44 a 0,69 por ticket 100% resolvido
   pela IA, com **mínimo mensal de US$ 1.955** (https://cloudhumans.com/en/prices), e a Zendesk BR
   declara cobrar só o resolvido mas **não publica o valor unitário**. Internacionalmente só a
   Intercom Fin tem tabela aberta, a US$ 0,99 por outcome (US$ 9,99 para qualificação de lead),
   cobrando **apenas em sucesso** (https://fin.ai/pricing). E o comportamento de compra vai na direção
   oposta ao discurso: **80% dos clientes da Decagon escolhem o modelo previsível por conversa quando
   têm as duas opções na mesa**, e a **Salesforce migrou de US$ 2 por conversa para US$ 0,10 por
   ação**, ou seja andou para consumo granular, não para outcome. Nas séries longitudinais,
   outcome-based é primário em apenas 5% (Growth Unhinged 2025, n=240) a 23% (ICONIQ, Q2/2026),
   enquanto **híbrido, assinatura mais créditos, é o modelo dominante e o que mais cresce** (37% a
   41%, com 29% já vendendo créditos de IA e 33% planejando em 12 meses).
   **[INFERÊNCIA]** cobrar por resultado é diferenciação real e inexplorada no SMB brasileiro, e é
   uma aposta de margem que exige definição contratual fechada, instrumentação e volume. **Não é
   jogada para os 10 primeiros clientes.** Fica como teste no mês 12, não como pricing de largada.

### Motivos de cancelamento, por volume de evidência
1. **Cobrança e cancelamento** (Poli com multa após 15 dias, BotConversa cobrando ano cheio sem
   uso, Kommo com mínimo de 6 meses e Artigo 49 do CDC citado, Anota AI, ManyChat cobrando após
   cancelar). Campeão absoluto.
2. **Suporte ausente ou lento** (BotConversa com tempo médio de resposta de 31 dias e 16h no
   Reclame Aqui; Zaia atendendo com a própria IA e sendo inútil; Huggy com plataforma parada).
3. **Não entregou o prometido** (Anota AI: 5,7/10, 785 reclamações, só 43,7% voltariam a fazer
   negócio).
4. **Complexidade e dependência de terceiro** (Kommo exigindo agência, Blip, Tallos).
5. **IA errando e alucinando.** Menos volumoso em reclamação formal, mais letal na relação, porque
   o dano acontece com o cliente **do** seu cliente.
6. **Número banido.** Subrepresentado em reclamação formal porque quem usa QR sabe que está fora
   dos termos e não reclama.
7. **Instabilidade com perda de mensagem** (Tallos: plataforma fora do ar por horas, mensagens não
   recuperadas). Para uma inbox de WhatsApp, perder mensagem é fatal.

Notas verificadas: Anota AI 5,7/10 com 785 reclamações e 43,7% dispostos a voltar; BotConversa
6,9/10; Kommo 7,1/10 com 238 reclamações; Take Blip 8,4/10; ManyChat 2,5/5 no Trustpilot com 273
avaliações; Blip com "value for money" 1,0/5 no Capterra. Ressalva: o Reclame Aqui bloqueia
leitura direta, esses números vêm de snippets indexados e devem ser revalidados antes de uso
comercial.

---

## 5. A decisão de arquitetura que ninguém discutiu: QR versus API Oficial

Esta é a decisão de maior consequência comercial do produto, e ela foi herdada, não decidida.

### [DADO] A API Oficial é gratuita para o seu caso de uso, mas **só até 30/09/2026**
https://developers.facebook.com/docs/whatsapp/pricing/ (verificado 30/07/2026)
- Desde **01/07/2025** a cobrança é **por mensagem entregue**, não mais por conversa de 24h.
- Hoje, dentro de uma janela de atendimento aberta (24h, aberta quando o cliente escreve):
  **"All non-template messages are free"**. Templates de utilidade dentro da janela também.
- **⚠️ CORREÇÃO IMPORTANTE, e é o relógio que mais importa nesta consultoria:** a própria
  documentação da Meta anuncia que **"Effective October 1, 2026, Meta will charge for service
  messages, which have not been charged since November 2024"**, e que passará a cobrar também
  **templates de utilidade enviados dentro da janela de 24h**. Ou seja **a gratuidade do
  atendimento acaba em 01/10/2026**, dois meses depois desta análise.
- Rate card oficial do **Brasil**, vigente 01/07/2026: marketing **US$ 0,0625** (R$ 0,3217),
  utility **US$ 0,0068** (R$ 0,0350), authentication US$ 0,0068, service **grátis (hoje)**.
  Marketing não tem desconto por volume.
- Desde **01/07/2026** é possível faturar em BRL, com migração obrigatória até 30/06/2027.

**[INFERÊNCIA] Recalculando a conta que importa:** a tarifa de service depois de 01/10/2026 ainda
não foi publicada. Usando a de utility no Brasil como referência (US$ 0,0068, cerca de R$ 0,035 por
mensagem), um agente com **5.000 respostas por mês custaria cerca de R$ 175/mês** de tarifa Meta.
Contra um plano de R$ 297, isso é 59% da receita. **Não use o preço de marketing (US$ 0,0625) para
essa conta**, que é 9 vezes maior e é o número que os blogs citam para assustar.

**[INFERÊNCIA] Consequências diretas:**
1. A afirmação "a API oficial é grátis para agente reativo" é verdadeira **hoje** e **expira em
   01/10/2026**. Qualquer plano de migração precisa ser precificado com custo variável, não com zero.
2. Isso **reforça** a decisão de ficar no QR agora, e reforça também que "conversas ilimitadas" como
   promessa comercial é seguro no QR e perigoso na oficial.
3. Se e quando migrar, o modelo correto é **repasse transparente da tarifa Meta** (padrão do
   respond.io e da 360dialog), nunca embutir com markup opaco (padrão da WATI).
4. O custo real da oficial hoje continua sendo **atrito de onboarding** (Business Manager,
   verificação de empresa, templates aprovados) e, sobretudo, o fato de **o número deixar de
   funcionar no app normal do WhatsApp**.

### [DADO] O risco do QR é real, documentado, e inclui banimento sem envio nenhum

**A Meta tem página dedicada dizendo exatamente que vincular a conta a um cliente não oficial
viola os Termos.** Isso não é interpretação, é texto oficial:
- "About unofficial apps": **"linking your WhatsApp account to unofficial versions of WhatsApp
  violates our Terms of Service"**, com três níveis de consequência declarados, ban temporário, ban
  permanente, ou restrição da capacidade de vincular dispositivos.
  https://faq.whatsapp.com/1217634902127718
- "About account bans for unofficial apps": "Using an unauthorized application and/or unsupported
  device violates our Terms of Service", podendo resultar em banimento.
  https://faq.whatsapp.com/1064395290901991
- "About temporarily banned accounts": se não migrar para o app oficial após o ban temporário, a
  conta **pode ser banida permanentemente**. https://faq.whatsapp.com/1848531392146538
- "About account bans": **serviços de terceiros não podem banir nem desbanir uma conta, só a
  WhatsApp pode.** https://faq.whatsapp.com/465883178708358
  **[INFERÊNCIA]** isso torna mentirosa qualquer promessa comercial de "número protegido contra
  ban", que vários revendedores de Evolution fazem. Não faça essa promessa.
- Termos de Serviço proíbem "bulk messaging, auto-messaging, auto-dialing, and the like", proíbem
  uso **não pessoal** sem autorização, e proíbem disponibilizar o serviço em rede para múltiplos
  dispositivos **exceto pelas ferramentas que a WhatsApp expressamente forneceu**, além de criar
  software que funcione substancialmente igual ao serviço e oferecê-lo a terceiros.
  https://www.whatsapp.com/legal/terms-of-service
- Central de Ajuda, aviso vigente desde 07/12/2019: "Our products are not intended for bulk or
  automated messaging". https://faq.whatsapp.com/5957850900902049
- Business Terms (16/02/2024) proíbem desenvolver ou usar aplicações que interajam com os Business
  Services sem consentimento escrito prévio. https://www.whatsapp.com/legal/business-terms/

**[DADO] Política de litígio declarada, e é o ponto que atinge você e não só o cliente.** Na mesma
página de 07/12/2019, a WhatsApp declara mover ação legal contra quem estiver engajado em, **ou
auxiliando outros em**, abuso que viole os Termos, **mesmo baseando-se apenas em informação
disponível fora da plataforma**, e dá como exemplo explícito de evidência off-platform as
**alegações públicas de empresas sobre sua capacidade de usar o WhatsApp de formas que violam os
Termos**. https://faq.whatsapp.com/5957850900902049
**[INFERÊNCIA] Consequência operacional direta e concreta:** o seu próprio material de marketing é
evidência. Nunca anuncie disparo em massa, nunca anuncie "conecte por QR e não pague a API da
Meta", nunca prometa proteção contra ban. Isso é gratuito de cumprir e é exatamente o gatilho que a
Meta declarou usar.

**[DADO] Sinal estrutural de que o ban é comum:** o Baileys tem código de erro dedicado para número
banido, adicionado ao enum `DisconnectReason` no PR #280 (07/2023).
https://github.com/WhiskeySockets/Baileys/pull/280
**[INFERÊNCIA]** uma biblioteca não cria constante de erro de primeira classe para evento raro.

**[DADO] Recuperar um ban não é trocar de chip.** Nenhum terceiro pode desbanir (FAQ 465883178708358),
e há caso documentado de conta restaurada com entrega de mensagens 1:1 quebrada
(https://github.com/WhiskeySockets/Baileys/issues/2699). Trocar o número significa perder histórico,
reputação do número e o canal que os contatos do cliente já conhecem.
- Evolution API #2497, "Todo número que conecto é banido" (04/2026): dois números derrubados **só
  de ler o QR**, sem enviar nada.
  https://github.com/evolution-foundation/evolution-api/issues/2497
- Evolution API #439: ban enviando para ~10 contatos em paralelo. #1946: ban usando a API **apenas
  para ler mensagens**, sem enviar. #2228: só **checar** muitos números derruba a conta.
- Baileys #1245: número banido ao conectar; resposta de um mantenedor: "expected".
  https://github.com/WhiskeySockets/Baileys/issues/1245#issuecomment-2637758780
- Baileys #2707 (07/2026, aberto), **o caso mais próximo do seu**: erro 463 "Reachout Timelock",
  ban temporário ao iniciar conversa com quem nunca contatou o número, porque a lib não gerencia o
  Trusted Contact Token. https://github.com/WhiskeySockets/Baileys/issues/2707
- O README do Baileys declara não afiliação e desencoraja mensageria em massa. **A Evolution API
  não publica disclaimer de risco nem de não afiliação**, e fecha pedidos de anti-ban como
  `not_planned` (#1946, #2538). O fornecedor da sua camada mais crítica não assume esse risco.

### [DADO] Não existe taxa base confiável de banimento
Os três números que circulam são auto-reportados por quem vende a alternativa e **divergem por um
fator de ~34x**: 68% em 12 meses (Kraya AI, base de clientes própria, Índia), menos de 2% em 12
meses para bots só reativos (Achiya Automation, 50+ casos, Israel), 40 a 60% no 1º trimestre de
2026 (Agência Café Online, "estimativas de comunidades", inrastreável). Não há estudo independente.

### [DADO] O perfil de risco depende do comportamento, e o seu é o mais seguro
Os fatores citados de forma consistente por todas as fontes são de **envio ativo**: volume,
denúncias, número novo sem aquecimento, mensagens idênticas, cold outreach, baixa razão
resposta/envio, envio sem delay. O DeskCRM hoje é inbound, reativo, um número, e o cliente responde
porque foi ele quem chamou.

**Distinção que precisa ficar clara, para você não se enganar:** uso reativo reduz a chance de
acionar a **detecção comportamental**, e **não** torna a operação conforme. A violação de vincular a
conta a um cliente não oficial é de **estado**, não de comportamento: ela existe no instante em que
o QR é lido, independente do que você faz depois. É por isso que existem relatos de ban com zero
envio. Portanto a promessa correta ao cliente não é "é seguro", é "o risco é baixo no uso que você
vai fazer, existe, e eis o meu plano se acontecer".

### [INFERÊNCIA] A matriz que decide o roadmap

| | QR (Baileys/Evolution) | API Oficial |
|---|---|---|
| Responder inbound dentro de 24h | grátis, risco baixo mas real | **grátis**, risco praticamente nulo |
| Follow-up depois de 24h | grátis, **risco alto** | template de utilidade, **pago** |
| Campanha de reativação | grátis, **risco muito alto** | template de marketing, **pago** |
| Onboarding | segundos, escaneia QR | dias, verificação de empresa |
| Número continua no app do WhatsApp | **sim** | **não** |

**Conclusão:** não existe caminho em que follow-up e campanha sejam grátis e seguros. E o QR não é
apenas o caminho barato: é o único que deixa o dono continuar usando o WhatsApp normalmente no
mesmo número, o que para uma clínica com secretária no celular é requisito, não preferência. É por
isso que quase todo o mercado brasileiro de PME usa QR.

### Recomendação
1. **Continuar no QR agora.** Migrar antes de ter clientes destruiria a única vantagem real
   (onboarding em segundos) sem nenhum ganho compensatório.
2. **Falar do risco na cara, e ser o único a fazer isso.** Aviso no `/connect`, cláusula no contrato
   e um plano de contingência documentado (o que acontece se o número cair, como reconectar com
   outro número, o que você faz pelo cliente). Ninguém no mercado faz isso, e é diferenciação a
   custo zero de desenvolvimento. **Recomendação concreta: o cliente conecta um número dedicado ao
   atendimento, nunca o número pessoal do dono nem o único número da empresa.** Isso transforma o
   pior caso de "perdi meu canal" em "troco o número de atendimento".
3. **Nunca construir disparo em massa sobre QR.** Isso não é cautela, é sobrevivência: você estaria
   vendendo uma funcionalidade que queima o ativo mais importante do seu cliente.
3b. **Três regras de marketing que não custam nada e reduzem risco jurídico:** nunca anunciar
   disparo em massa; nunca usar "não pague a API da Meta" como argumento de venda; nunca prometer
   proteção contra banimento. A Meta declarou usar alegações públicas de marketing como evidência
   off-platform para ação legal, e nenhum terceiro pode desbanir uma conta.
4. **API Oficial entra como caminho alternativo aos 6 meses**, para quem quer segurança e aceita a
   fricção, e como pré-requisito de qualquer coisa que envie mensagem fora da janela de 24h.

---

## 6. Análise crítica da sua hipótese de produto

Sua hipótese: evoluir de "WhatsApp + IA + atendimento humano" para "WhatsApp + IA + CRM +
automação + vendas", com o fluxo lead entra, IA qualifica, oportunidade no pipeline, follow-up,
venda registrada, gestor acompanha.

**Isso está errado por três motivos concretos.**

**1. O fluxo pressupõe um cliente que não é o seu.** "Equipe acompanha", "gestor acompanha
resultados" e "oportunidade no pipeline" descrevem uma operação com vendedores e um gestor
separado deles. A PME que vende pelo WhatsApp é, em esmagadora maioria, o dono mais uma ou duas
pessoas. Não há gestor para olhar dashboard. **[DADO]** 12% das micro empresas com até 3
funcionários bateram meta de vendas em 2024, contra 52% das grandes (RD Station Panorama 2025): a
diferença não é falta de pipeline, é falta de gente.

**2. Você estaria construindo o produto que já existe e é commodity.** Nexloo entrega CRM Kanban a
R$ 149. Sellflux entrega RAG mais follow-up automático a R$ 149. Kommo é pipeline desde sempre. Ao
completar seu fluxo, você chega, com 1 a 2 horas por dia, num produto que 15 concorrentes já têm,
por um preço que você não consegue bater.

**3. Os dois elos finais do seu fluxo dependem de mandar mensagem fora da janela de 24h**, ou seja
são exatamente onde o QR te bane e a oficial te cobra. O follow-up automático não é um item de
roadmap, é uma decisão de arquitetura e de risco.

### Qual é o produto certo, então

Não é um CRM. É o que você já tem, levado ao extremo numa direção que ninguém está ocupando:
**um atendente de IA que você supervisiona, que te entrega o lead qualificado pronto, e que nunca
te deixa perder uma conversa.**

O elemento que falta não é pipeline. É **prova de valor entregue onde o dono já está**.

---

## 7. O problema de retenção que ninguém te contou

**[INFERÊNCIA] Este é o maior risco de churn do DeskCRM, maior que banimento.**

O valor acontece dentro do WhatsApp. A IA responde, e o dono **vê as respostas no celular dele de
qualquer jeito**, porque é o número dele. O CRM é um lugar que ele não precisa visitar. Em 30 a 60
dias, o dono não abre mais o painel, deixa de perceber o que está pagando, e cancela na primeira
aperto de caixa. Isso é consistente com o motivo de cancelamento número 3 do setor ("não deu
resultado", Anota AI com 43,7% dispostos a voltar) e com o motivo número 1 (cobrança, que é o
gatilho quando o valor percebido já caiu a zero).

Corolário: **a retenção do DeskCRM não vem de funcionalidade, vem de prova de valor recorrente
entregue por WhatsApp.** Uma mensagem semanal do tipo "essa semana a IA atendeu 47 conversas, 6
pessoas querem agendar e você respondeu 3" faz mais pela retenção que pipeline, dashboard e agenda
somados. E é barato de construir, porque o dado já existe.

---

## 8. Priorização de funcionalidades

Notas de 0 a 10. "Esforço" é custo (nota alta significa muito esforço, o que é ruim).

| Funcionalidade | Demanda | Valor percebido | Diferenciação | Impacto venda | Impacto retenção | Esforço dev | Esforço operacional | Monetização | Veredito |
|---|---|---|---|---|---|---|---|---|---|
| **Persistir a qualificação da IA (summary/action/preferência)** | 7 | 8 | **9** | 7 | 8 | **2** | 1 | 6 | 🔴 Crítica |
| **Notificar o dono no WhatsApp (lead qualificado, IA pausada)** | 9 | 9 | 6 | 8 | **9** | **3** | 1 | 7 | 🔴 Crítica |
| **Resumo semanal de valor por WhatsApp** | 6 | 8 | **8** | 6 | **9** | 3 | 1 | 5 | 🔴 Crítica |
| **Deploy, cadastro e cobrança mínima** | 10 | 3 | 0 | **10** | 5 | 5 | 3 | **10** | 🔴 Crítica (é pré-requisito) |
| **Presets de prompt por nicho** | 7 | 8 | **8** | 8 | 7 | 3 | 2 | 6 | 🟠 Alta |
| **Aviso e contingência de banimento** | 5 | 6 | **9** | 5 | 8 | 1 | 3 | 3 | 🟠 Alta |
| Base de conhecimento por upload | 6 | 7 | 3 | 5 | 6 | 6 | 5 | 5 | 🟡 Média |
| Pipeline Kanban | 5 | 6 | **1** | 4 | 4 | 7 | 4 | 4 | 🟢 Baixa |
| Dashboard | 4 | 5 | 2 | 3 | 3 | 6 | 3 | 3 | 🟢 Baixa |
| Agenda própria | 6 | 8 | 4 | 6 | 7 | **9** | **8** | 7 | 🟡 Média (depois) |
| Follow-up automático | 8 | 8 | 4 | 7 | 7 | 6 | **9** (risco de ban) | 7 | 🟡 Média (só com API oficial) |
| Campanhas de reativação | 7 | 7 | 3 | 6 | 5 | 7 | **10** (risco de ban) | 8 | 🟢 Baixa (não fazer no QR) |
| Multi-WhatsApp | 3 | 5 | 1 | 3 | 4 | 6 | 5 | **8** | 🟢 Baixa |
| Automações com construtor visual | 3 | 5 | 1 | 3 | 4 | **9** | 7 | 4 | 🟢 Baixa (nunca, para esse público) |
| Gestão de equipe | 2 | 3 | 0 | 2 | 3 | 5 | 4 | 5 | 🟢 Baixa |

### Justificativa dos vereditos que contrariam sua expectativa

**Pipeline Kanban: não construir.** [DADO] Nexloo, Sellflux, SocialHub, Clint, Kommo, BotConversa e
Poli todos têm. Diferenciação zero. E a premissa de que "a IA atualiza o pipeline automaticamente"
é atraente para você (é bonito de construir) e irrelevante para o cliente: um dono de clínica com
40 conversas por semana não precisa de colunas, precisa saber **quem quer marcar hora**. O valor
que você imagina no Kanban é entregue por uma lista de 6 nomes com um resumo em cada.

**Dashboard: não construir agora.** Métrica é linguagem de gestor. O seu comprador não tem gestor.
E "8 clientes demonstraram interesse mas não receberam proposta" é um insight que exige o dado de
proposta, que você não tem e não vai ter sem alimentação manual, que o dono não vai fazer.

**Agenda: não agora, e talvez nunca própria.** É a funcionalidade de maior valor percebido para o
nicho que eu recomendo, e a de maior esforço operacional (disponibilidade, bloqueios, duração,
reagendamento, lembrete, fuso, conflito). Você já tem o "agendar por alto": a pessoa diz dia e
período, o grupo é avisado, a IA pausa, um humano confirma. **Isso é exatamente o que uma clínica
faz hoje com secretária.** Vender isso como "agendamento assistido" é honesto e suficiente. Se um
dia virar prioridade, integre Google Calendar e não construa agenda própria.

**Follow-up automático: alta demanda, mas é uma bomba no QR.** Baileys #2707 documenta ban ao
iniciar conversa com contato novo. Fazer follow-up ativo em escala sobre QR é o cenário exato dos
relatos de banimento. Só entra depois da API Oficial, e aí custa template de utilidade por
mensagem. Um substituto honesto e barato: **não fazer follow-up automático, e sim avisar o dono
que existe lead parado**, deixando o disparo humano. Zero risco novo, quase todo o valor.

**Campanhas: não construir.** É o pior caso possível na sua arquitetura, e ainda tem risco de LGPD
e do CDC. Se um cliente pedir, a resposta correta é não.

**Automações com construtor visual: nunca, para esse público.** [DADO] avaliações do Blip no G2
descrevem "emaranhado de setas" e do Kommo apontam que as automações de IA exigem ajuda de agência.
Construtor visual é a forma mais eficiente de transformar seu produto simples em produto que exige
consultoria, o que você não tem gente para prestar.

**Base de conhecimento por upload: média, não crítica.** Sellflux já entrega RAG a R$ 149, então
não diferencia. E cria um problema operacional novo, informação desatualizada dentro do PDF, que
gera exatamente a alucinação que você quer combater. O campo de detalhes livres que você já tem
cobre 90% do caso com 5% do custo.

---

## 9. Posicionamento recomendado

### Avaliação das opções

| Opção | Clareza | Diferenciação | Demanda | Concorrência | Facilidade de venda | Valor percebido | Escala | Nota |
|---|---|---|---|---|---|---|---|---|
| A. CRM com IA para WhatsApp | 7 | **2** | 8 | **10 (brutal)** | 5 | 6 | 7 | ✗ |
| B. Central de atendimento com IA | 8 | **2** | 7 | **10** | 5 | 6 | 7 | ✗ |
| C. Plataforma de vendas pelo WhatsApp | 6 | 3 | 8 | 9 | 6 | 7 | 7 | ✗ |
| D. IA que atende e organiza sua operação | 5 | 3 | 7 | 9 | 4 | 6 | 6 | ✗ |
| E. Automação comercial com IA | 4 | 3 | 6 | 8 | 4 | 6 | 6 | ✗ |
| **F. Atendente de IA com supervisão humana, para quem atende sozinho** | **8** | **9** | 7 | **2** | **8** | 8 | 7 | ✓ |
| G. Vertical: a secretária de IA da sua clínica | **9** | **8** | 6 | **1** | **9** | **9** | 5 | ✓✓ (como GTM) |

**Descarte de A e B com razão explícita.** "CRM com IA para WhatsApp" tem dois defeitos fatais.
Primeiro, você compete de frente com Nexloo, Sellflux, Clint, Kommo, SocialHub e Poli, todos com
mais funcionalidade. Segundo, e mais grave: **o produto não é um CRM**, e prometer CRM é fabricar o
motivo de cancelamento número 3 do setor ("não entregou o prometido"). O contato no seu sistema tem
seis campos e não é editável. Chamar isso de CRM é vender uma expectativa que o produto quebra na
primeira semana.

### Recomendação

**Categoria:** atendente de IA para WhatsApp com supervisão humana. Não CRM, não central de
atendimento, não plataforma de vendas.

**Promessa central (uma frase, para a landing):**
> A IA atende seu WhatsApp na hora, você vê tudo que ela falou, e assume com um toque quando o
> cliente é importante.

**Promessa para o nicho (para a venda 1:1):**
> Nenhum paciente vai ficar sem resposta, e você recebe no WhatsApp quem quer marcar hora.

**Três pilares de mensagem, todos em espaço vazio de mercado:**
1. **Controle.** Você vê cada palavra que a IA disse. Ela só fala o que você escreveu. Ataca a dor
   técnica número 1 e o dado de que 59% dos consumidores não gostam de resposta automática.
2. **Handoff.** A IA sabe quando parar. Ataca o erro de chatbot mais comum do país.
3. **Sem armadilha.** Sem taxa de setup, sem fidelidade, cancele sozinho. Ataca o motivo de
   cancelamento número 1 do setor, e é diferenciação a custo zero de desenvolvimento.

### O nome está errado

**"DeskCRM" trabalha contra a estratégia.** Ele anuncia a categoria (CRM) que eu recomendo não
disputar, cria a expectativa que o produto não cumpre, e é um nome em inglês para um dono de
clínica no interior de Minas. Trocar o nome custa algumas horas hoje e custa a base inteira depois
que houver clientes, contratos e domínio. **Troque antes de vender o primeiro.** Direção: algo que
evoque atendimento e presença, em português, curto, pronunciável ao telefone.

---

## 10. Vertical ou horizontal, regional ou nacional

### Vertical ou horizontal: **produto horizontal, go-to-market vertical, um nicho por vez**

Você não precisa escolher: sua arquitetura já resolve isso. `clients.agent_config` mais
`buildPersona` significa que **um nicho é um preset de configuração**, não um fork de produto. Um
JSON por nicho, e o produto continua único.

**[DADO]** Anota AI provou que verticalizar escala no Brasil. E fora de restaurante não existe um
único agente de IA para WhatsApp verticalizado no país, enquanto clínica, odonto, estética e
imobiliária aparecem em listas de 5 a 30 segmentos de cinco concorrentes ao mesmo tempo: citados
por todos, possuídos por ninguém.

**Nicho inicial recomendado: clínicas e consultórios (odontologia e estética primeiro).**
Critérios, em ordem de peso:
1. **Você já tem acesso e credibilidade.** A OBS já atende dentistas, médicos e clínicas. Isso é
   distribuição pronta, e distribuição é o seu gargalo real.
2. **O resultado é contável.** "Quantas pessoas pediram para marcar hora essa semana" é uma métrica
   que o dono entende sem explicação. Isso resolve o "não deu resultado".
3. **O valor de um lead perdido é alto.** Um implante ou um pacote de estética paga anos de
   mensalidade. Isso sustenta preço acima de R$ 250.
4. **O escopo é fechado**, o que reduz alucinação: procedimentos, horários, convênios, endereço.
5. **O "agendar por alto" que você já tem é 80% do valor**, porque a clínica já tem alguém que
   confirma horário.

**Nichos a evitar agora:** restaurante e delivery (Anota AI domina, e o produto certo é cardápio e
PDV, não conversa), advocacia (OAB restringe captação e publicidade, risco de você vender algo que
o cliente não pode usar), e qualquer negócio cujo valor médio de venda seja baixo (o lead não paga
a mensalidade).

### Regional ou nacional: **regional de verdade primeiro, sem desculpa**

Recomendo a Opção A, e não por conservadorismo. Por matemática.

**[DADO]** Não existe benchmark brasileiro de CAC de SaaS SMB com metodologia publicada. A
compilação mais citada (Baita, que declara ser compilação de estimativas de terceiros, sem amostra
e sem ano) fala em R$ 3.000 a 12.000 para SMB.
**[INFERÊNCIA]** Com 1 a 2 horas por dia, zero prova social e zero orçamento de mídia, seu CAC em
canal nacional pago é indefinido e provavelmente proibitivo. Já o CAC de bater na porta de uma
clínica em Mutum onde você já é conhecido é **próximo de zero em dinheiro**, e o ciclo de
aprendizado é de dias, não de meses.

O híbrido correto não é "vender nos dois". É:
- **Vender só na região** (visita, WhatsApp, indicação) até 10 clientes pagantes.
- **Publicar nacionalmente desde o dia 1**, mas só conteúdo, com custo zero: os bastidores reais,
  os prints de conversa que a IA atendeu, o que deu errado. Isso constrói o ativo (audiência,
  autoridade, SEO) que você vai precisar no mês 6, sem gastar hora de venda agora.
- **Aceitar cliente de fora se ele chegar sozinho**, mas não persegui-lo.

---

## 11. Pricing

### O que o mercado faz
Piso credível R$ 87 a 99. Cluster sério R$ 149 a 199. Meta a R$ 0. White label a R$ 297 com
clientes ilimitados. Taxas de setup de R$ 1.197 a 2.999 escondidas em metade do mercado. Travas de
6 a 12 meses. Cobrança por crédito, conversa, contato ou interação, que gera medo de conta
surpresa.

### [DADO] O custo variável não é a sua restrição
gpt-5-nano a US$ 0,05 por milhão de tokens de input e US$ 0,40 de output; transcrição a US$ 0,003
por minuto. 1.000 minutos de áudio por mês por tenant custam cerca de US$ 3,00. Fontes:
https://developers.openai.com/api/docs/pricing e https://cloud.google.com/speech-to-text/pricing
Somado a QR (R$ 0 de Meta) e Supabase, **o custo marginal por cliente é de poucos reais por mês**.
Sua restrição é hora de suporte, não custo de máquina.

### ⚠️ Recomendação revisada (31/07/2026): pricing POR USUÁRIO

A recomendação de plano único abaixo foi feita quando o foco era clínica solo. Com a decisão de
ser **horizontal** e o fato de todo o mercado cobrar por assento (é a alavanca de expansão de
receita), o modelo correto é **por usuário**:

- Plano base com 1 usuário incluído, conversas ilimitadas, sem setup, sem fidelidade.
- Preço por usuário adicional (o upsell que faz a receita crescer com o cliente).
- Faixa alvo alinhada ao mercado (ZapResponder R$ 132 a 422, Helena a partir de R$ 657/3 usuários):
  ancorar o base entre R$ 150 e 250 e o usuário adicional entre R$ 40 e 80, a calibrar na venda.
- Cláusula de uso justo no contrato para "conversas ilimitadas" (protege quando migrar para API
  Oficial, quando a Meta passa a cobrar mensagem de serviço em 01/10/2026).

O texto de plano único a seguir fica como registro histórico do raciocínio.

### Registro histórico: um plano só, R$ 297/mês

**Plano único, "Atendimento", R$ 297/mês, cobrado mensalmente.**

Inclui:
- 1 número de WhatsApp
- **conversas e mensagens ilimitadas** (só a Simple Chat faz isso, e é o antídoto do medo de conta
  surpresa)
- agente de IA configurável pelo próprio cliente, com preset do nicho
- inbox com histórico, handoff por conversa, e a IA pausando sozinha quando você digita no celular
- qualificação automática do lead e aviso no seu WhatsApp
- resumo semanal de resultado
- **sem taxa de setup, sem fidelidade, cancelamento em um clique**

**Por que R$ 297 e não R$ 149:**
1. **Aritmética de tempo.** Com 1 a 2 horas por dia você não sustenta 100 clientes. 10 clientes a
   R$ 297 dão R$ 2.970 de MRR com 10 relacionamentos para cuidar. 10 a R$ 99 dão R$ 990, que não
   paga o custo de suporte de um único cliente confuso.
2. **Você não vence a guerra de preço.** GPT Maker a R$ 87 e white label a R$ 297 ilimitado
   garantem que sempre haverá alguém mais barato. Competir por preço é escolher a única disputa
   que você perde por estrutura.
3. **Ancoragem no nicho.** Para uma clínica, R$ 297 é menos que um procedimento. O comparativo
   correto não é "outro software", é "uma secretária de meio período".
4. **Preço baixo atrai o pior cliente.** [INFERÊNCIA] O comprador de R$ 99 é o mais sensível a
   preço, o mais propenso a churn e o que dá mais suporte por real pago.

**O que cobrar à parte:** número adicional de WhatsApp, R$ 149/mês. É o único upsell que eu
recomendaria agora, e só porque tem custo real (mais uma instância). Não crie cobrança por crédito,
por conversa nem por interação: é exatamente o que gera o medo e a reclamação de conta surpresa no
resto do mercado, e você não precisa, porque o seu custo variável é irrelevante.

**[DADO] Validação do preço contra o conjunto real de pares.** ZapResponder cobra R$ 132 (1 número)
a R$ 199 (3 números, 20 atendentes, 10 boards de CRM) em API Oficial, com trial de 7 dias e sem
setup. HelenaCRM cobra R$ 657/mês para 3 usuários. **R$ 297 fica exatamente no meio: 50% acima do
concorrente mais barato e 55% abaixo do mais completo.** Essa é a posição correta, mas ela **só se
sustenta se a venda for por nicho, promessa e onboarding assistido**. Numa comparação de
funcionalidades você perde para o ZapResponder. Se a objeção de preço aparecer em mais de 5 das 10
primeiras conversas, o problema não é o número, é o nicho ou a promessa.

**[DADO] Validação secundária, internacional.** O melhor referencial
comercial do mundo hoje é o **respond.io**, o único entre oito internacionais analisados com **IA
inclusa sob uso justo, sem métrica de consumo**, a partir de US$ 79/mês, e com repasse da tarifa Meta
declaradamente **sem markup** (https://respond.io/pricing). O que **não** copiar: Trengo (€ 299/mês
mais € 0,25 por conversa de IA) e WATI (1 crédito por resposta de texto, 3 por resposta rica, 5 por
minuto de voz), cobrança tão granular que o cliente não consegue prever a fatura. No Brasil, com
Zenvia entre R$ 600 e R$ 3.900/mês e RD Station Conversas entre R$ 989 e R$ 2.699/mês, ambos com IA
inclusa, **a faixa competitiva com IA inclusa é de R$ 300 a R$ 800/mês**. R$ 297 fica na borda
inferior dessa faixa, o que é a posição correta para entrar sem disputar o porão de R$ 87 a 149.

**⚠️ Cláusula de proteção que precisa entrar no plano desde o primeiro contrato.** "Conversas
ilimitadas" é seguro **enquanto você estiver no QR**, onde o custo marginal por mensagem é zero. A
partir de **01/10/2026 a Meta passa a cobrar mensagens de serviço na API Oficial**, e nessa hora
"ilimitado" viraria prejuízo em qualquer cliente de alto volume. Escreva no contrato que o uso justo
é definido em volume mensal de conversas, com aviso de 30 dias para revisão. Você não precisa
divulgar um teto na vitrine; precisa ter o direito de rever antes de migrar de conexão.

**Plano superior, só depois de 10 clientes:** "Equipe", R$ 597/mês, com múltiplos números,
múltiplos usuários e API Oficial. Não construa nada disso antes de alguém pedir e oferecer dinheiro.

**Sobre implantação:** ofereça a configuração guiada de graça nos 10 primeiros, presencialmente ou
por chamada de 30 minutos. Não é generosidade, é sua fonte de aprendizado, e "sem taxa de setup" é
um dos seus três pilares de mensagem. Se depois virar gargalo, aí você cobra.

**Sobre trial:** **não ofereça trial self-service agora.** Com zero prova social ele converte perto
de zero e consome suporte. Ofereça o inverso: **primeiro mês pelo preço cheio com devolução
integral se ele não gostar**. Reversão de risco sem dar o produto de graça.

---

## 12. Modelo de negócio

**Para os 10 primeiros: SaaS com venda consultiva 1:1 e onboarding assistido.** Não self-service,
não freemium, não demo automatizada. Você fala com o dono, configura o agente com ele, e cobra por
Pix ou boleto manual em planilha.

Por quê: com zero prova social, self-service não converte; e o onboarding assistido é o único jeito
de descobrir, em 10 conversas, qual campo do formulário ninguém entende, qual promessa vende e qual
objeção mata a venda. Esse aprendizado vale mais que os R$ 2.970.

**Evolução:**
- 10 a 30 clientes: cadastro self-service, cobrança automatizada (Asaas ou Stripe), onboarding
  guiado dentro do produto, presets por nicho fazendo o trabalho que hoje é seu.
- 30 a 100: trial self-service, conteúdo como canal principal, programa de parceiros.

**Não faça SaaS mais serviço.** É o caminho natural para uma agência e é a armadilha: cada
customização é um cliente que só você sabe operar, e você não tem hora para isso. Se um cliente
exigir customização, o preço correto é não.

---

## 13. Programa de parceiros

**[DADO] Dois desenhos econômicos no mercado, mutuamente exclusivos:**
- Comissão sobre a receita que você fatura, padrão brasileiro: 8% a 20%, com janela ou decaimento.
  Poli 8% a 12% no ano 1 caindo para 3% a 7%; Zenvia 10% (Finder) a 20% (VAR Platinum, vitalício);
  RD Station afiliados 20% por 12 meses; Chatguru R$ 500 por contrato ou até 20% de MRR.
- Desconto de compra e revenda, padrão internacional: 35% a 50%. Kommo 35% a 50% vitalício, mais
  100% na primeira venda; Bitrix24 20% a 50% de desconto.
Fontes: https://poli.digital/parceiros/ , https://zenvia.com/politica-comercial-programa-parceiros/ ,
https://content.partnerportal.rdstation.com/programa-de-afiliados , https://www.kommo.com/partners/become-partner/

**Recomendação: não crie programa de parceiros agora.** É a recomendação mais importante desta
seção. Você não tem produto no ar, não tem prova social, não tem material de venda e não tem
suporte. Um parceiro vendendo um produto que você ainda não sabe vender gera cliente errado, com
expectativa errada, que churna e reclama do seu nome.

**Quando fizer (a partir de ~15 clientes), faça o mais simples possível:**
- **Indicação, 20% recorrente enquanto o cliente estiver ativo e adimplente.** Não crie tiers, não
  crie certificação, não crie portal. Um cupom por parceiro, pagamento mensal por Pix, controle em
  planilha.
- **Público certo:** contadores e agências pequenas da sua região. O contador fala com 100 PMEs e é
  a única pessoa em quem o dono confia mais que no sobrinho que entende de computador.
- **Não faça white label.** [DADO] o white label brasileiro custa R$ 297 a 400/mês com clientes
  ilimitados, ou seja o preço já está definido por baixo e é uma corrida que você não ganha. E
  white label transfere sua marca e sua aprendizagem para o revendedor exatamente na fase em que
  marca e aprendizagem são o único ativo que você está construindo.

---

## 14. Plano dos primeiros 10 clientes

Premissas: 1 a 2 horas por dia, você mais um sócio, região de Mutum/MG, Instagram existente, zero
prova social. Total de esforço: cerca de 8 semanas.

### Semana 1 e 2: pôr no ar e fechar o furo do lead perdido
- **Objetivo:** produto acessível pela internet, e nenhum lead qualificado se perdendo em silêncio.
- **Tarefas:** deploy (Vercel mais Supabase já existente, domínio próprio); rever o `Rotas` do n8n
  para tirar o número pessoal e a palavra-chave de treino hardcoded; permitir configurar o destino
  da notificação pela UI (hoje `notify_group_jid` só por SQL, e sem ele a ação `agendar` falha em
  silêncio); redigir o aviso de risco de conexão no `/connect` e a cláusula de contingência.
- **Entregável:** URL pública funcionando, com o seu próprio WhatsApp da OBS rodando nela.
- **Métrica:** o agente da OBS operando 7 dias em produção sem intervenção.
- **Risco:** gastar as duas semanas polindo UI. Não faça. Feio e no ar vence bonito no localhost.

### Semana 3: transformar a qualificação em produto
- **Objetivo:** parar de jogar fora o `summary`, `action` e `preferencia_horario`.
- **Tarefas:** colunas novas em `chat_messages` ou tabela `lead_events`; gravar no nó do n8n;
  mostrar na conversa e numa lista "Precisa de você" com o resumo da IA em cada item; enviar o
  aviso no WhatsApp do dono quando `action` for `agendar` ou `pausar`.
- **Entregável:** você recebendo no seu WhatsApp "Novo lead: Maria, quer marcar terça à tarde,
  resumo do caso" e vendo isso no painel.
- **Métrica:** 100% dos leads qualificados gerando aviso.
- **Risco:** querer construir Kanban nesse embalo. Não.

### Semana 4: preparar a venda, não o produto
- **Objetivo:** ter o que mostrar e o que dizer.
- **Tarefas:** preset de prompt para clínica odontológica e para estética; uma página só com a
  promessa, três pilares, preço e um botão de WhatsApp; **gravar um vídeo de 90 segundos de uma
  conversa real** (número seu conversando com o agente da OBS, mostrando a IA respondendo, você
  assumindo, e o aviso chegando); lista de 20 clínicas da região com nome do dono e como você chega
  nele.
- **Entregável:** vídeo, página, preset, lista de 20.
- **Métrica:** 20 nomes com caminho de acesso identificado.
- **Risco:** escrever copy genérica de "24/7". Use os três pilares.

### Semana 5 e 6: vender presencialmente
- **Objetivo:** 4 clientes pagantes.
- **Tarefas:** 10 conversas por semana, presenciais ou por WhatsApp. Roteiro de 10 minutos: pergunte
  quantas mensagens ficam sem resposta no fim de semana; mostre o vídeo; configure o agente **junto
  com ele, na hora, em 15 minutos** (é o seu momento mágico, e o construtor guiado existe para
  isso); conecte o QR; mande uma mensagem de teste do seu celular para o número dele e deixe ele
  ver a IA respondendo com o nome da clínica dele.
- **Entregável:** 4 assinaturas a R$ 297, cobradas por Pix.
- **Métricas:** conversas iniciadas, demos feitas, taxa de fechamento, e a objeção mais repetida
  (anote textualmente).
- **Riscos:** aceitar desconto (não aceite nos 10 primeiros, o preço é o teste); aceitar
  customização (não aceite); vender para quem não tem volume de mensagem (vai churnar por falta de
  uso, não por insatisfação).

### Semana 7: fechar o loop de valor
- **Objetivo:** o cliente perceber valor sem abrir o painel.
- **Tarefas:** resumo semanal por WhatsApp ("essa semana a IA atendeu X conversas, Y pessoas
  querem marcar, você assumiu Z"); ligar para cada um dos 4 e ouvir; corrigir os prompts com base
  no que a IA errou de verdade.
- **Entregável:** resumo semanal automático rodando.
- **Métrica:** quantos dos 4 conseguem dizer, sem consultar, o que o produto fez por eles.

### Semana 8: usar os 4 para conseguir 6
- **Objetivo:** 10 pagantes.
- **Tarefas:** pedir indicação explícita aos 4 (dono de clínica conhece dono de clínica); publicar
  os números reais deles, com autorização; repetir o ciclo de venda com os 16 restantes da lista.
- **Entregável:** 10 clientes, cerca de R$ 2.970 de MRR.
- **Métrica:** clientes ativos, e quantos veio de indicação.

**O que não fazer nessas 8 semanas:** anúncio pago, Kanban, dashboard, agenda, campanha, base de
conhecimento, cadastro self-service, cobrança automatizada, programa de parceiros, troca para API
Oficial.

---

## 15. Métricas

**Acompanhe só estas cinco agora:**

1. **Clientes pagantes e MRR.** É o único número que diz se o negócio existe.
2. **Tempo até o primeiro valor**, medido como horas entre criar a conta e a IA responder a
   primeira mensagem real de um cliente final. É a métrica de ativação, e é a que você tem poder de
   melhorar.
3. **Conversas atendidas sem intervenção humana, por cliente, por semana.** É simultaneamente
   qualidade do produto, prova de valor e previsor de churn. Se cai, o cliente vai cancelar antes de
   avisar.
4. **Leads qualificados entregues por cliente, por semana.** É o número que você vai usar para
   vender e para renovar.
5. **Churn mensal e o motivo textual de cada cancelamento.** Com 10 clientes, a taxa não tem
   significado estatístico; a frase que o cliente disse tem.

**Não acompanhe agora, e por que:** CAC (você não gasta em aquisição, o custo é sua hora), LTV
(precisa de churn estável, que você não tem), NRR (não há expansão sem plano superior), NPS (com 10
clientes, ligue em vez de medir), payback e ARR (derivados que não mudam nenhuma decisão sua).

**Benchmarks, com honestidade:** **[DADO]** não existe benchmark de churn, CAC ou LTV de SaaS
brasileiro com amostra e metodologia publicadas. A referência mais citada declara ser compilação de
estimativas de terceiros sem amostra e sem ano. O único com amostra real é internacional: ChartMogul,
2.100+ empresas, dados de 2022, faixa de ARPA abaixo de US$ 10/mês com retenção anual de 63,1% no
**quartil superior**, ou seja cerca de 3,7% de churn mensal para quem está entre os melhores.
https://chartmogul.com/reports/saas-retention-report/
**[INFERÊNCIA]** para o seu segmento, 3% a 5% de churn mensal é o resultado esperado se você
executar bem, e cerca de 0,57 ponto disso é involuntário (empresa fechando). Não se assuste com
churn de 4%. Assuste-se com 10%.

---

## 16. Vantagem competitiva defensável

**Seja franco consigo: hoje você não tem nenhuma.** Tudo que o DeskCRM faz pode ser reproduzido
por qualquer pessoa com R$ 297/mês de white label ou um curso de n8n de R$ 97. "Nossa IA é melhor"
não é vantagem: todos usam os mesmos modelos, e o seu está atrás de um prompt que um concorrente
pode adivinhar em 10 minutos de conversa com o seu agente.

**O que pode se tornar defensável, em ordem de viabilidade:**

1. **A biblioteca de prompts por nicho, testada contra conversas reais.** [INFERÊNCIA] Isso
   compõe: cada cliente de clínica que erra algo melhora o preset de todas as clínicas seguintes.
   É invisível para o concorrente (ele vê a interface, não o prompt nem o histórico de correções) e
   não é copiável por engenharia reversa, porque o ativo é o **registro de erros corrigidos**, não o
   texto final. Sua arquitetura (`agent_config` mais `buildPersona`) já é exatamente a máquina para
   acumular isso. **Esta é a sua melhor aposta.**
2. **Dado de resultado que ninguém mais tem.** Se você medir, por nicho, quantas conversas geram
   pedido de agendamento, você passa a ser a única empresa do Brasil que pode dizer a um dentista
   "em 14 clínicas, a IA converte X% das conversas em pedido de horário". Isso é argumento de venda
   inimitável e vira a base para cobrar por resultado.
3. **Distribuição e confiança na região.** Real, e é o que vai te dar os 10 primeiros. Mas não
   escala, e não confunda: é vantagem de largada, não fosso.
4. **Posicionamento e marca em torno de controle e handoff.** Copiável em teoria, difícil na
   prática: quem já vende "IA 100% autônoma" e tem base presa em contrato anual tem custo alto para
   mudar de discurso.

**O que não é vantagem, apesar de parecer:** o produto ser bonito, o código ser limpo, o Next 16,
a arquitetura multi-tenant, o construtor guiado (o BotConversa e cinco outros já têm equivalente),
e o fato de você ter montado tudo sozinho.

---

## 17. Pontos cegos

**Onde você está pensando como desenvolvedor:** você construiu o construtor guiado de prompt, com
compilador, validação, preview ao vivo, few-shot e 22 testes de fumaça, **antes de existir um único
cliente pagante que precisasse dele**. Foi um trabalho tecnicamente excelente e estrategicamente
prematuro: para 10 clientes, você configura o prompt à mão em 15 minutos por cliente e aprende mais.
O construtor era necessário para 100 clientes. Você tem zero.

**A funcionalidade que você superestima:** pipeline Kanban. Você imagina que "a IA alimentando o
CRM automaticamente" é vantagem competitiva. Não é: é bonito de construir, sete concorrentes já
têm, e o seu comprador não gerencia colunas. O valor real que você atribui ao Kanban é entregue por
uma lista de nomes com um resumo em cada.

**A funcionalidade que você subestima:** a notificação no WhatsApp do dono, e o resumo semanal.
Você trata isso como detalhe (hoje o aviso de lead vai para um grupo e falha em silêncio se não
houver grupo configurado). É o mecanismo central de retenção do produto, porque o dono não abre
painel.

**A decisão intuitiva que provavelmente está errada:** precificar por volta de R$ 149 para ser
competitivo. Com 1 a 2 horas por dia, cliente barato é o que quebra o negócio.

**Seu maior problema é produto ou distribuição?** Nenhum dos dois em primeiro lugar. É que **o
produto não está no ar e não tem como alguém comprar**. Depois disso, distribuição. Produto é o seu
terceiro problema, e é o que você tem passado 100% do tempo resolvendo.

**Você está construindo demais antes de validar?** Sim, claramente. Você tem um produto que
funciona ponta a ponta, com multi-tenant, RLS, importação de histórico, realtime e construtor de
prompt, e não tem um único cliente pagante nem um formulário de cadastro.

**A dor é forte o suficiente para alguém pagar mensalidade?** [HIPÓTESE, é o que precisa ser
validado] Para uma clínica que perde mensagens no fim de semana, sim, e a validação é simples:
alguém paga R$ 297 sem desconto. Para um MEI de comércio com 5 conversas por dia, provavelmente
não, e esse é o cliente que vai churnar.

**Qual mercado evitar:** restaurante e delivery (Anota AI domina), advocacia (restrição da OAB à
captação), e qualquer negócio com ticket médio baixo.

**Qual público tem maior probabilidade de pagar:** serviço com hora marcada e ticket alto, onde uma
mensagem perdida é dinheiro visível: odontologia, estética, fisioterapia, veterinária, oficina
mecânica de porte médio.

**Maior risco de churn:** o dono nunca mais abrir o painel e deixar de perceber o que paga. Segundo:
número banido. Terceiro: a IA falar uma bobagem com o cliente dele.

**O que eu faria diferente se começasse hoje:** venderia três clientes na base da OBS **antes** de
escrever a primeira linha de código do CRM, operando o agente manualmente com n8n e respondendo
pelo próprio WhatsApp. Só construiria interface quando três pessoas já estivessem pagando e
reclamando de não ver as conversas.

---

## 18. Roadmap

### 30 dias, objetivo: existir comercialmente
**Construir (e nada além disto):** deploy em produção; destino de notificação configurável pela UI;
persistência de `summary`, `action` e `preferencia_horario`, com a lista "Precisa de você" mostrando
o resumo da IA; aviso no WhatsApp do dono quando surge lead qualificado; aviso de risco de conexão
no `/connect`; presets de clínica.
**Não construir:** Kanban, dashboard, agenda, campanha, base de conhecimento, cadastro
self-service, cobrança automatizada, multi-número, API Oficial.
**Vender:** 4 clínicas da região, R$ 297/mês, cobrança manual.
**Métrica:** 4 pagantes e o agente da OBS 30 dias em produção sem intervenção.

### 90 dias, objetivo: sinais de encaixe inicial
**Produto:** resumo semanal por WhatsApp; cadastro self-service; cobrança automatizada (Asaas);
correção dos presets com base em erro real; 3 nichos com preset.
**Vendas:** 10 a 15 pagantes, todos na região ou por indicação. Preço mantido, zero desconto.
**Marketing:** um conteúdo por semana com print real, sem promessa de percentual.
**Retenção:** ligação mensal com cada cliente. Com 15, isso é 15 ligações.
**Métrica de encaixe:** dois sinais concretos. Primeiro, pelo menos 8 dos 10 renovando o segundo
mês sem reclamar de preço. Segundo, pelo menos 3 indicações espontâneas. Sem esses dois, não há
encaixe, e a resposta é mudar de nicho ou de promessa, não adicionar funcionalidade.

### 6 meses, objetivo: previsibilidade
**Produto:** API Oficial como caminho alternativo; alerta de lead parado (sem disparo automático);
plano superior de R$ 597 se houver demanda paga.
**Aquisição:** conteúdo como canal principal; primeiros parceiros contadores com 20% recorrente.
**Pricing:** revisar com base em churn e objeção real. Se ninguém reclamou do preço, suba.
**Processo:** onboarding autônomo, para o cliente configurar sozinho com o preset.
**Meta:** 30 a 40 clientes, cerca de R$ 10.000 de MRR, churn abaixo de 5% ao mês.

### 12 meses, objetivo: escalar
Segunda vertical; dado agregado por nicho virando argumento de venda ("em 30 clínicas, X%");
teste de cobrança híbrida por resultado; primeira contratação, que deve ser **suporte e
onboarding**, não desenvolvimento; parceiros como canal formalizado; API Oficial como padrão para
quem entra.
**Meta:** 80 a 120 clientes, cerca de R$ 25.000 a 35.000 de MRR.

---

## 19. Decisão final, item por item

1. **Posicionamento:** atendente de IA para WhatsApp com supervisão humana. Não CRM.
2. **Público inicial:** clínicas e consultórios (odontologia e estética) da sua região, com hora
   marcada e ticket alto.
3. **Regional, nacional ou híbrido:** venda só regional até 10 clientes; conteúdo nacional desde o
   dia 1 a custo zero.
4. **Vertical ou horizontal:** produto horizontal, go-to-market vertical, um nicho por vez, com
   presets de prompt por nicho (sua arquitetura já suporta).
5. **Modelo de negócio:** SaaS com venda consultiva 1:1 e onboarding assistido nos 10 primeiros.
   Sem trial self-service, sem freemium, sem SaaS mais serviço.
6. **Pricing:** plano único de R$ 297/mês, mensal, conversas ilimitadas, 1 número, sem setup, sem
   fidelidade. Número extra R$ 149. Plano de R$ 597 só quando alguém pagar por ele.
7. **Os 5 recursos mais importantes depois do MVP:** (a) persistir a qualificação da IA;
   (b) notificação no WhatsApp do dono; (c) resumo semanal de valor; (d) presets de prompt por
   nicho; (e) cadastro e cobrança self-service.
8. **Os 3 dos próximos 30 dias:** deploy em produção; persistência da qualificação com a lista
   "Precisa de você"; notificação no WhatsApp do dono (incluindo configurar o destino pela UI).
9. **O que NÃO desenvolver agora:** pipeline Kanban. E junto dele: dashboard, agenda própria,
   campanhas, automações com construtor visual, multi-WhatsApp, gestão de equipe.
10. **Maior diferencial potencial:** a biblioteca de prompts por nicho testada contra conversas
    reais, mais o dado de resultado por nicho. Não é a IA.
11. **Maior risco estratégico:** a camada de conexão. Você opera fora do sistema de contabilização
    da Meta, em violação declarada de estado, num modelo que a Meta pode apertar quando quiser, e
    com o relógio de **01/10/2026** encerrando a gratuidade do atendimento na alternativa oficial.
    Somado à compressão de preço pelo white label a R$ 297 com clientes ilimitados. (Correção em
    relação à minha primeira leitura: o Meta Business Agent **não** é o piso em R$ 0, ele é cobrado
    por token desde 01/08/2026, cerca de R$ 0,22 a 0,28 por mensagem.)
12. **Maior oportunidade:** o gap entre 44% de PMEs que experimentaram IA e 15% que a usam de
    verdade, atacado com a única mensagem que ninguém usa (controle e handoff) num nicho que
    ninguém possui.
13. **Caminho mais rápido para os 10 primeiros:** a base de clientes que a OBS já atende, com venda
    presencial e configuração do agente feita na frente do dono em 15 minutos.
14. **Vender como qual categoria:** atendente de IA com supervisão humana. Explicitamente **não**
    como CRM, e o nome atual precisa mudar por isso.
15. **Promessa central:** "A IA atende seu WhatsApp na hora, você vê tudo que ela falou, e assume
    com um toque quando o cliente é importante."

---

## 20. Resumo executivo

### 5 decisões estratégicas mais importantes
1. Parar de desenvolver funcionalidade e subir o produto em produção nesta semana.
2. Abandonar o posicionamento de CRM, adotar atendente de IA com supervisão humana, e trocar o nome.
3. Escolher um nicho (clínicas) e vender presencialmente na região, usando a base da OBS.
4. Precificar em R$ 297 com plano único, sem setup e sem fidelidade, e não dar desconto nos 10
   primeiros.
5. Transformar a qualificação que a IA já produz em dado persistido e em prova de valor entregue
   no WhatsApp do dono.

### 5 prioridades dos próximos 90 dias
1. Deploy, cadastro e cobrança.
2. Persistir a qualificação e notificar o dono.
3. Resumo semanal de valor.
4. 10 a 15 clientes pagantes a R$ 297.
5. Presets de prompt para três nichos.

### 3 maiores oportunidades
1. O gap 44% versus 15% de operacionalização de IA em PMEs.
2. Cinco posicionamentos vazios, todos derivados das reclamações que ninguém transformou em
   promessa: controle da IA, handoff, sem armadilha contratual, vertical fora de restaurante, preço
   por resultado.
3. Clínicas e serviços com hora marcada, onde o resultado é contável e o lead vale caro.

### 3 maiores riscos
1. **A camada de conexão.** Violação de estado declarada pela Meta, banimento documentado (inclusive
   sem envio), sem taxa base conhecida, e com o fornecedor da Evolution API não assumindo o risco.
2. **O relógio de 01/10/2026.** A Meta encerra a gratuidade de mensagens de serviço na API Oficial.
   Isso torna a rota de saída do QR paga (estimativa de cerca de R$ 175/mês para 5.000 respostas) e
   precisa estar na sua planilha e no seu contrato antes de você vender ilimitado.
3. **Churn por valor invisível:** o dono nunca abre o painel e deixa de perceber o que paga.
   (Compressão de preço pelo white label a R$ 297 ilimitado é o quarto, e o Meta Business Agent
   deixou de ser o piso em R$ 0 depois da correção de 01/08/2026.)

### Matriz impacto versus esforço

**Alto impacto, baixo esforço (fazer agora):** deploy; persistir a qualificação; notificar o dono
no WhatsApp; resumo semanal; presets por nicho; aviso de risco no onboarding; trocar o nome.

**Alto impacto, alto esforço (planejar):** cadastro e cobrança self-service; API Oficial como
alternativa; agenda via Google Calendar.

**Baixo impacto, baixo esforço (só se sobrar tempo):** base de conhecimento por upload; edição de
contato; não-lidas.

**Baixo impacto, alto esforço (não fazer):** pipeline Kanban; dashboard; agenda própria; campanhas;
automações com construtor visual; multi-WhatsApp; gestão de equipe; white label.

### Funcionalidades que NÃO devem ser desenvolvidas agora
Pipeline Kanban, dashboard com métricas, agenda própria, campanhas e disparos, automações com
construtor visual, multi-WhatsApp, gestão de equipe e permissões, base de conhecimento por upload,
programa de parceiros, white label, follow-up automático ativo (enquanto estiver em QR).

### Funcionalidades que devem ser desenvolvidas primeiro
Deploy em produção; destino de notificação configurável; persistência de `summary`, `action` e
`preferencia_horario`; lista "Precisa de você" com o resumo da IA; notificação no WhatsApp do dono;
resumo semanal por WhatsApp; presets de prompt por nicho; aviso de risco de conexão; cadastro e
cobrança self-service (depois dos 10 primeiros).

---

## 21. Conclusão: o que eu faria nos próximos 90 dias

Se fosse meu negócio, com MVP funcional, zero clientes pagantes, duas pessoas e 1 a 2 horas por
dia, eu faria exatamente isto, nesta ordem:

**Dias 1 a 3.** Deploy. Não refatoro nada, não conserto nada de estética. Coloco no ar como está,
com domínio próprio, e ponho o WhatsApp da própria OBS rodando em produção. Enquanto está em
localhost, nada mais importa.

**Dias 4 a 7.** Troco o nome. Custa horas agora e custaria a base inteira depois. E escrevo a
página única com a promessa, os três pilares e o preço de R$ 297.

**Dias 8 a 14.** Fecho o furo do lead perdido em silêncio (destino de notificação pela UI, e tirar
o resíduo hardcoded do `Rotas` no n8n) e escrevo o aviso de risco de conexão. Não quero vender e
descobrir na terceira semana que um lead qualificado do cliente evaporou.

**Dias 15 a 21.** Persisto `summary`, `action` e `preferencia_horario`, mostro na lista "Precisa de
você" e faço o aviso chegar no WhatsApp do dono. É a única coisa nesse período que constrói
diferenciação, e é barata porque o dado já existe.

**Dias 22 a 30.** Paro de programar. Gravo o vídeo de 90 segundos com uma conversa real, monto a
lista de 20 clínicas e começo a marcar. Nesse dia o produto está pronto o suficiente, e vai
continuar pronto o suficiente por três meses.

**Dias 31 a 60.** Vendo. Dez conversas por semana, presenciais, configurando o agente na frente do
dono em 15 minutos. Preço cheio, sem desconto, sem customização. Meta de 4 clientes. Anoto
textualmente cada objeção. Se a objeção repetida for preço, eu não baixo o preço: eu troco o nicho,
porque preço é o teste de que escolhi o cliente errado.

**Dias 61 a 75.** Resumo semanal por WhatsApp, e ligo para cada cliente. Corrijo os prompts com
base no que a IA errou de verdade, não no que eu imagino que ela erraria.

**Dias 76 a 90.** Peço indicação aos 4, publico os números reais deles com autorização, e fecho os
6 restantes. Chego em 10 pagantes e cerca de R$ 2.970 de MRR.

**No dia 90, a pergunta que decide tudo não é quanto MRR eu tenho.** É: **oito dos dez renovaram o
segundo mês sem reclamar de preço, e pelo menos três indicaram alguém sem eu pedir?** Se sim, existe
encaixe e o certo é repetir e automatizar o que hoje é manual. Se não, o problema não é
funcionalidade faltando, é nicho errado ou promessa errada, e adicionar Kanban não vai salvar.

**E o que eu não faria em nenhum dos 90 dias:** nenhuma linha de Kanban, dashboard, agenda,
campanha ou construtor de automação. Nenhum anúncio pago. Nenhum parceiro. Nenhum desconto. Nenhuma
customização para cliente específico. E nenhuma migração para API Oficial antes de ter dez pessoas
pagando.

---

## Apêndice: lacunas de pesquisa declaradas

Não encontrado em fontes públicas, ou não verificado nesta rodada:
- Preços de ZapResponder, ZapIA CRM, Responza, Digisac, Octadesk, Zenvia (produto), Weni,
  GigaWhats, WaSeller, Respond.io, WATI, Trengo, Interakt.
- Expectativa de tempo de resposta do consumidor brasileiro no WhatsApp em fonte primária. Os
  números que circulam (63% esperam 5 minutos, 82% esperam 10 minutos) só aparecem em blog de
  fornecedor, sem amostra e sem data de campo. Não usar.
- Número oficial da Meta de empresas usando WhatsApp Business ou a Business API.
- Rate card por mensagem da Cloud API para o Brasil (fica atrás de calculadora interativa).
- Qualquer benchmark de churn, CAC, payback ou LTV/CAC de SaaS brasileiro com amostra e
  metodologia publicadas.
- Atualização 2024 a 2026 da série Sebrae Sobrevivência das Empresas.
- Confirmação em página oficial da Meta da data de lançamento no Brasil e da gratuidade do Meta
  Business Agent para PMEs.
- Taxa base confiável de banimento de números em conexão não oficial. Não existe estudo
  independente; os três números disponíveis divergem por fator de ~34x e são todos auto-reportados
  por vendedores da alternativa.
