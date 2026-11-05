# Campanhas: delete campaigns and lists, triage leads, and show the queue forecast
- Date: 2026-11-05
- Status: Accepted (six adjustments asked by the owner on 04/11/2026; the decisions below were taken without him, on his instruction to pick the safest option, and are his to revisit)
- Area: admin, product

## Context
The owner tested Campanhas on 04/11/2026 and asked for: tabs with Campanhas first, delete a campaign and
a lead list, the X on a lead really removing it (with a confirmation), the "bom" marker working as a
favorite for triage, a button to re-center the map, and the send order with the forecast of each pending
contact.

Deleting is not free here. `prospeccao_campanha_leads` is the mark that a lead already received a message
(one message per lead, never two) and the list the cron watches for a SAIR
(`prospeccao_em_observacao`). `prospeccao_leads.busca_id` is `on delete restrict`. A hard delete of a
campaign would make contacted leads look new again.

## Decision
- **Soft delete with `apagada_em`** on `prospeccao_campanhas` and `prospeccao_buscas`. There was no soft
  delete in these tables. The row leaves the tables, the counts, the selects and the map circles; what it
  protects stays. Each delete is ONE SQL function with its `admin_acoes` row.
- **Campaign** (`prospeccao_apagar_campanha`): running or scheduled is refused ("pause first",
  `campanhaAindaEnvia`). Leads still in the queue leave the campaign and are free again. Sent, replied,
  failed and stopped rows stay. A paused campaign becomes `concluida`, so an old tab cannot resume it.
- **List** (`prospeccao_apagar_busca`): refused while the search runs and while one of its leads is in a
  queue. Leads leave the list; a lead with no other list, no campaign and no SAIR leaves the base (a hard
  delete, a new search can bring it back); the others stay in Todos os leads.
- **Lead** (`prospeccao_remover_lead`, the X, with a confirmation): refused while in a queue. Inside a list
  it leaves that list, with the same rule for the base. A lead that stays because of its history becomes
  `descartado`, the state the old X set, which keeps it out of every campaign even with "incluir quem já
  participou". In Todos os leads the X exists only for a lead that can leave the base.
- **Triage**: "bom" stays the only positive mark, now a heart toggle with a "Só os bons" shortcut over the
  table. `marcacao` accepts only `bom` and `descartado`; a second level for "reasonable" would be a new
  value, which is the owner's call.
- **Forecast**: `previsaoDaFila` (`lib/prospeccao.ts`) walks the cron's own `proximoEnvioEm` with the draw at
  the middle of the band, from the stored `proximo_envio_em`, resetting the count each day. The table is
  already in cron order (`ordem`); `prospeccao_leads_da_campanha` now also returns `ordem` and
  `posicao_na_fila`. A paused campaign shows no time: nothing goes out until it resumes.
- **Opening tab**: the page opens on Campanhas, the first tab, and reads that tab on the server; back from
  Nova busca it opens on Leads (`?aba=leads`).

## Consequences
- A deleted campaign's sends still count in the all-campaigns results, and its name stays on the lead's
  chip: they are real messages, and the chip is the mark of contact.
- The X no longer has an undo. A lead already `descartado` stays dimmed and out of campaigns; marking it
  "bom" clears that.
- Removing a lead rereads the screen through `versao`, the pattern of these admin tables.
- The forecast is an estimate: the real time is drawn inside the band, and a failed or stopped lead moves
  the next ones earlier. The screen says so.

## Evidence
Both migrations were applied after tests in a transaction that always rolled back: a running campaign
refused, a paused one deleted with its queue gone and its sent row kept, a list refused with a lead in a
queue and while searching, a contacted lead removed from a list and then out of
`prospeccao_leads_do_filtro` with contacted included, a free lead gone from the base, a second delete
answering `nao_encontrada`. Production had 3 lists, 4 campaigns and 52 leads, none running.
