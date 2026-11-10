# Campanhas: a spreadsheet list's execution id is its own id, and a database refusal reaches the screen
- Date: 2026-11-10
- Status: Accepted
- Area: admin, data

## Context
On 10/11/2026, the day of the first real campaign (Lajinha/MG), the owner imported
`leads-lajinha-2026-11-09.xlsx` (68 rows, every one a valid unique mobile). The preview worked, but
"Importar 68" answered "Não deu para importar agora. Tente de novo em instantes." twice. Postgres log,
2026-11-10 15:19:56 and 15:20:34 UTC: `duplicate key value violates unique constraint
"prospeccao_buscas_execucao"`.

The unique index is `(fonte, fonte_execucao_id) where fonte_execucao_id is not null`: one search per
source run, so a webhook delivered twice never creates two searches. `gravarPlanilha` passed the
constant `"planilha"` as the execution id, so the first spreadsheet (04/11/2026,
`contatos_franck_maria_jullia`) took the only slot and every later import failed. The fix of
04/11/2026 (city optional) did not show it because that was the first spreadsheet ever saved.

Reproduced in a rolled back transaction: `prospeccao_criar_busca(..., 'planilha', 'planilha', ...)`
fails with the error above; with the new list's uuid as execution id it passes, and
`prospeccao_concluir_busca` saves the Lajinha rows (names with `|`, accents, `&`, `’`) as `pronta`.

The screen showed the generic message because the route answered 500 `falha ao importar a planilha`,
and the browser source (`recusaSe4xx`) only turns a 4xx with a reason into a sentence.

## Decision
- `gravarPlanilha` (`lib/planilha-servidor.ts`) passes the new list's own id as `execucao`. No
  migration: the index stays, and the existing row (`fonte_execucao_id = 'planilha'`) is unique and
  untouched.
- The spreadsheet route answers a database refusal (an error with a Postgres/PostgREST `code`) with
  `falhouComMotivo` (`lib/campanhas-servidor.ts`): 422 and "Não deu para importar a planilha. O banco
  respondeu: ...". Campanhas is the owner's own tool, so showing the database sentence is better than
  "tente de novo" with the cause only in the log. Anything else (network, timeout) keeps the generic
  message and the log.

## Consequences
- Any number of spreadsheets import; each one is its own list.
- A future source without a real run id must pass the search id, never a constant.
- The other Campanhas routes keep `falhou` (detail only in the log); use `falhouComMotivo` where the
  owner needs to read the cause on the screen.
