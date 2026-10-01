# Plano: tela de Clientes

Escrito e **aprovado pelo dono em 30/09/2026**. É o item 3 do P0 do plano vigente
(`docs/proximos-passos.md`), marcado "antes do beta". Contexto de produto nas seções "Tela de
Clientes" e "Cadastro do contato, além do WhatsApp" do mesmo arquivo.

Desenho: `Desktop/ATUAL DESING/Design reference screens/Clientes.dc.html` (só leitura).
Briefing: `Desktop/briefing-clientes-claude-design/LEIA-PRIMEIRO.md`.

## Decisões do dono (30/09/2026, não reabrir)

1. **D1 = B**: colunas `email` e `birth_date` em `dados_cliente` agora; CPF fica para depois. O
   medidor de cadastro é de 3 (Nome, Nascimento, E-mail).
2. **D2 = hoje**: "Em conversa" é mensagem no dia civil de hoje (America/Sao_Paulo), igual ao "Hoje"
   do inbox.
3. **D3 = 60 dias fixo** no beta; configurável quando um testador pedir.
4. **D4 = A**: Clientes entre Conversas e Pipeline; no celular, em "Mais".
5. **D5**: dono e atendente veem; conta bloqueada vê em leitura.
6. O tenant de teste é a OBS, que no banco se chama **OBM** (são o mesmo). O dono limpou as
   conversas e os contatos dele em 29/09/2026.
7. **D6 (fatia B, 30/09/2026) = criar a conversa vazia no cadastro**: a rota de criação também cria a
   linha de `conversations`, para tags e notas funcionarem desde o primeiro minuto.
8. **D7 REVISTA EM 01/10/2026: a primeira mensagem PAUSA a IA, como todo envio manual.** A versão de
   30/09 dizia o contrário, e exigiria mexer no n8n ("CRM Envio Manual" pausa sempre). O dono:
   "entrei em contato, deixa a pessoa mandar msg, e a IA começa pausada e depois ele tem que ativar
   manual". Quem escreveu assumiu; religar é na chave da conversa. O diálogo diz isso antes de enviar.
   Ideia do dono para depois (não construir agora): passar à IA uma orientação de prospecção e ELA
   iniciar a conversa.

## O problema

O produto tem **conversas**, não **clientes**. `dados_cliente` já guarda todo mundo que escreveu,
mas nenhuma tela lista isso: quem falou há seis meses só aparece rolando o inbox, e quem nunca
escreveu não existe.

## O que o desenho decidiu (e o plano segue)

- **Lista e ficha lado a lado** (lista à esquerda, ficha à direita), como o inbox. Motivo do desenho:
  a maioria dos contatos tem pouco dado, então a ficha é curta e cabe ao lado sem esconder a lista.
- **Lista** com busca, filtros em chip (Todos, Em conversa, Sem contato há N+ dias, Nunca escreveram,
  Cadastro incompleto) e colunas Cliente, Último contato, Tags e Cadastro (medidor de 4 traços).
- **Ficha**: cabeçalho (avatar, nome, telefone, ação de conversa), Tags, Entendimento (o que a IA
  entendeu), Notas, Dados (Nome, CPF, Nascimento, E-mail, campos personalizados) e rodapé
  "Cliente desde X · N mensagens".
- **Convite a completar sem cobrar**: "2 de 4 preenchidos" no bloco Dados e o medidor na lista. Nada
  de faixa, modal ou cor de aviso.
- Estados vazios desenhados: conta vazia, busca sem resultado, filtro sem resultado, nenhum
  selecionado.

## O que já existe e vai ser reusado

| Peça | Onde | Papel |
|---|---|---|
| `dados_cliente` (`display_name`, `custom_fields`, grant de UPDATE por coluna) | banco | fonte da lista e da ficha |
| `conversations` (única por `client_id, phone`) | banco | último contato, quem atende, id para tags e notas |
| `ContextPanel` + `ContactFields`, `ContactNotes`, `ContactTags` | `components/` | viram a ficha única (fatia A) |
| `cleanName`, `avatarPair`, `initials` | `lib/inbox.ts` | nome e avatar, nunca "Você" |
| `semNumeroDeAvisos` | `lib/avisos.ts` | o número de avisos nunca aparece na lista |
| `quemAtende` | `lib/crm.ts` | "IA respondendo" / "Você está atendendo" |
| `AreaRolavel` | `components/ui/dissolver-rolagem.tsx` | a lista dissolve nas bordas |

