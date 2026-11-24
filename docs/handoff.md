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
| Antes de mexer em **leitura de dado, estado, cache, URL, realtime na tela ou desempenho** | `docs/plano-dados-e-estado.md`. **Roteiro único de dados, estado e desempenho** (decisões fechadas pelo dono em 11/11/2026; revisão externa feita em 11/11/2026; passo 0 entregue em 13/11/2026, próximo é o passo 1). O orçamento de desempenho (seção 3) é critério de aceite de toda entrega. |
| Planos executados e relatórios avulsos | `docs/arquivo/` (o `README.md` de lá diz o que foi arquivado e por quê). |
| Perguntas de **mercado, concorrente, preço, risco de banimento** | `docs/estrategia-2026-07.md`. É base de pesquisa; as conclusões prescritivas antigas estão superadas, e o banner no topo diz o que vale. |
| Antes de mexer em **cor, tipografia, espaçamento, componente base** | `docs/design-system/` (8 arquivos). O código tem os valores; esses arquivos têm o porquê. |
| Para **ler o uso de cada empresa e o que os usuários escreveram** | `docs/instrumentacao-uso.md`. Cinco consultas SQL. Não existe tela, e isso é decisão. |
| Para **escrever no Next 16** | `node_modules/next/dist/docs/`. Esta versão tem mudanças que quebram o que você aprendeu; `AGENTS.md` avisa. |

A antiga `Desktop/DesingSystem/` (obsoleta) foi para a Lixeira em 26/09/2026. O design system vale pelo `docs/design-system/`.

## 2. O que é o produto, em cinco linhas

CRM de WhatsApp com um agente de IA que atende, qualifica e passa para o humano quando precisa,
para pequenos negócios locais. **Horizontal de propósito**: advogado, pediatra, barbeiro,
engenheiro, clínica, comércio. Multi-tenant sobre Supabase com RLS. A Evolution API conecta o
WhatsApp por QR, o n8n é só o cano, e o cérebro é `POST /api/agent` neste repositório.

É um produto **pago**: toda empresa nova tem **teste de 7 dias** e depois escolhe um plano
(Essencial, Profissional ou Avançado; preços e limites em `PLANS`, `lib/billing.ts`). **Vitalício**
(acesso total, nunca cobrado) vale para as contas internas do dono e casos especiais. A cobrança passa
pelo **Asaas** (`lib/asaas.ts`; qualquer `ASAAS_ENV` diferente de `producao` é sandbox), e teste
vencido bloqueia a conta (modo somente leitura), salvo Vitalício. Desde 15/10/2026 não existe chave
global de acesso livre.

## 3. Estado em 27/09/2026

### 24/11/2026: TRAVA DE ROBÔ CONSERTADA E NO AR (pedido do dono)
- A origem de campanha falhava em todo turno desde 07/11 (embed ambíguo), então a trava nunca rodou e o Tony nunca viu a seção ORIGEM. Consertado, com a janela da primeira resposta (opção B), silêncio para robô e o aviso "Lead da campanha respondeu". Tudo em docs/adr/2026-11-24-campaign-origin-embed-and-first-reply-window.md.
- Provado: 19 casos reais e os sintéticos em `e2e/resposta-automatica.design.spec.ts`, a consulta real em `e2e/campanhas-origem.auth.spec.ts`. Ensaio do Tony com ORIGEM no cofre do dono, junto do diagnóstico (`ensaio-origem-2026-11-24.md`).
- Duas falhas fora desta mudança na verificação (01h30 a 02h): `central-clientes-ajustes.design` "os chips mandam nos picos" falha também em `main` (parece depender da hora: o "Dia" de madrugada); `atendimento.serial` jornada 1 (cérebro real, telefone que não é lead) deu `pausar` em vez de `none` 3 vezes no branch e depois passou 2 de 2, contra 3 de 3 em `main`; para quem não é lead a origem é nula e o caminho do turno não mudou.
- No ar no mesmo dia, com a coluna `agent_turns.origem_erro` (migração aplicada às 12h40 por escolha do dono) e dois cenários de campanha no `test:e2e:n8n`. Falta o dono testar como lead de verdade (o aviso "Lead da campanha respondeu" só sai para telefone real).

### 23/10/2026: MONTAGEM MAIS CLARA, SEM COMMIT, ESPERANDO O DONO REVISAR

- Brief do dono (vault, `projetos/atenda.md`, secao "Montagem mais clara"). A tela "Guia" (`/guia`) construida antes no mesmo dia foi desfeita a pedido dele, sem commit. Detalhe em `docs/adr/2026-10-23-montagem-clear-from-start-to-end.md`: abertura com o mapa dos passos e o computador, destaques (modelo, horario, documentos, avisos), revisao antes de ativar com painel dos campos do `/agente`, parada "Continue no computador" no celular, dica no cadastro.
- Achado: a montagem salva `hours = DEFAULT_HOURS` sem mostrar o horario, e `horarioCadastrado` trata isso como cadastrado; a revisao agora mostra "Padrao, confira". Funil em 23/10: 8 contas de testadores, 1 ativou, 5 salvaram o agente e pararam antes de ativar.
- Nada commitado nem publicado ate o dono revisar no navegador.
- Rodadas seguintes (dono, mesma entrega): montagem em 5 passos (4 so conecta, 5 "Quem a IA chama" com avisos, revisao e Ativar); horario no passo 1, sugestao ate conferir (`hoursConfirmed`, lido so por `horarioDaConfig`); a primeira ativacao recusa destino igual ao numero do agente; abertura com um icone colorido por passo. Contas salvas antes disso nao tem a marca e contam como horario conferido (as 6 contas de testadores estao com seg a sex 8h as 18h que ninguem escolheu).
- `.env.e2e.local`: o e-mail de atendente de teste virou dono da conta "testes franck novo" (criada em 23/10); o projeto `atendente` falha ate trocar.

### 17/10/2026: BASE ZERADA E CODIGO DE PAREAMENTO DESLIGADO

