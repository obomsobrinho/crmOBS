# Handoff: Campanhas v2 backend

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