## Dois fatos do banco que moldam o plano

1. **Tags e notas são da CONVERSA, não do contato** (`conversation_tags.conversation_id`,
   `conversation_notes.conversation_id`). Contato com conversa: funciona igual ao painel de hoje.
   Contato criado à mão (fatia B) não tem conversa até a primeira mensagem; a fatia B resolve isso
   (ver lá).
2. **Não existem colunas de CPF, nascimento e e-mail.** O desenho as mostra. É a decisão D1 abaixo.

## Fatia A: lista com busca e ficha única (✅ feita em 30/09/2026)

**O que saiu diferente do texto abaixo, de propósito:**
- Os dois números ("Cliente desde", "Mensagens") ficam no TOPO nas duas superfícies, e o rodapé do
  desenho não voltou: é a regra do `FichaContato` (o mesmo número duas vezes na coluna). A prop
  `superficie` acrescenta só "Abrir conversa", o Entendimento e o texto do vazio de Notas (na tela de
  Clientes não existe caixa de escrita).
- Nascimento e E-mail entraram no bloco Dados das DUAS superfícies (é um formulário só), com
  "N de 3 preenchidos" no cabeçalho do bloco. Data impossível e e-mail sem arroba ficam na tela com
  o motivo e não vão ao banco.
- Migração `mt_dados_cliente_email_nascimento`: colunas `email` e `birth_date` com grant de UPDATE.
- ⚠️ Achado sem decisão: `authenticated` tem INSERT, DELETE e TRUNCATE em nível de TABELA em
  `dados_cliente` (só UPDATE foi apertado por coluna). A RLS segura INSERT e DELETE, TRUNCATE não
  passa pela API; mesmo assim é permissão que ninguém usa.


**Entrega:** rota `/clientes` (lista) e `/clientes/[id]` (lista mais ficha aberta, o id é o de
`dados_cliente`), no mesmo molde do `/inbox` e `/inbox/[id]`, para o link funcionar e o voltar do
navegador também.

- **Ficha única `components/FichaContato.tsx`**, extraída do `ContextPanel`. O painel do contato na
  conversa passa a ser `<FichaContato superficie="conversa" />` e a tela de Clientes
  `<FichaContato superficie="clientes" />`. **A diferença entre as duas é essa prop e mais nada**:
  - `clientes` mostra a ação de conversa no cabeçalho ("Abrir conversa" leva a `/inbox/[id]`), o
    bloco Entendimento e o rodapé com os números;
  - `conversa` mantém o que tem hoje (os dois números no topo, sem Entendimento, que já é a faixa
    "O cliente quer").
  Os blocos Tags, Notas e Dados são os MESMOS componentes nas duas.
- **Lista**: o servidor carrega os contatos do tenant (`dados_cliente` + `conversations` pelo
  telefone, RLS da sessão), tira o número de avisos e ordena por último contato. Busca e filtros
  rodam **no navegador**, sobre a lista inteira: o volume de um negócio pequeno é de dezenas a poucas
  centenas, e buscar em campo personalizado (jsonb) no banco não compensa agora. Teto de carga de
  2.000 contatos, com o aviso de que a lista foi cortada se passar (não esconder em silêncio).
- **Busca**: nome (`display_name`, senão `nomewpp` limpo), telefone por dígitos (tolerando o nono
  dígito, `chaveTelefone`), tags e valores dos campos personalizados. Sem acento e sem caixa.
- **Filtros da fatia A**: Todos, Em conversa, Cadastro incompleto. "Sem contato há N+ dias" entra na
  fatia C, "Nunca escreveram" na B.