- Base de producao zerada a pedido do dono em 16/10: as 4 empresas de teste pelo "Apagar de vez" da central e a OBM por script (mesma rotina: arquivos, instancia da Evolution, banco, logins). O prompt avancado da OBM foi salvo fora do repo em `Desktop/Desk/projetos/backup-obm-2026-10-16/`. O dono recriou a empresa (OBS) em 17/10; `ADMIN_USER_IDS` (Vercel e `.env.local`) e as credenciais de `.env.e2e.local` precisam apontar para os logins novos, senao a central some e `test:e2e:login`/`test:e2e:n8n` quebram.
- No teste do dono como desconhecido, o codigo de pareamento falhou 5 vezes (o WhatsApp recusa o codigo da Evolution 2.3.7, upstream #2696) e o QR conectou de primeira. Codigo desligado, so QR, aviso no celular para abrir no computador: `docs/adr/2026-10-17-pairing-code-off-qr-only.md`.

### 16/10/2026 (tarde): DECISAO DO DONO: COLOCAR O SISTEMA A PROVA AGORA. LER PRIMEIRO

- Decisao: liberar o teste para 3 a 5 pessoas reais JA, sem esperar a cobranca estar provada. Motivo: o teste de 7 dias e gratis, a cobranca so pesa no dia 8; o teto de IA protege o custo; Vitalicio e a valvula se a cobranca nao estiver redonda no dia 7. O dono reconhece que tende a adiar ("nunca acho que esta bom o bastante"): ajuste de detalhe espera o retorno dos testadores; bug de atendimento continua passando na frente.
- Antes do convite (1 a 2 dias): (1) o dono faz o cadastro como DESCONHECIDO, e-mail e numero novos, ate a IA responder a primeira mensagem (caminho nunca percorrido por um estranho); (2) escolher 3 a 5 pessoas com VOLUME REAL de WhatsApp; (3) criterio de sucesso definido antes: publicou o agente em ate 2 dias, a IA respondeu conversas reais na semana, no dia 7 quer continuar (acompanhar na central /clientes).
- Em paralelo, dentro dos 7 dias do teste deles: provar a cobranca de ponta a ponta no sandbox do Asaas (teste, plano, pagamento, ativo, atraso, bloqueio, pagamento, liberacao), depois virar ASAAS_ENV=producao com o dono acompanhando a primeira cobranca real. Revisar as 4 empresas com teste vencido de 15/10 (Dra Maria Jullia, MajuTeste, Novasenhateste, testesworkfranck): Vitalicio ou bloqueadas.
- Estado conferido em 16/10: login suite verde (realtime.serial e atendente caem na rodada cheia por instabilidade do Supabase Realtime e passam sozinhos), test:e2e:n8n 11/11 apos corrigir o caso que dependia do dia da semana (ea6714b), zero envio Evolution para 5500.
- Pendentes do dono ainda abertos: testar com o chip o detalhe de Pedidos, a atualizacao do pedido aberto e o Salvar como regra.
- Depois: LGPD por contato (item 9) e Agenda com Google Calendar (item 10, precisa de plano proprio). Campanha (prospeccao do dono) a discutir.
- Proxima sessao (16/10): o dono vai usar o Claude como CONSELHEIRO de marketing, estrategia e lancamento (prompt montado nesta sessao).

### 16/10/2026 (rodada 3): MEDIDOR DE META, CABECALHO LIMPO, SEM account_type (no ar: 5072414, 01118f4)

Detalhe em `docs/adr/2026-10-16-goal-progress-meter-and-no-account-type.md` e `docs/adr/2026-10-16-account-type-removed.md`. Resumo: o medidor do limite virou barra de meta com bolinha do ritmo ideal, trecho listrado, verde/vermelho pelo ritmo e a frase da projecao (`ritmoDoMes`, `textoDoRitmo`); rotulo "X de Y tokens (Plano ...), R$ ... estimado" no canto de cima do cartao; cabecalho sem a linha Conta/Plano e sem "nunca cobrado" no Vitalicio; donut com o numero do centro que cabe (`tamanhoDoCentroDoDonut`, bilhao em `tokensCurto`).
- FIM DO BETA: nenhum codigo le ou escreve `clients.account_type`. A migration que derruba a coluna foi APLICADA em 16/10 depois do deploy de 5072414: `supabase/migrations/20261016182108_drop_clients_account_type.sql` (recria `admin_empresas_pagina` sem a coluna). Junto, `20261016182110_drop_admin_bloqueados_sem_beta.sql` (sem chamador). `lib/database.types.ts` ja reflete o banco (editado a mao).
- As consultas de `docs/instrumentacao-uso.md` e a skill `consultas-uso` pararam de filtrar por tipo (listam todas as empresas).

### 16/10/2026: SEGUNDA RODADA DA CENTRAL (no ar: 5072414)

Detalhe em `docs/adr/2026-10-16-central-picos-plan-caps-ptax-and-cards.md`. Resumo: horarios de pico na variacao A (tres numeros e dois graficos) seguindo o filtro da aba, com intervalo de datas (`lib/picos.ts`, pura, para portar ao /painel; migration JA APLICADA `20261015220551_admin_cliente_picos.sql`); LIMITE POR PLANO NO ENFORCEMENT REAL (Essencial 13 mi, Profissional 33 mi, Avancado 100 mi, sem plano 10 mi; ninguem passa a ter limite menor que antes); medidor com a barra do gasto ideal; modelo do cliente e custos em reais pela PTAX do Banco Central; cartoes com variacao, sparkline, meta e rosca.
- Falta: login (`central-clientes.auth.spec.ts` foi atualizado e nao rodou; as relacoes picos x uso foram conferidas contra o banco real por script) e o deploy.
- A metrica de conversas ficou fora das variacoes (definicao pendente com o dono).
- `mapa-de-calor.tsx` foi APAGADO na revisao de 16/10 (o dono escolheu a variacao A); tokens `--chart-rampa-tinta*` tambem.
- Revisao da rodada (16/10, apos o /code-review): o teto por plano agora limpa as marcas dos avisos na troca de plano (`alinharMarcasDoMes`, migration `20261016170702_limpar_marcas_consumo_ia.sql` JA APLICADA); "Padrao do plano" limpa o limite personalizado e o valor de outro plano abre o valor personalizado preenchido; o ritmo do limite e do mes de CADA coluna (periodo que atravessa dois meses tem um trecho por mes); selos pelo `Selo` do painel sobre `lib/delta.ts` (`IndicadorComparado`); a PTAX nao segura mais a pagina (`useCambio`, falha lembrada por 10 min); `atendimentoDoCliente` faz UMA chamada de `painel_janelas`; os dados das abas Uso/Atendimento so saem quando o dono mostra que vai abrir a aba; `MedidorDeMeta` e `DropdownMenuItemMarcado` na camada base; PTAX e donut fora de `lib/custo-ia.ts`.
- As duas migrations de drop (`account_type`, `admin_bloqueados_sem_beta`) foram RENOMEADAS para `20261016182108` e `20261016182110` (APLICADAS em 16/10 depois do deploy de 5072414).

### 15/10/2026 (noite): 15 AJUSTES DE LAYOUT DA CENTRAL (no ar: 5072414)

Detalhe e motivos em `docs/adr/2026-10-15-central-layout-adjustments.md`. Resumo: o trilho do menu rola os itens por dentro (a pagina inteira rolava abaixo do cartao em janela baixa); "Dia" do Uso de IA e hoje desde as 00h; coluna acima do ritmo em ambar; mapa de pico em faixas de 3 horas com numero; Financeiro mostra so o que vale para a situacao; "Feito" some; filtro da lista virou um botao de icone; medidor com trilha; balao da rosca por cima; botao Clientes ajustado; cabecalho com Conta e Plano; Visao geral em seis cartoes; seletor de meses passados e Todo o periodo no Uso de IA (migration JA APLICADA e aditiva: `20261015201151_admin_cliente_uso_meses.sql`); "Editar limite" na aba Acoes (valores por plano A, B, C ainda NAO existem: o dono esta definindo, o cartao ja tem o lugar); detalhe com esqueleto proprio e abas aquecidas.
- Falta: rodar login (`central-clientes.auth.spec.ts` le a Visao geral nova; ainda nao foi rodado) e conferir em producao o clique da lista (o esqueleto so e pre-buscado em producao).
- O Atendimento NAO ganhou o seletor de meses (as quatro janelas vem das funcoes do painel; um mes pediria janelas novas em quatro funcoes SQL).

### 15/10/2026 (tarde): AJUSTES DO DONO NA ENTREGA 2 (no ar: 5072414)

- Chave do beta REMOVIDA: `lib/beta.ts`, o tipo `beta_aberto` de `accessState`, `cairiaSemBeta` e o aviso da lista sairam. A variavel `BETA_ABERTO` nao faz mais nada: o dono pode apagar na Vercel. Consequencia aceita pelo dono: teste vencido vai para a tela de assinatura e o agente silencia. Em 15/10 eram 4 empresas com teste vencido (Dra Maria Jullia, MajuTeste, Novasenhateste, testesworkfranck); a OBM esta `active`. Marcar Vitalicio quem deve ficar livre ANTES do deploy.
- A funcao SQL `admin_bloqueados_sem_beta` FICOU no banco (o codigo implantado ainda chama em `/clientes`); apagar numa migration depois do deploy.
- "Estender teste" virou um controle so: 7 dias, 15 dias, Personalizado e Vitalicio (a mesma acao `vitalicio`). "Remover vitalicio" so aparece para um vitalicio.
- "Apagar de vez" MANTEM `billing_events` (registro fiscal): `TABELAS_MANTIDAS`, colunas `deleted_client_id`/`deleted_client_name`, `admin_apagar_cliente` com `p_mantidas`. Migration JA APLICADA (aditiva, compativel com o codigo implantado): `20261015191433_apagar_de_vez_mantem_billing_events.sql`.
- "Apagar de vez" APAGA a instancia da Evolution (`deleteInstance`, `DELETE /instance/delete/{instance}`, conferido na doc v2 pelo context7), depois do logout.
- Falta rodar: login (inclui `central-clientes-conta.serial`, que agora confere o `billing_events` mantido) e o `test:e2e:n8n` depois do deploy (o gate de acesso do `processTurn` mudou).

### 15/10/2026 (madrugada): CENTRAL "CLIENTES", ENTREGA 1 PUBLICADA SEM APROVACAO DE TELA

- Plano: `docs/plano-central-clientes.md` (secao Execution). Sessao arquiteto + subagente executor; o dono autorizou commit e push das duas entregas sem ver a tela, para revisar de manha.
- Entrega 1: `/clientes` e `/clientes/[id]` viraram a central do dono (so `ADMIN_USER_IDS`; quem nao e admin vai para `/contatos`); a lista de contatos mudou para `/contatos`. Abas Visao geral, Uso de IA (grafico unico com filtro de periodo e mapa de calor) e Atendimento (graficos). Recharts entrou na camada base (`components/ui/chart.tsx`, ADR 2026-10-15). Migrations JA APLICADAS: `20261014215549`, `20261014223146`, `20261015032015` (todas aditivas).
- Fechamento: /simplify e /code-review high com achados aplicados; sem-login 536, login 88 (pipeline.serial caiu na rodada cheia e passou sozinho), ia 28/28, bateria 80 + C3/M8/O7 instaveis conhecidos (passaram repetidos), build ok.
- Achados registrados SEM correcao: a aba Atendimento le o historico inteiro (janela 0 de `painel_janelas` e `painel_series` sem limite inferior); limitar exigiria uma copia da regra "quem respondeu" em SQL.
- Depois do deploy da entrega 1 (6c07bb0): `test:e2e:n8n` 11/11.
- ENTREGA 2 (Financeiro, Vitalicio, aviso do BETA_ABERTO, Acoes com exportar e apagar) FECHADA E PUBLICADA em 15/10 (sem aprovacao de tela, por decisao do dono). Migrations JA APLICADAS (aditivas): `20261015043128_central_clientes_financeiro_e_acoes.sql`, `20261015043948_admin_tabelas_fora_da_purga.sql`, `20261015111730_central_clientes_revisao_entrega2.sql`. Vitalicio = coluna `clients.vitalicio_desde` (mais `bloqueado_em`, `desativada_em`), `accessState` devolve `kind` (precedencia: desativado, bloqueado, vitalicio, beta, status). Fechamento: /simplify (18 achados aplicados, CRC do zip ficou a mao porque Node da Vercel nao esta fixado), /code-review high (1 achado aplicado: pendencias quando o apagar para depois de efeitos externos), sem-login 596, login 92 (4 do atendente cairam por timeout do dev server e passaram sozinhos, 10/10), ia 28/28, bateria 81 (C3 e R7 instaveis conhecidos, C3 passou sozinho), build ok. OBM conferido no banco depois da suite serial: nada ficou marcado. Depois do deploy (3ba01aa): `test:e2e:n8n` 11/11. Hoje 4 empresas seriam bloqueadas se o BETA_ABERTO desligar. Decisoes do dono listadas no relatorio: texto do bloqueio manual sem canal de suporte; "sem plano" em mudar plano; teto de dias para estender teste; vitalicio recusado com assinatura ativa; bloqueio manual vence vitalicio e beta; `billing_events` apagado na purga; logout (nao exclusao) da instancia Evolution por falta de helper; aba aberta de conta desativada segue lendo ate navegar (fechar exige RLS).
- PENDENTE DO DONO: aprovar as telas; decidir (1) WhatsApp na lista mostra so "Instancia criada" (banco nao guarda o estado); (2) ordem do alerta principal; (3) "sem atividade" conta turno da bancada; (4) linha de ritmo do teto no grafico de uso; (5) os cards Hoje/7 dias/Mes viraram o filtro de periodo.

### 14/10/2026 (madrugada): P1 ITENS 5 E 6 NO AR (641aab1, 68a5405). LER PRIMEIRO

- Item 5 (orientacao vira regra) e item 6 (teto mensal de IA em tokens, avisos 80/100%, `/admin` Empresas, "Clientes" vira "Contatos" na tela) publicados.
- Antes do push: sem-login 456, ia 12/12, bateria toda verde (O6 falhou na rodada cheia e deu 5/5 repetido), login completo verde (clientes.serial e realtime.serial cairam na rodada cheia e passaram sozinhos), build ok. Depois do deploy: `test:e2e:n8n` 11/11, zero envio Evolution para 5500. Contador `consumo_ia_mensal` gravando em producao.
- Incidente do Supabase Realtime ("Realtime latency", 13/10) atrapalhou a suite logada naquela tarde; voltou de madrugada.
- PENDENTE DO DONO: (1) cadastrar `ADMIN_USER_IDS=924dae85-57ff-4aed-820d-1e7c2d3377cf` na Vercel (ja esta no `.env.local`), senao `/admin` fica 404; (2) no `/admin`, subir o teto da OBM (as suites pagas rodam nela; outubro ja teve ~12 mi de tokens de teste antes do contador existir); (3) aprovar a tela do `/admin`; (4) decidir se troca os textos "Cliente desde", "Ver cliente" e "O que o cliente escreveu" (nao nomeiam a lista, ficaram); (5) testar com o chip o redesenho de Pedidos e o salvar como regra.
- PROXIMO NO PLANO: P1 item 7, Admin v1 (prospeccao e o resto do admin; a pagina `/admin` ja existe com as Empresas).

### 13/10/2026: REDESENHO DE PEDIDOS NO AR (f250af2)

Solução gravada, detalhe em seções com a fonte e pedido aberto atualizado pelo cliente estão em produção. `test:e2e:n8n` 11/11 na versão publicada, zero envio Evolution para 5500. O legado `closed_how` (coluna, check e gatilho de transição) foi apagado em `20261013151634_remove_closed_how_legado.sql`; o lint segue barrando o nome.
PRÓXIMO: P1 item 5 (orientação vira regra permanente): botão no detalhe do pedido, regra no prompt junto das regras (no avançado, seção própria no fim), texto editável antes de salvar, conta no `LIMITS.persona`, valor da regra reconhecido pelo guardrail, registro em `agent_publications`.
13/10/2026, tarde: P1 item 5 IMPLEMENTADO e revisado (no ar desde 641aab1) (ADR `docs/adr/2026-10-13-orientation-saved-as-agent-rule.md`). Regras em `clients.regras_salvas`, escrita só por `agent-rules` com troca condicional. Migrações JÁ APLICADAS no banco: `20261013154539_handoff_regra_salva_em.sql`, `20261013211408_clients_regras_salvas.sql`, `20261013211807_trocar_regras_salvas_persona_nula.sql`. Dono aprovou: seção própria no guiado, 200 caracteres, 20 regras. Falta: suítes de login (`regras-salvas.serial`, `atendente.att`) e as pagas (`ia`/`bateria` agora mandam `regrasSalvas: []`), rodadas pelo arquiteto.
13/10/2026, noite: P1 item 6 (uso de IA por empresa com teto mensal em tokens, primeira fatia do `/admin`, "Clientes" vira "Contatos" na tela) IMPLEMENTADO e revisado (no ar desde 68a5405) (plano `docs/plano-custo-ia.md`, ADR `docs/adr/2026-10-13-ai-usage-cap-in-tokens.md`). Migrações JÁ APLICADAS: `20261013225544_consumo_ia_mensal_e_admin.sql` e, na revisão do arquiteto, `20261013232131_avisos_no_consumo_e_limite_atomico.sql` (contador começa em zero, sem retroativo). O dono precisa pôr `ADMIN_USER_IDS` (o id de usuário dele) na Vercel e no `.env.local`; sem isso `/admin` é 404 para todos. Subir o teto da OBM no `/admin`: as suítes pagas contam (outubro até o dia 13 gastou ~12,4 mi de tokens, quase tudo bancada). Item 6 NÃO marcado como feito em `proximos-passos.md` (fica para o arquiteto).

### 07/10/2026: PRÓXIMO PASSO (fazer primeiro)

Tudo de 05 a 07/10 está commitado e no ar (calendário no código, motivo do pedido, tarde/manhã/noite
pelo expediente, bateria fixa `npm run test:e2e:bateria`). Próximo no plano: **P1 item 5, orientação
vira regra permanente do agente** (`docs/proximos-passos.md`): começar por um plano curto para o dono
aprovar (onde a sugestão "salvar como regra" aparece, onde a regra mora, como o dono revisa e apaga).
Pendência de qualidade, se o dono quiser antes: o caso M8 da bateria (o resumo do pedido diz que a
conversa combinada antes não aconteceu) acerta 3 de 5.

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
Teste do dono em 06/10 (conversa real, número da OBM): calendário certo ("amanhã, quarta, à tarde"). Achados: (1) barra da conversa fora do lugar, endurecida em `scroll-area.tsx` mas NÃO reproduzida, pedir novo teste; (2) aviso "Conversa marcada" chegou no grupo como "Aguardando mensagem" (falha de criptografia do WhatsApp entre o número da OBM e o grupo, provável efeito da restrição e reconexão de 03 a 05/10; não é código, o envio saiu do n8n às 11:26); (3) "consigo conversar agora" foi confirmado pela IA: regra nova na base, pede ajuda ao time em vez de prometer. Segundo teste (06/10 à tarde): agendar passa a exigir dia E horário (período sozinho pergunta o horário) e o resumo guarda o combinado que não aconteceu (ADR 2026-10-06). P1 item 4 (motivo do pedido de ajuda) FEITO em 06/10 (ADR 2026-10-06-help-request-reason). Decidido pelo dono em 06/10: "tarde" = 13h às 17h em hora cheia, só o que ainda não chegou, a IA sempre pergunta o horário (sem pedido de ajuda); fechado oferecendo ver o próximo dia com o time é aceito. 07/10: períodos automáticos pelo expediente de cada empresa (manhã até 11h, tarde 13h a 17h, noite a partir das 18h, só o que a empresa atende). Bateria do n8n 8/8 na versão publicada, zero envio ao WhatsApp. Casos instáveis da bateria medidos 5 vezes: M8 3/5, P4/P12/C3/L8/R9 4/5. O dono vai apagar o grupo de avisos e criar outro (aviso do sistema chegava como "Aguardando mensagem"); depois, escolher o grupo novo no /agente.

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
- A chave `BETA_ABERTO` saiu do codigo em 15/10/2026 (decisao do dono): teste vencido bloqueia; quem deve
  ficar livre e marcado Vitalicio na central.

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
  Relatório completo, com o que saiu diferente do contrato, em `docs/arquivo/relatorio-noite-2026-09-10.md`.
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

**Desde 10/11/2026, dados, estado e desempenho seguem `docs/plano-dados-e-estado.md`** (decisões fechadas em 11/11/2026; revisão externa feita em 11/11/2026; passo 0 entregue em 13/11/2026, próximo é o passo 1): passos 0 a 5, orçamento de desempenho na seção 3, e a frente de design só depois do passo 5 (seção 7). A leitura semanal do orçamento (B5 a B9) é registrada aqui.

**13/11/2026 (passo 0 do plano de dados):** leituras do servidor em paralelo (Pipeline, Pedidos, Agenda e o layout, que passou a ler a agenda ligada no mesmo select da sessão) e moldura no clique (`loading.tsx`) em Pipeline, Pedidos, Agenda, Painel, Equipe, Perfil, Agente, Campanhas e Nova busca, todas pela mesma peça (`components/MolduraDeCarregamento.tsx` sobre o novo `components/ui/esqueleto.tsx`). B1 medido no build de produção com a navegação atrasada 3 s: 51 a 68 ms. "A, B, volta para A" confirmou o achado 1 (a tela já visitada mostra a moldura de novo). Realtime: o DELETE chega com `old` só com a chave primária (`{"id": 4}`), então o `ContactNotes.tsx` não tira das outras abas uma nota apagada (bug visto na tela, ainda não corrigido). Os 14,8 s de 10/11 foram espera, não consulta (`statement_timeout` de 8 s; o select de `clients` nunca passou de 1,1 s executando): o pior minuto bate com o cron das 15:15 (`prospeccao_apagar_antigos` 6,1 s, `prospeccao_ativar_agendadas` 5,6 s) somado às RPCs de Campanhas num pool de 10 conexões, e a instância estava lenta por dentro (o próprio cron 6,9 s contra 0,13 s). **Pendente com o dono:** olhar no painel do Supabase (Reports, Database) CPU e orçamento de IO entre 15:10 e 15:20 UTC de 10/11; o detalhe está no passo 0 do plano.

**14/11/2026 (passo 1 do plano de dados, a Base):** decisões do dono de 14/11 registradas na seção 9.1 do plano (sem banco no clique, pré-carregar só na intenção, rotas de escrita barram conta bloqueada, sem beacon próprio, limpeza de leads antigos uma vez por dia, suítes com login fora do horário de atendimento). Entraram: TanStack Query, Zod, nuqs, react-hook-form e Vitest (`npm run test:unit`); o cliente de dados em `lib/query/`; a sessão do layout em `lib/sessao.tsx`; o menu pré-carregando na intenção (`components/LinkNaIntencao.tsx`; passar o mouse em 7 itens sem clicar fez zero leituras no Supabase); `ativa: true` em 9 rotas de escrita; `app/(app)/error.tsx`; `components/ui/form.tsx`; o webhook do Asaas em modo sombra; o orçamento no build de produção (`npm run test:orcamento`: B1 e B8 passam). **Conflito para o dono decidir:** o spec pedia que o `/login` devolvesse a pessoa à página de onde saiu, mas o ADR de 30/09 (pedidos) diz que o login não volta ao link, por segurança; ficou valendo o ADR. A suíte com login, rodada de madrugada, levou o Supabase a p90 de 9,8 s de novo: cada teste que falhou passou ao rodar sozinho ou na `main`. A bateria do n8n teve 1 falha ("conversa marcada é agendar"), que fala com o cérebro em produção (não roda o código deste branch) e passou na linha de base da mesma noite.

**14/11/2026 (passo 2, Campanhas, em parte):** as leituras de Campanhas passaram para o cache (trocar de aba e voltar da Nova busca não leem de novo; o que o servidor leu não é relido no navegador), apagar lead, lista e campanha ficou otimista (some no clique, sem o "Este lead já saiu da lista."), a aba, a lista e a campanha abertas ficam na URL (refresh e voltar mantêm), a limpeza dos leads antigos roda só às 03h, e o JS de Campanhas caiu para 472 kB. **Decidido pelo dono em 14/11 (D14 a D17 do plano):** o login não volta ao link (vale o ADR de 30/09); os gráficos ficam na abertura de Campanhas e o teto fica 480 kB; Campanhas continua lendo no servidor (D8 vale para as telas dos tenants); o Supabase continua no Free. **Disk IO (14/11):** o painel do Supabase avisou que o orçamento de IO do disco estava acabando; o banco tinha 129 MB, uns 100 MB de índice inchado em `chat_messages` e `conversations`, e cada mensagem gravava ~820 KB de WAL. `REINDEX CONCURRENTLY` às 13h23 levou o banco a 28 MB. É a causa dos 14,8 s (passo 0 do plano). Falta fazer: a mudança para `features/campanhas/`, Zod nas rotas de Campanhas, Apify e cron em modo sombra.

**14/11/2026 (tarde, sábado, passo 2 fechado):** Campanhas mudou para `features/campanhas/` (commit só de `git mv` e imports; todo caminho citado em regras, ADRs e docs foi junto, as migrações já aplicadas ficaram com o comentário antigo). As 16 rotas de `/api/admin/campanhas` passam por esquemas Zod (`features/campanhas/schemas.ts`) e respondem erro sempre pelo `erroDaRota` com `codigo`; as frases que a tela mostra são as mesmas de antes (teste Vitest). **Webhook do Apify e cron não ganharam esquema em sombra, de propósito:** o webhook não lê o corpo (pergunta à fonte como a execução terminou) e o cron não tem corpo nem query; sem payload real no repositório, escrever o esquema seria inventar. Bug do `ContactNotes` corrigido: nota apagada em outra aba agora sai da tela (o DELETE só traz o id). Orçamento: B1 de 65 a 144 ms; B8 Campanhas 474 kB, Nova busca 461 kB, telas dos tenants de 291 a 335 kB (Agente 335 e Pedidos 329 estão perto do teto de 340). O `.env.e2e.local` não tem a conta de atendente (o orçamento avisa e pula essa parte).

**14/11/2026 (fim da tarde, passo 3a, Pedidos, fechado; 3b não começou):** Pedidos é a primeira tela dos tenants no padrão novo. A página não lê o banco (a sessão vem do layout), cada bloco lê pelo cache direto do banco pelo RLS, a lista é infinita, e aba, busca, motivo e o pedido aberto ficam na URL. O realtime de Pedidos saiu da tela e foi para uma "ponte" montada uma vez no layout (`lib/realtime/`): um pedido aberto pela IA entra na lista com UMA leitura (a fila daquela conversa), e uma lista que ninguém está olhando só fica marcada como velha, sem ler nada. O menu, ao passar o mouse em Pedidos, pré-carrega a rota inteira (a página não lê banco, então não custa banco), e voltar a Pedidos não faz nenhuma requisição. Números: B1 111 ms, B2 0 requisições, B8 Pedidos 337 kB (teto 340, está perto). Portão: seriais de Pedidos, realtime e atendimento 17/17 antes e 19/19 depois (2 testes novos; o de URL foi reescrito depois da primeira rodada e passou na própria rodada; uma jornada com o cérebro real passou na segunda tentativa, é resposta do modelo); bateria do n8n 9/10 antes (a falha conhecida "conversa marcada é agendar") e 10/10 depois. Não conferi nas execuções do n8n que nenhum nó da Evolution rodou para os telefones 5500 (o banco caiu antes).
- **O banco parou de responder por volta das 17h10**, depois da suíte com login completa e das seriais (um SELECT simples dava timeout de conexão; mandei aviso no celular). Nos logs do Supabase: o último registro do Postgres é das 17h06 (20:06 UTC), um checkpoint de 517 blocos levou 54 s às 17h02 (disco sem fôlego, o mesmo sintoma do orçamento de IO do dia 14 de manhã), um `statement timeout` às 17h04, e o tick do cron das 17h10 nem registrou início. Parei todos os testes e não comecei o 3b, que precisa rodar linha de base em suíte com login. Não fiz nada no banco. **Os tamanhos dos índices de `chat_messages` e `conversations` não puderam ser medidos** pelo mesmo motivo: a consulta é `select relname, pg_size_pretty(pg_indexes_size(c.oid)), n_live_tup, n_dead_tup from pg_class c join pg_stat_user_tables s on s.relid = c.oid where relname in ('chat_messages','conversations');`.
- Na suíte completa (com o banco já lento), três seriais caíram por tempo: `clientes.serial` (Contatos), `rolagem-conversa.serial` (Conversas) e `regras-salvas.serial`; o `regras-salvas` passou rodando sozinho (28,5 s, perto do limite de 30 s), os outros dois deram timeout no `page.goto` também sozinhos, já com o banco sem responder. Rodar de novo com o banco saudável antes de aceitar o 3a. A busca do Pipeline (`pipeline.auth`) já falhava na linha de base, antes de qualquer mudança minha.
- **Achado, não corrigido:** voltar no navegador para uma entrada criada ANTES de um refresh deixa a tela como estava (o Next não ressincroniza esse "voltar"); voltar de uma entrada criada depois do refresh funciona. Campanhas tem o mesmo comportamento. Decisão sua se vale corrigir.
- Revisão do diff do 3a (commit seguinte): abrir um pedido da lista fazia uma leitura a mais por id e a volta do foco relia também a equipe e o detalhe; corrigido (hoje igual a antes). As seriais com login não rodaram depois dessa correção (banco fora).
- **Banco de volta depois do restart do dono (23h20, 14/11):** SELECT responde, API sem erro desde 22h55 (p90 de 235 a 272 ms). Índices medidos às 23h20: `chat_messages` 1,7 MB (tabela 216 kB), `conversations` 648 kB (tabela 64 kB), banco inteiro 27 MB. Não há inchaço: o reindex da manhã segurou, e o reindex da noite não é necessário por tamanho. A causa da parada foi memória: no painel (Observability e Infrastructure), swap de 500 a 570 MB o dia inteiro num Nano de ~430 MB de RAM, compromisso de memória 1,44 GB (SEVERE), e o saldo de IO do disco zerado por volta das 17h.
- **Para você decidir:** (1) o webhook do Asaas está em sombra desde 14/11; a semana fecha em 21/11, e só então dá para passar a recusar; (2) as rotas de orientar e resolver agora passam por esquema Zod com as mesmas frases; um corpo que não é JSON passa a responder "phone é obrigatório" em vez de "JSON inválido".

**15/11/2026 (madrugada, passo 3b, Contatos fechado; Pipeline, Painel e Agenda não começaram):** com o banco de volta, as seriais do 3a passaram uma a uma (Pedidos 5/5, regras-salvas, clientes 5/5, rolagem-conversa). Dois testes estavam frágeis, não o código: o da ponte de Pedidos (a fila de Abertos do tenant de teste é longa e o pedido do teste caía depois da página carregada; agora filtra pela busca e espera o canal assinar) e o paginado de Contatos (a busca também casa pelos dígitos do telefone, e um contato real criado no dia 14 tem "17" no número). Contatos migrou: o layout não lê o banco, a lista e os números vêm do cache, filtro e busca na URL, a ficha lê no navegador. **Bug achado e corrigido:** digitar na busca e clicar num contato logo em seguida perdia a ida para a ficha (a busca era gravada na URL 300 ms depois e atropelava a navegação); a busca agora vai para a URL na hora, em Contatos e em Pedidos. A conferência das fotos de perfil, que o layout de Contatos fazia a cada entrada, virou uma rota pedida pela tela no máximo a cada 10 minutos por aba. Números: B1 Contatos 86 a 93 ms, B2 0 requisições, B8 317 kB (era 309). A volta do foco relê só a primeira página de cada lista (a lista infinita relia toda página rolada, uma leitura cada). Seriais: clientes 5/5, realtime 10/10, Pedidos 5/5. **Pipeline também migrou** (01h, 15/11): a página não lê o banco, o quadro, as etapas e a equipe vêm do cache, os filtros ficam na URL, e o realtime de Pipeline passou para a ponte do layout (lê só o card da conversa que mudou). Arrastar um card continua otimista; se o banco recusar, aparece a frase e o card volta na releitura. Números: B1 113 ms, B2 0, B8 331 kB (era 325). Pipeline com login 4/4 e 3/3 antes e depois. Os testes de Pipeline passaram a esperar o quadro ficar pronto (os cards chegam do navegador depois das colunas). **Painel também migrou** (01h10): a página não lê o banco; o que ela lia e calculava no servidor virou UMA leitura do navegador com o mesmo cálculo, e a moldura do Painel aparece enquanto chega. Números: B1 69 ms, B2 0, B8 324 kB (era 301; subiu 23 kB porque o cálculo e os blocos que eram montados no servidor agora vão no JS, ainda abaixo do teto de 340). Seriais do Painel (agregado e equivalência) 3/3 antes e depois. **Desvio do plano para você ver:** o spec pedia uma consulta por bloco do Painel; fiz uma só para o Painel inteiro (manchete e gráfico de hora dependem do mesmo agregado), dividir fica para outra rodada. **Agenda também migrou** (01h, fechando o passo 3b): a página não lê o banco, a abertura (configuração, serviços, horários e a semana) vem do navegador, a semana fica na URL, e cada escrita deixa o cache da Agenda velho para a volta à tela nunca mostrar a semana antiga. A tela de configurações da agenda continua lendo no servidor (fora deste passo). O cron de lembretes passou a conferir a query em modo sombra (só registra). Teste novo com login, só leitura (`e2e/agenda.auth.spec.ts`). Números: B1 91 ms, B2 0, B8 339 kB (era 329). **Atenção ao peso:** Pedidos e Agenda estão em 339 kB, a 1 kB do teto de 340; a próxima entrega nessas rotas precisa olhar o JS antes.

**15/11/2026 (01h20, fechamento da madrugada):** verificação final com tudo junto: sem login 982 (falham só os 2 da Agenda que dependem do domingo e os picos da central, conhecidos), celular inteiro, com login 46/46, seriais 46 de 47 (a jornada 1 do atendimento com o cérebro real decidiu "pausar" em vez de "none" e passou rodando sozinha; a jornada 2 oscilou do mesmo jeito: é a resposta do modelo, o cérebro não mudou). Revisão de código do passo 3 (seis achados, todos aplicados): o Pipeline mostrava "Nenhum estágio ativo" e "Nenhuma conversa aqui" enquanto carregava (agora mostra a moldura); a volta do foco no Pipeline relia a equipe à toa; a leitura da Agenda tinha a consulta repetida (agora uma só, `lib/agenda-leitura.ts`). **Para você decidir:** (1) a rota nova `/api/contacts/fotos` continua conferindo fotos também para conta bloqueada, como o layout de Contatos fazia; ficou registrada como exceção na regra (confirmada pelo dono em 15/11: manter, bloquear dá mais trabalho sem ganho); (2) o Painel virou uma consulta só, não uma por bloco (o spec pedia por bloco); (3) Pedidos e Agenda estavam a 1 kB do teto de JS (339 de 340): decidido em 15/11 subir o teto das telas dos tenants para 360 kB (D18 do plano), a diferença é pequena e as telas já estão otimizadas. Os passos 4 (Conversas) e 5 (central) não foram começados, como pedido.
 Na suíte sem login de madrugada falharam só a central (picos, conhecida) e dois da Agenda que dependem do dia: num domingo, "amanhã" cai na semana seguinte, fora da grade.

**16/11/2026 (pacote do banco, aplicado em produção às 11h10):** conferência da branch: tipos, lint (0 erros), checar, 27 unitários, build e orçamento (26 passam, 1 pulado pela conta de atendente que falta no `.env.e2e.local`). Cinco migrações aplicadas: limpeza diária do histórico do cron (7 dias), `pg_graphql` desligado, tabelas `uqc` (de outro projeto) apagadas, `sem_acento` fora do `anon`, e o job de Campanhas só chama o servidor quando há trabalho. `REINDEX CONCURRENTLY` de novo em `chat_messages` e `conversations` (os índices tinham crescido 4 e 7 vezes com as suítes de sábado; banco em 26 MB). `pg_stat_statements` zerado às 11h15: o B9 conta daqui. Regra nova em `data.md` e ADR `2026-11-16-production-database-is-not-a-test-bench.md`. **Não feito, de propósito:** tirar o `REPLICA IDENTITY FULL` das tabelas do Realtime (os canais filtram por empresa e ninguém testou se UPDATE e DELETE filtrados continuam chegando sem a linha antiga; mexe no atendimento, precisa de teste numa tabela antes) e a limpeza dos turnos de teste da IA (a central lê essa tabela para o custo; 464 kB, não vale o risco). **Pendências do dono:** criar o segundo projeto Supabase (testes); expiração da mídia do WhatsApp em 60 dias (decidida, falta construir: rota de limpeza no Storage e o texto na tela); backup diário no VPS (por último); as 10 empresas vazias em trial; passos 4 e 5 do plano; merge e deploy.

**16/11/2026 (passo 4, Conversas, em parte):** Conversas mudou para `features/conversas/` e entrou no padrão novo. A lista e a conversa aberta não leem mais o banco no servidor: a moldura aparece no clique e os dados vêm do navegador pelo cache. Voltar a Conversas mostra a lista guardada na hora (0 requisições). O realtime da lista foi para a ponte do layout: mensagem nova continua lendo SÓ a linha dela; com a pessoa em outra tela, a lista guardada só fica marcada como velha. Período, chip e busca ficam na URL (recarregar e voltar mantêm, e abrir uma conversa leva junto). O que a pessoa está digitando fica guardado por conversa e sobrevive a recarregar. Testes: orçamento 28 passam (B1, B2 e B8 de `/inbox`), preview 174 (2 oscilaram por carga e passaram sozinhos), `realtime.serial` 11/11 (os contadores passaram a medir depois da abertura, porque abrir agora lê uma página e uma contagem do navegador; antes vinha do servidor), com login 51 passaram na mesma rodada. Índices depois dos testes: `chat_messages` 592 kB, `conversations` 160 kB (sem inchaço). **Falta:** esquemas Zod nos webhooks do n8n (só validar e registrar); rodar `atendimento.serial` e a bateria paga do n8n antes de pedir teste do atendimento (precisa do ok do dono); os contadores do menu ficaram como estavam, de propósito. **Não conferido na tela por mim:** só por teste automatizado. **Mesma manhã, com o ok do dono:** `atendimento.serial` 4/4 (um teste esperava a URL exata da conversa e agora aceita o recorte junto, `?filtro=needs`) e a bateria paga do n8n 10/10 (1 pulado). Numa execução inteira do n8n conferida (telefone 5500, turno completo), a guarda `Telefone real? (envio)` rodou e nenhum nó de envio da Evolution rodou; as demais execuções da bateria não foram abertas uma a uma. Índices depois: `chat_messages` 672 kB, `conversations` 168 kB. Os três webhooks do n8n (`/api/agent`, `/api/inbound-media`, `by-instance`) passaram a conferir o que recebem contra um esquema em modo sombra: só registram a diferença, nunca recusam. **Passo 4 fechado na branch; falta o passo 5 (central, varredura de Zod nas 43 rotas ainda sem esquema, `lib/env.ts`), o merge e o deploy.**

**16/11/2026 (13h30, passo 5, a central):** a central (`/clientes` e o detalhe) foi para `features/central/` e entrou no padrão novo, sem mudar o que o servidor lê (D16: a página continua lendo a primeira página e a guarda continua no `adminDaPagina`). As abas do detalhe leem pelo cache (o `lembrar` saiu), a volta do foco relê, e gravar limite, ação da conta ou apagar deixa a central toda velha (menos o WhatsApp, que é lido ao vivo uma vez). A lista virou lista infinita do cache. Ficam na URL: busca e situação da lista, a aba do detalhe e os filtros das abas Uso de IA e Atendimento (recarregar, voltar e link compartilhado abrem a mesma visão). **Desvio para você ver:** trocar de aba substitui a entrada do histórico em vez de empilhar; empilhando, recarregar, trocar de aba e voltar mostrava a aba errada (o nuqs não relia a URL). Voltar sai do cliente para a lista, como era antes. A lista ganhou moldura própria no clique (`clientes/loading.tsx`). Os módulos puros da central ficaram em `lib/` (o `lib/admin.ts`, que Campanhas e os avisos de IA também usam, depende deles). Testes: preview da central 261 (o teste de picos que falhava na main passou), `central-clientes.auth` 14/14, orçamento 29 (B1 e B8 de `/clientes` dentro), teste novo `central-dados.design`.

**16/11/2026 (noite, `lib/env.ts`, fim do plano de dados):** com a lista da Vercel que o dono mandou (só os nomes), o `lib/env.ts` passou a ser o único lugar que lê `process.env` (`envDoServidor`, `envPublico`). A lista do que é obrigatório e os dois esquemas Zod ficam em `lib/env-conferir.ts`, só no servidor. Se faltar uma variável obrigatória em produção, o log registra o NOME, uma vez por instância, e o sistema sobe assim mesmo: cada rota continua respondendo como antes. O lint passou a reprovar `process.env` fora do `lib/env.ts` (o `NODE_ENV` ficou literal em 4 lugares, senão a tela leva código de desenvolvimento). Foram 45 leituras trocadas, sem mudar rota. ADR `2026-11-16-env-check-logs-never-blocks-boot.md`. B8 depois: login 232 kB, telas dos tenants 306 a 341, Clientes 330, **Campanhas 480, no limite do teto de 480**. O JS total do navegador até diminuiu 1,3 kB, mas o Turbopack passou a numerar os módulos com 6 dígitos em vez de 5 e cada pedaço ficou um pouco maior. Qualquer módulo novo pode estourar o teto de Campanhas. Verificação: tipos, lint sem erro, 57 unitários, build, orçamento 29 passaram (o B2 do `/painel` falhou uma vez sob carga e passou sozinho) e `sem-login` 988 passaram. A única falha foi o preview da fila de Campanhas, que depende da hora: depois da janela de envio do dia, os dados falsos ficam sem ninguém na fila. Não tem relação com a troca e passa de manhã. **Para você:** (1) a aba Project de Production NÃO tem `ASAAS_API_KEY`, `ASAAS_ENV` nem `ASAAS_WEBHOOK_TOKEN`; veja se estão na aba Shared. Se não estiverem, a cobrança em produção roda no sandbox e o pagamento dá erro. Por isso as três ficaram como opcionais até você confirmar. (2) `BETA_ABERTO` não faz mais nada e pode ser apagada na Vercel. (3) Continua valendo rodar `npm run test:e2e:login` fora do horário de atendimento antes do merge. Sem merge, sem deploy, sem push.

**16/11/2026 (13h45, passo 5 fechado na branch, fim do plano de dados menos o `lib/env.ts`):** varredura de Zod em todas as rotas que liam entrada à mão, um commit por área (equipe, agente e conhecimento, contatos, central, agenda e envio manual, e por último cobrança e cadastro). Nenhuma rota mudou o que aceita, o status ou a frase: o esquema decide só o que a rota decidia antes de ler o banco (o JSON, o modo, o plano, o cursor), e o resto continua no handler na mesma ordem. Diferenças: a resposta recusada ganhou `codigo: "entrada_invalida"` ao lado da mesma frase, e um corpo JSON `null` (que derrubava a rota com 500) agora recebe o 400 com a frase da rota. Cadastro (`/api/signup`, público) e a query do webhook do Apify entraram em modo sombra (só registram). O `npm run checar` passou a reprovar rota que lê corpo ou query sem esquema; as 14 rotas que não leem entrada nenhuma estão na lista de isentas com o motivo (`scripts/checagens.mjs`). ADR `2026-11-16-route-schema-sweep-keeps-sentences-and-order.md`. **Números do orçamento no fechamento:** B1 41 a 178 ms nas 10 rotas do menu (Pedidos 178, Clientes 41); B2 0 requisições nas 6 áreas migradas; B3 0; B4 nos testes de escrita concorrente (unitários e Campanhas); B8 login 231 kB, telas dos tenants 306 a 340 (teto 360), Clientes 329, Campanhas 479 e Nova busca 465 (teto 480: **Campanhas está a 1 kB do teto**); B10 só a guarda; B5 a B7 sem medida (decisão de 14/11); B9 nos logs da borda das 08h às 13h de hoje: p90 50 a 275 ms, p99 231 a 519 ms, nenhum 5xx (dentro da meta). Índices depois dos testes: `chat_messages` 672 kB para 216 kB de tabela (3,1 vezes), `conversations` 168 kB para 64 kB (2,6 vezes), abaixo do alerta de 5 vezes. **Para você decidir ou fazer:** (1) a lista de variáveis da Vercel para o `lib/env.ts` e a regra de lint de `process.env`; (2) a suíte logada completa NÃO rodou: era horário de atendimento, rodei só os arquivos das rotas tocadas (Clientes 14/14; agente, conexão, fluxos principais, montagem, rotas, agenda e atendente: 21 passaram, 8 pulados porque a conta de atendente de teste não está no `.env.e2e.local`); rodar `npm run test:e2e:login` fora do horário antes do merge; (3) na central, trocar de aba agora substitui a entrada do histórico (voltar sai do cliente), por causa do problema do nuqs depois de recarregar; (4) os módulos puros da central ficaram em `lib/`; (5) os esquemas das rotas com conferência que depende do banco ficaram finos de propósito, apertar é mudança de comportamento. O esquema do Asaas continua em sombra até 21/11. Sem merge, sem deploy, sem push.

**16/11/2026 (23h51, plano de dados EM PRODUÇÃO):** merge `02a62cd` (`--no-ff` da `claude/gallant-albattani-6a26aa`, 49 commits) e push da main às 23h50; a Vercel serviu o build novo às 23h51 e o `/login` responde 200. Tudo rodou fora do horário de atendimento (23h20 em diante; as empresas atendem das 08h às 18h). **Portões:** migrações conferidas com `list_migrations`: as cinco de 16/11 batem. Há duas diferenças antigas, de antes da branch e iguais na main: `20261030043000_prospeccao_cron_job.sql` não está no registro do banco, mas o job `prospeccao_tick_5m` existe e está ativo (foi aplicado por fora), e `20261106172235_uai_qual_casa_votos_config` está no banco sem arquivo (é do outro projeto, o das tabelas `uqc`). Conferência: tipos, lint (0 erros, 10 avisos legados), `checar` 0 erro, 57 unitários, build. Orçamento: B1 75 a 102 ms nas 10 rotas do menu; B8 login 232 kB, telas dos tenants 306 a 341 (teto 360), Clientes 330, **Campanhas 480 (no teto de 480, passa)** e Nova busca 466. O B2 de `/painel` caiu duas vezes na suíte (3 pedidos de `/api/fotos` na volta) e passou sozinho. Sem login: 988 passaram, a única falha é a fila de Campanhas depois da janela de envio (conhecida); antes foi preciso apagar o `.next/dev` velho da worktree, que ainda apontava para um `instrumentation.ts` removido. Revisão do diff `75c2276..HEAD` (passos 4 e 5): nenhum achado de correção em cobrança, cadastro, envio ou atendimento; sete menores, não corrigidos: a lista da central relê todas as páginas carregadas na volta do foco; `situacao` conferida duas vezes em `/api/admin/empresas`; `lerConsulta` pega o ÚLTIMO valor de uma chave repetida (antes, o primeiro); `conferirAmbiente` também roda e registra no build da Vercel; o "corpo opcional vira `{}`" repetido em dois esquemas fora de `lib/esquema.ts`; uma `transform` que não faz nada em `corpoDoApagar`; o esquema em sombra do cadastro é frouxo demais para provar que dá para passar a recusar. Bateria do n8n antes do merge: 7 de 8 (caiu "conversa marcada é agendar", a mesma de 14/11, que fala com o cérebro de produção). Com login completa: 93 passaram, 0 falharam, 8 pulados (conta de atendente fora do `.env.e2e.local`). Índices depois da suíte: `chat_messages` 1696 kB para 232 kB de tabela (7,3 vezes) e `conversations` 656 kB para 64 kB (10,3 vezes), **acima do alerta de 5 vezes; o reindex é do dono, não foi feito**. Na main foi preciso `npm ci` (faltavam nuqs, vitest e as outras dependências novas); depois, tipos e build passaram. Bateria do n8n depois do deploy: 7 de 8, a mesma falha, nenhum caso novo. Execuções 5977, 5978, 5979 e 5989 (turno completo, 5500...): a guarda "Telefone real? (envio)" rodou e desviou, nenhum nó da Evolution rodou. **Não conferido:** os logs da Vercel (`[sombra]` e variável obrigatória faltando), porque o navegador do app não tem sessão na Vercel. **Para você:** (1) os logs da Vercel dos primeiros minutos depois das 23h51; (2) o reindex dos dois índices; (3) ver se `ASAAS_API_KEY`, `ASAAS_ENV` e `ASAAS_WEBHOOK_TOKEN` estão na aba Shared, e apagar `BETA_ABERTO`.

**12/11/2026 (campanhas):** o pacote da Campanha Lajinha está em produção (merge `7e05f55`; ADR
`2026-11-11-campaign-lock-phrases-clean-names-and-sent-text.md`): trava do robô ampliada, nome limpo,
`{saudacao}`, linha de saída nova, frases de parada novas, texto exato gravado no envio. O prompt da
OBS foi publicado com o exemplo do golpe novo (15.830 caracteres; a bancada e as regras salvas
voltaram a passar). "Campanha Lajinha primeira" está pausada; o dono cria a "Lajinha segunda" com a
mesma lista. Pendentes: tirar o fallback `prospeccao_texto_antigo` de `prospeccao_registrar_envio`
quando nenhum cron antigo puder mais chamar sem `p_texto`; decisões do dono sobre "retornarei" rápido
de uma pessoa travar e sobre "não faz sentido" no meio da conversa parar a campanha. No ensaio, o Tony
responde "Não faz sentido pra gente" agradecendo, sem confirmar que não manda mais.

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
