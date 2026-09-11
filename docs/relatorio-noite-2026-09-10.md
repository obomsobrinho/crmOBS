# Relatório da noite de 10 para 11/09/2026

Cinco contratos do plano da demo, executados sozinho, na ordem. **Os cinco fecharam.** Todas as
suítes verdes no fim: 116 sem login, 21 com login (1 pulado) duas vezes seguidas, 12 de 12 no
projeto `ia`, `tsc` 0, `eslint` 0, `npm run build` limpo. Árvore limpa, `git push origin main` feito.

## Contratos e commits

| | Contrato | Commit |
|---|---|---|
| ✅ C1 | Workflows do n8n versionados | `4f390a4` |
| ✅ C2 | Textos dos quatro e-mails do Supabase Auth | `9cc5f69` |
| ✅ C3 | O app diz quando o WhatsApp caiu | `dac1226` |
| ✅ C4 | As 12 armadilhas rodam por comando | `ccd52a3` |
| ⚠️ C5 | Trocar de conversa mais rápido | `ca4f1ee` |

**C5 fechou, mas a meta do título não.** "Menos da metade" virou 35 a 40% a menos: conversa de 1
mensagem foi de 656 e 791 ms para 445 e 469 ms de TTFB (duas rodadas antes, duas depois, 9
navegações cada, `npm run dev` na sua máquina). O que sobra é a cadeia em série que a arquitetura
ainda impõe: `getUser` no `proxy.ts`, `getUser` de novo no `getMyClient`, depois as consultas. Os
887 -> 402 ms do achado A1 mediam só o bloco da página, não o request inteiro. Próximo corte, se
quiser: passar o usuário do proxy para o render e o `staleTimes.dynamic`. Região na Vercel ficou de
fora, como decidido.

## Delegação

**Nada foi delegado.** O C1 e o C2 permitiam, mas o C1 exigiria colar o segredo no prompt do
subagente (ele aparece no JSON exportado), e o C2 são quatro e-mails curtos: escrever era mais
barato que briefar. Toda verificação foi minha: `tsc`, `eslint`, `build` e as suítes rodaram na
minha mão depois de cada contrato, e a bateria da IA foi conferida também no banco (`agent_turns`:
26 turnos `dry_run`, 4 bloqueios do guardrail, ~92 mil tokens de entrada nas duas rodadas).

## O que descobri e não estava no contrato

1. **O `x-lookup-secret` estava em DOIS nós do OBS Atendimento**, `Atendente` e `Sobe mídia
   recebida`. O plano dizia um. Os dois viraram `{{N8N_LOOKUP_SECRET}}`. Quando rotacionar o
   segredo (item "dono acordado"), são duas pontas no n8n, não uma.
2. **O `pinData` do workflow carregava a apikey da Evolution e um telefone real** dentro do payload
   de exemplo do `Webhook EVO`. Saiu do export. Está no n8n de produção ainda; limpar é seu.
3. **O `Sticky README` do workflow está desatualizado** (fala em "v2" e em número fixo no nó
   `Rotas`) e tinha um telefone pessoal escrito, que removi só no export.
4. **Caso 10 da bateria (injeção com autoridade) devolveu `none` duas vezes seguidas**, com resposta
   contida. Em 28/08 tinha dado `pausar`. É o mesmo caso do 4: a ANTI-MANIPULAÇÃO manda responder e
   seguir. O teste aceita `none` ou `pausar` ali, com o motivo escrito no spec. Se você quiser que
   injeção SEMPRE abra handoff, é mexer no prompt, e o teste vai apontar.
5. **Projeto Playwright condicional precisa de env, não de argv.** Os workers recarregam o config
   sem os argumentos, e a primeira rodada do `ia` falhou inteira com "Project ia not found". A
   decisão é copiada para `E2E_IA`, que o worker herda. Está comentado no config.
6. **A Loja Teste está com o WhatsApp `open`**: o aviso novo não apareceu nas telas reais durante
   a suíte, então o e2e com login força `close` interceptando a rota. Queda real segue sem teste.
7. **`getMyClient` memoizado tem uma consequência para quem escreve rota:** dentro do MESMO request,
   gravar em `clients` e chamar `getMyClient()` de novo devolve o valor antigo. Está no `CLAUDE.md`.

## O que ficou para você

- **Aplicar os e-mails** no painel do Supabase (`docs/emails-supabase.md`) e trocar o "Sender name"
  para o nome de `lib/brand.ts`.
- **Decidir sobre o caso 10** (item 4 acima). Sem decisão, o teste segue aceitando os dois.
- **Limpar o `pinData` e o Sticky do workflow** no n8n (itens 2 e 3). Não toquei no n8n.

## Onde cada coisa está documentada

`CLAUDE.md` ganhou quatro trechos (n8n versionado, aviso de WhatsApp, projeto `ia`, memoização).
`docs/proximos-passos.md` tem os cinco contratos marcados, com o que saiu diferente em cada um.
`n8n/README.md` diz como restaurar um workflow. `e2e/README.md` diz como rodar o `ia`.