- **Menu e celular**: conforme D4.
- **Celular**: a lista ocupa a tela; tocar abre a ficha em tela cheia com "voltar", igual à conversa.
- **Realtime**: não nesta fatia. A lista re-busca ao voltar o foco (mesma regra das outras telas).
  Se o dono quiser a lista ao vivo, entra depois.

**Testes da fatia A:**
- `sem-login`: preview `/design/clientes` com dado falso (lista longa, conta nova, conta vazia, busca
  vazia, contato completo e só com telefone), texto sem travessão e sem vocabulário de segmento,
  rolagem que dissolve (entra no `rolagem.design.spec.ts`), 375 e 1440.
- `logado`: a conversa semente (`5500000000001`) aparece na lista, a busca por telefone acha, editar
  o nome na ficha dos Clientes aparece no painel da conversa (prova de que é um formulário só), e o
  número de avisos não aparece.
- Depois de rodar, apagar a semente pelo SQL do topo de `e2e/semente.ts`.

## Fatia B: criar contato e iniciar conversa (✅ código em 01/10/2026; falta a prova com banco)

**Como ficou:**
- `POST /api/contacts` (service_role): telefone obrigatório (`telefoneDoCadastro`, só Brasil, 55
  automático), nome, nascimento e e-mail opcionais. **O telefone gravado é o do WhatsApp**
  (`numeroNoWhatsApp`, `/chat/whatsappNumbers` da Evolution): número antigo chega sem o nono
  dígito, e o n8n acha o contato pelo `remoteJid` exato; gravar a grafia digitada faria a resposta
  nascer como outro contato. Número sem WhatsApp é recusado (422). Já cadastrado (qualquer grafia,
  `grafiasDoTelefone`) devolve o existente e a tela abre a ficha. O número de avisos é recusado.
- Conversa vazia nasce junto (D6) e **não aparece em Conversas nem no Pipeline** até a primeira
  mensagem (`buildInbox` tira `last_message_at` nulo; as consultas ordenam com `nullsFirst: false`
  para a conversa vazia não ocupar o teto de 500).
- Filtro "Nunca escreveram" (sem mensagem nenhuma) e, na ficha, "Enviar primeira mensagem" no lugar
  de "Abrir conversa". O aceite é conferido no `POST /api/send` também (409 sem ele quando a conversa
  não tem mensagem nenhuma), porque a caixa da conversa alcança o contato pela URL.
- Conta bloqueada não vê "Novo cliente" nem "Enviar primeira mensagem" (e as rotas respondem 402).

- **"Novo cliente"**: só o telefone é obrigatório (máscara +55). Cria a linha em `dados_cliente` por
  **rota service_role** (`POST /api/contacts`): o browser não tem INSERT na tabela, e é assim que
  deve continuar (o `ContextPanel` já registra isso). Telefone que já existe abre a ficha existente
  em vez de duplicar. "Cadastrar não envia nada."
- **Iniciar conversa, com os dois pesos do desenho**:
  - quem **já conversou**: botão "Abrir conversa"/"Iniciar conversa", sem fricção, leva ao inbox;
  - quem **nunca escreveu**: "Enviar primeira mensagem" abre o diálogo com o aviso de bloqueio, a
    caixa "Esta pessoa sabe que eu vou escrever" obrigatória e "Enviar mesmo assim". Envio pelo mesmo
    caminho do envio manual (`POST /api/send`), **um por vez**, sem seleção múltipla em lugar nenhum.
- **Tags e notas de quem não tem conversa**: a rota de criação também cria a linha de
  `conversations` (vazia), para tags e notas terem onde morar desde o cadastro. A alternativa é
  esconder os dois blocos até a primeira mensagem. ✅ Decidido: criar a conversa vazia (D6).
- **Pendência herdada, resolvida**: o envio manual PAUSA a IA ("um humano assumiu"), e o briefing diz
  "a IA assume a partir da segunda mensagem". ✅ Decidido (D7): a primeira mensagem para quem nunca
  falou NÃO pausa a IA. Só esse envio; o resto do envio manual segue pausando.
- Testes: criar contato com telefone impossível (DDD 00), diálogo exige o aceite; o envio real NÃO é
  exercido (seria WhatsApp de verdade), só a rota recusando sem aceite.

## Fatia C: contato frio (✅ feita em 30/09/2026)

Regra em `lib/clientes.ts`: `LIMIAR_FRIO_DIAS = 60`, `estadoContato` (`nunca`/`conversa`/`normal`/`frio`)
e `diasSemContato`, em dias civis de America/Sao_Paulo. "Nunca escreveu" é estado próprio e nunca
entra no filtro de frio. Na lista, chip "Sem contato há 60+ dias" e a coluna com "Sem contato há X
dias" (no celular, linha própria, senão o número de dias era cortado); na ficha, "Última mensagem há
X dias" ao lado de "Abrir conversa", em tinta de apoio e nunca âmbar (ninguém espera por você).


- Filtro "Sem contato há N+ dias", coluna "Sem contato há X dias" na lista e a linha "Última mensagem
  há X dias" na ficha. Regra pura num módulo (`lib/clientes.ts`), com o dia civil de
  America/Sao_Paulo, como `lib/inbox.ts`.
- O limiar N é a decisão D3.
- Testes: a regra no módulo puro (limiar, fuso, sem mensagem nunca é frio, é "nunca escreveu") e o
  filtro no preview.

## Decisões do dono

**D1. CPF, nascimento e e-mail (bloqueia a fatia A como desenhada).** Não existem colunas, e o próprio
roadmap diz "decidir de propósito antes de coletar" por causa da LGPD.
- **A. Três colunas novas agora** (`cpf`, `birth_date`, `email` em `dados_cliente`, grant de UPDATE
  para o browser), com o medidor de 4 como no desenho. Pede uma frase de finalidade na ficha e entra
  no item de LGPD (exportar e apagar) do P2.
- **B. Só e-mail e nascimento agora**, CPF depois (CPF é o dado que mais pesa e o que menos serve
  sem integração). Medidor de 3.
- **C. Nenhuma coluna agora**: o bloco Dados fica com Nome e campos personalizados, e quem quiser
  guarda CPF como campo. Sem medidor; o filtro "Cadastro incompleto" sai.
- Minha recomendação: **B**. Nascimento destrava o aniversário que já está decidido, e-mail é baixo
  risco, e o CPF espera um motivo concreto.

**D2. O que é "Em conversa agora".** O desenho não define. Opções: (a) mensagem nas últimas 24h (a
janela do WhatsApp), (b) mensagem hoje (dia civil, igual ao "Hoje" do inbox), (c) pedido de ajuda
aberto ou pessoa atendendo. Recomendação: **(b)**, porque casa com o que a lista de conversas mostra
em "Hoje".

**D3. Limiar do contato frio (fatia C).**
- **30 dias**: pega cedo, mas marca como frio quem compra todo mês (barbeiro, ótica de retorno).
- **60 dias** (o do desenho): meio-termo, cobre ciclo mensal com folga.
- **90 dias**: só quem sumiu de verdade; num beta de 30 dias ninguém chega lá, e o filtro nasce vazio.
- **Configurável por empresa**, com padrão 60: cada segmento tem seu ciclo (pediatra semestral,
  barbeiro quinzenal). Custa uma coluna e um campo no `/agente` ou na própria tela.
- Recomendação: **60 fixo no beta**, configurável quando um testador pedir.

**D4. Onde entra no menu.**
- **A. Entre Conversas e Pipeline** (Painel, Pedidos, Conversas, Clientes, Pipeline, Agente,
  Equipe), que é a posição do desenho. No celular vai para "Mais" (a barra já está cheia com
  Painel, Pedidos, Conversas).
- **B. Depois do Pipeline** (Painel, Pedidos, Conversas, Pipeline, Clientes, ...). Mesma coisa no
  celular.
- **C. Posição A no computador e na barra do celular no lugar de Pedidos**, que desce para "Mais".
  Não recomendo: Pedidos é o destino do aviso.
- Recomendação: **A**, celular em "Mais".

**D5. Quem vê.** Recomendação: dono e atendente (é trabalho do dia a dia, como Conversas). Conta
bloqueada vê em leitura, como o inbox.
